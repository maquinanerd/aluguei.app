import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Contrato de compra e venda (Onda 5), sobre os modelos versionados e o
 * envelope de assinatura que já existiam.
 *
 * O que o teste protege:
 * 1. **Modelo de locação não vira contrato de venda.** As duas espécies falam
 *    de partes diferentes; usar o modelo errado poria cláusula de aluguel num
 *    documento de venda.
 * 2. **As partes são comprador e vendedor**, não inquilino e locador.
 * 3. **O texto sai com o preço da negociação**, formatado em R$.
 * 4. **A negociação precisa estar em Contrato** — gerar antes é atalho que vira
 *    retrabalho.
 */

interface Agregado {
  contract: { id: string; kind: string; negotiationId: string | null; content: string | null };
  parties: { role: string; partyId: string }[];
}

describe('Onda 5 — contrato de compra e venda', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;
  let propertyId = '';
  let buyerPartyId = '';
  let sellerPartyId = '';
  let templateVendaId = '';
  let templateLocacaoId = '';

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ILIMITADO');

    const imovel = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Cobertura 210 m2', propertyType: 'APARTMENT', purpose: 'SALE' },
    });
    propertyId = (imovel.body.property as { id: string }).id;

    const vendedor = await call(app, 'POST', '/parties', {
      cookie: agencia.cookie,
      payload: {
        type: 'PERSON',
        name: 'Dona do Imovel',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    sellerPartyId = (vendedor.body.party as { id: string }).id;
    const vinculo = await call(app, 'POST', `/properties/${propertyId}/owners`, {
      cookie: agencia.cookie,
      payload: { partyId: sellerPartyId, ownershipSharePct: 100 },
    });
    expect(vinculo.status, JSON.stringify(vinculo.body)).toBe(201);

    const comprador = await call(app, 'POST', '/parties', {
      cookie: agencia.cookie,
      payload: {
        type: 'PERSON',
        name: 'Otavio Prado',
        identities: [{ kind: 'CPF', value: '11144477735' }],
      },
    });
    buyerPartyId = (comprador.body.party as { id: string }).id;

    templateVendaId = await criarTemplate(
      'Compra e venda à vista',
      'SALE',
      'O vendedor {{sellerName}} vende a {{buyerName}} o imóvel {{propertyTitle}} por {{salePrice}}.',
    );
    templateLocacaoId = await criarTemplate(
      'Locação residencial',
      'LEASE',
      'O locador {{landlordName}} aluga a {{tenantName}} por {{monthlyRent}}.',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function criarTemplate(name: string, kind: string, body: string): Promise<string> {
    const criado = await call(app, 'POST', '/contract-templates', {
      cookie: agencia.cookie,
      payload: { name, kind, body },
    });
    expect(criado.status, JSON.stringify(criado.body)).toBe(201);
    const id = (criado.body.template as { id: string }).id;
    const aprovado = await call(app, 'PATCH', `/contract-templates/${id}/approve`, {
      cookie: agencia.cookie,
    });
    expect(aprovado.status, JSON.stringify(aprovado.body)).toBe(200);
    return id;
  }

  async function negociacaoEmContrato(): Promise<string> {
    const criada = await call(app, 'POST', '/sale-negotiations', {
      cookie: agencia.cookie,
      payload: { propertyId, buyerPartyId, offerAmountCents: 139_000_000, commissionBps: 500 },
    });
    const id = (criada.body as { negotiation: { id: string } }).negotiation.id;
    for (const stage of ['DOCUMENTATION', 'CONTRACT']) {
      const passo = await call(app, 'POST', `/sale-negotiations/${id}/stage`, {
        cookie: agencia.cookie,
        payload: { stage },
      });
      expect(passo.status, `${stage}: ${JSON.stringify(passo.body)}`).toBe(200);
    }
    return id;
  }

  it('gera o contrato com comprador e vendedor, e o preço da negociação no texto', async () => {
    const negotiationId = await negociacaoEmContrato();
    const criado = await call(app, 'POST', '/contracts', {
      cookie: agencia.cookie,
      payload: { negotiationId, templateId: templateVendaId },
    });
    expect(criado.status, JSON.stringify(criado.body)).toBe(201);
    const agregado = criado.body as unknown as Agregado;
    expect(agregado.contract.kind).toBe('SALE');
    expect(agregado.contract.negotiationId).toBe(negotiationId);

    const papeis = agregado.parties.map((parte) => parte.role).sort();
    expect(papeis).toEqual(['BUYER', 'SELLER']);
    expect(agregado.parties.find((parte) => parte.role === 'BUYER')?.partyId).toBe(buyerPartyId);
    expect(agregado.parties.find((parte) => parte.role === 'SELLER')?.partyId).toBe(sellerPartyId);

    const gerado = await call(app, 'POST', `/contracts/${agregado.contract.id}/generate`, {
      cookie: agencia.cookie,
    });
    expect(gerado.status, JSON.stringify(gerado.body)).toBe(200);
    // A geração devolve o agregado embrulhado em `contract`, diferente da
    // criação — a forma é do endpoint que já existia, não desta onda.
    const texto =
      (gerado.body as unknown as { contract: Agregado }).contract.contract.content ?? '';
    expect(texto).toContain('Otavio Prado');
    expect(texto).toContain('Dona do Imovel');
    expect(texto).toContain('R$ 1.390.000,00');
    // Nada de centavo cru nem de travessão no lugar do preço.
    expect(texto).not.toContain('139000000');
    expect(texto).not.toContain('—');
  });

  it('recusa modelo de locação num contrato de venda', async () => {
    const negotiationId = await negociacaoEmContrato();
    const res = await call(app, 'POST', '/contracts', {
      cookie: agencia.cookie,
      payload: { negotiationId, templateId: templateLocacaoId },
    });
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/compra e venda/);
  });

  it('exige a negociação em Contrato', async () => {
    const criada = await call(app, 'POST', '/sale-negotiations', {
      cookie: agencia.cookie,
      payload: { propertyId, buyerPartyId, offerAmountCents: 100_000_000 },
    });
    const id = (criada.body as { negotiation: { id: string } }).negotiation.id;
    const res = await call(app, 'POST', '/contracts', {
      cookie: agencia.cookie,
      payload: { negotiationId: id, templateId: templateVendaId },
    });
    expect(res.status).toBe(409);
  });

  it('não aceita candidatura e negociação ao mesmo tempo', async () => {
    const negotiationId = await negociacaoEmContrato();
    const res = await call(app, 'POST', '/contracts', {
      cookie: agencia.cookie,
      payload: {
        negotiationId,
        applicationId: '00000000-0000-0000-0000-000000000000',
        templateId: templateVendaId,
      },
    });
    expect(res.status).toBe(400);
  });
});
