import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { saleNegotiations } from '@aluguei/db';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { Json, RegisteredAgency } from './platform-fixtures.js';

/**
 * Negociação de venda (Onda 5).
 *
 * O que estes testes seguram, em ordem de importância:
 * 1. **O histórico não se perde.** Cada proposta e contraproposta vira evento;
 *    nada sobrescreve o valor anterior — é a conversa que a imobiliária usa
 *    para negociar.
 * 2. **A comissão fecha.** A soma das partes é exatamente a comissão, e a
 *    comissão passa a sair do valor que fechou.
 * 3. **Etapa encerrada não volta a andar**, e perder exige motivo.
 * 4. **A frente é do módulo VENDAS**: plano sem o módulo recebe 403.
 */

interface Detalhe {
  id: string;
  stage: string;
  currentAmountCents: number | null;
  closedAmountCents: number | null;
  commissionCents: number | null;
  documents: { provided: number; total: number };
  events: { id: string; kind: string; amountCents: number; outcome: string }[];
  commissionShares: { role: string; percentBps: number; amountCents: number }[];
}

describe('Onda 5 — negociação de venda', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;
  let propertyId = '';
  let buyerPartyId = '';

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ILIMITADO');

    const imovel = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Cobertura 210 m2', propertyType: 'APARTMENT', purpose: 'SALE' },
    });
    propertyId = (imovel.body.property as { id: string }).id;

    const comprador = await call(app, 'POST', '/parties', {
      cookie: agencia.cookie,
      payload: {
        type: 'PERSON',
        name: 'Otavio Prado',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    expect(comprador.status, JSON.stringify(comprador.body)).toBe(201);
    buyerPartyId = (comprador.body.party as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function criar(payload: Json = {}): Promise<Detalhe> {
    const res = await call(app, 'POST', '/sale-negotiations', {
      cookie: agencia.cookie,
      payload: { propertyId, buyerPartyId, commissionBps: 500, ...payload },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { negotiation: Detalhe }).negotiation;
  }

  it('nasce com o pedido e a proposta já no histórico', async () => {
    const negociacao = await criar({
      askingPriceCents: 145_000_000,
      offerAmountCents: 130_000_000,
    });
    expect(negociacao.stage).toBe('PROPOSAL');
    expect(negociacao.events.map((evento) => evento.kind)).toEqual(['ASKING', 'BUYER_OFFER']);
    expect(negociacao.currentAmountCents).toBe(130_000_000);
    // 5% sobre o que está em jogo.
    expect(negociacao.commissionCents).toBe(6_500_000);
  });

  it('contraproposta e resposta viram histórico, sem apagar o anterior', async () => {
    const criada = await criar({ askingPriceCents: 145_000_000, offerAmountCents: 130_000_000 });
    const oferta = criada.events.find((evento) => evento.kind === 'BUYER_OFFER');
    expect(oferta).toBeDefined();

    const recusa = await call(
      app,
      'POST',
      `/sale-negotiations/${criada.id}/events/${oferta?.id ?? ''}/answer`,
      { cookie: agencia.cookie, payload: { outcome: 'REJECTED' } },
    );
    expect(recusa.status, JSON.stringify(recusa.body)).toBe(200);

    const contra = await call(app, 'POST', `/sale-negotiations/${criada.id}/events`, {
      cookie: agencia.cookie,
      payload: { kind: 'SELLER_COUNTER', amountCents: 142_000_000 },
    });
    expect(contra.status).toBe(201);
    const depois = (contra.body as { negotiation: Detalhe }).negotiation;

    expect(depois.stage).toBe('COUNTER');
    expect(depois.currentAmountCents).toBe(142_000_000);
    // Os três valores continuam lá: o histórico é a negociação.
    expect(depois.events.map((evento) => evento.amountCents)).toEqual([
      145_000_000, 130_000_000, 142_000_000,
    ]);
    expect(depois.events[1]?.outcome).toBe('REJECTED');

    // Responder duas vezes é engano.
    const denovo = await call(
      app,
      'POST',
      `/sale-negotiations/${criada.id}/events/${oferta?.id ?? ''}/answer`,
      { cookie: agencia.cookie, payload: { outcome: 'ACCEPTED' } },
    );
    expect(denovo.status).toBe(404);
  });

  it('a comissão fecha exatamente, dividida entre captador e vendedor', async () => {
    const criada = await criar({ offerAmountCents: 139_000_000 });
    const comissao = await call(app, 'PUT', `/sale-negotiations/${criada.id}/commission`, {
      cookie: agencia.cookie,
      payload: {
        commissionBps: 500,
        shares: [
          { role: 'CAPTADOR', percentBps: 4_000 },
          { role: 'VENDEDOR', percentBps: 6_000 },
        ],
      },
    });
    expect(comissao.status, JSON.stringify(comissao.body)).toBe(200);
    const detalhe = (comissao.body as { negotiation: Detalhe }).negotiation;
    expect(detalhe.commissionCents).toBe(6_950_000);
    const soma = detalhe.commissionShares.reduce((acc, parte) => acc + parte.amountCents, 0);
    expect(soma).toBe(6_950_000);
    expect(detalhe.commissionShares).toContainEqual(
      expect.objectContaining({ role: 'CAPTADOR', amountCents: 2_780_000 }),
    );
  });

  it('participações que não somam 100% são recusadas', async () => {
    const criada = await criar({ offerAmountCents: 139_000_000 });
    const res = await call(app, 'PUT', `/sale-negotiations/${criada.id}/commission`, {
      cookie: agencia.cookie,
      payload: {
        commissionBps: 500,
        shares: [
          { role: 'CAPTADOR', percentBps: 4_000 },
          { role: 'VENDEDOR', percentBps: 5_000 },
        ],
      },
    });
    expect(res.status).toBe(400);
  });

  it('não pula etapa, exige motivo para perder e não ressuscita encerrada', async () => {
    const criada = await criar({ offerAmountCents: 100_000_000 });

    const pulo = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
      cookie: agencia.cookie,
      payload: { stage: 'CONTRACT' },
    });
    expect(pulo.status).toBe(400);

    const semMotivo = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
      cookie: agencia.cookie,
      payload: { stage: 'LOST' },
    });
    expect(semMotivo.status).toBe(400);

    const perdida = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
      cookie: agencia.cookie,
      payload: { stage: 'LOST', reason: 'Comprador desistiu' },
    });
    expect(perdida.status, JSON.stringify(perdida.body)).toBe(200);

    const ressuscitar = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
      cookie: agencia.cookie,
      payload: { stage: 'PROPOSAL' },
    });
    expect(ressuscitar.status).toBe(400);

    // Encerrada também não recebe proposta nova.
    const proposta = await call(app, 'POST', `/sale-negotiations/${criada.id}/events`, {
      cookie: agencia.cookie,
      payload: { kind: 'BUYER_OFFER', amountCents: 110_000_000 },
    });
    expect(proposta.status).toBe(409);
  });

  it('fechar usa o valor que fechou, e o painel do mês conta o que fechou', async () => {
    const criada = await criar({ offerAmountCents: 120_000_000 });
    for (const stage of ['DOCUMENTATION', 'CONTRACT']) {
      const passo = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
        cookie: agencia.cookie,
        payload: { stage },
      });
      expect(passo.status, `${stage}: ${JSON.stringify(passo.body)}`).toBe(200);
    }
    const fechada = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
      cookie: agencia.cookie,
      payload: { stage: 'CLOSED', closedAmountCents: 125_000_000 },
    });
    expect(fechada.status, JSON.stringify(fechada.body)).toBe(200);
    const detalhe = (fechada.body as { negotiation: Detalhe }).negotiation;
    expect(detalhe.closedAmountCents).toBe(125_000_000);
    // A comissão passa a sair do valor que fechou, não do último em jogo.
    expect(detalhe.commissionCents).toBe(6_250_000);

    const painel = await call(app, 'GET', '/sale-negotiations/summary', {
      cookie: agencia.cookie,
    });
    expect(painel.status, JSON.stringify(painel.body)).toBe(200);
    const corpo = painel.body as {
      closed: { count: number; volumeCents: number; commissionCents: number };
    };
    expect(corpo.closed.count).toBeGreaterThanOrEqual(1);
    expect(corpo.closed.volumeCents).toBeGreaterThanOrEqual(125_000_000);
  });

  it('o mês do painel é o civil de São Paulo: 23h30 do último dia ainda é o mesmo mês', async () => {
    // Onda 0 da rodada de fidelidade, defeito 12: o recorte era em UTC, e o fechamento entre 21h
    // e meia-noite do último dia caía no mês seguinte.
    const criada = await criar({ offerAmountCents: 77_700_000 });
    for (const stage of ['DOCUMENTATION', 'CONTRACT', 'CLOSED']) {
      const passo = await call(app, 'POST', `/sale-negotiations/${criada.id}/stage`, {
        cookie: agencia.cookie,
        payload: stage === 'CLOSED' ? { stage, closedAmountCents: 77_700_000 } : { stage },
      });
      expect(passo.status, `${stage}: ${JSON.stringify(passo.body)}`).toBe(200);
    }
    // 31/03/2025 às 23h30 em São Paulo = 01/04/2025 às 02h30 em UTC. Mês fixo e no passado:
    // nenhum outro teste fecha negócio em março ou abril de 2025, então os volumes são exatos.
    await app.db
      .update(saleNegotiations)
      .set({ closedAt: new Date('2025-04-01T02:30:00.000Z') })
      .where(eq(saleNegotiations.id, criada.id));

    const volumeDo = async (mes: string): Promise<number> => {
      const res = await call(app, 'GET', `/sale-negotiations/summary?month=${mes}`, {
        cookie: agencia.cookie,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      return (res.body as { closed: { volumeCents: number } }).closed.volumeCents;
    };
    expect(await volumeDo('2025-03')).toBe(77_700_000);
    expect(await volumeDo('2025-04')).toBe(0);
  });

  it('documentos contam "N de M" sem duplicar o mesmo item', async () => {
    const criada = await criar({ offerAmountCents: 100_000_000 });
    for (const label of ['Matricula atualizada', 'Certidao de onus reais']) {
      await call(app, 'PUT', `/sale-negotiations/${criada.id}/documents`, {
        cookie: agencia.cookie,
        payload: { side: 'PROPERTY', label, provided: true },
      });
    }
    const res = await call(app, 'PUT', `/sale-negotiations/${criada.id}/documents`, {
      cookie: agencia.cookie,
      // Mesmo documento de novo: atualiza, não duplica.
      payload: { side: 'PROPERTY', label: 'Matricula atualizada', provided: false },
    });
    const detalhe = (res.body as { negotiation: Detalhe }).negotiation;
    expect(detalhe.documents).toEqual({ provided: 1, total: 2 });
  });

  it('o quadro lista com etapa vazia contando zero', async () => {
    // Regressão: a contagem só trazia as etapas povoadas e o contrato exige as
    // seis. Quadro recém-começado — o caso comum — derrubava a lista inteira,
    // e a tela mostrava erro de validação no lugar das negociações.
    const nova = await registerAgency(app);
    await approveAgency(app, nova.org.id, 'ILIMITADO');

    const vazio = await call(app, 'GET', '/sale-negotiations', { cookie: nova.cookie });
    expect(vazio.status, JSON.stringify(vazio.body)).toBe(200);
    expect(vazio.body.byStage).toEqual({
      PROPOSAL: 0,
      COUNTER: 0,
      DOCUMENTATION: 0,
      CONTRACT: 0,
      CLOSED: 0,
      LOST: 0,
    });

    const res = await call(app, 'GET', '/sale-negotiations', { cookie: agencia.cookie });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const byStage = res.body.byStage as Record<string, number>;
    expect(Object.keys(byStage).sort()).toEqual([
      'CLOSED',
      'CONTRACT',
      'COUNTER',
      'DOCUMENTATION',
      'LOST',
      'PROPOSAL',
    ]);
    // A soma das colunas é o total de negociações da imobiliária.
    const soma = Object.values(byStage).reduce((acc, n) => acc + n, 0);
    expect(soma).toBe(res.body.total);
  });

  it('plano sem o módulo Vendas recebe 403', async () => {
    const semVendas = await registerAgency(app);
    await approveAgency(app, semVendas.org.id, 'ESSENCIAL');
    const res = await call(app, 'GET', '/sale-negotiations', { cookie: semVendas.cookie });
    expect(res.status).toBe(403);
    expect((res.body as { details?: { reason?: string } }).details?.reason).toBe(
      'PLAN_MODULE_NOT_INCLUDED',
    );
  });
});
