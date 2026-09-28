import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { searchAlerts } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';

/**
 * Demanda por bairro (Onda 4). É o único dado que atravessa a fronteira portal
 * → painel, então o teste protege, em ordem:
 *
 * 1. **Nenhum contato atravessa.** Quem criou o alerta deixou e-mail ou
 *    WhatsApp para ser avisado de imóvel, não para virar lista de uma
 *    imobiliária. A resposta é contagem, e o teste varre o corpo inteiro.
 * 2. **Só alerta confirmado conta.** `PENDING` é alguém que ainda não
 *    confirmou; contar isso inflaria a demanda com intenção não confirmada.
 * 3. **Recorte é a carteira de quem pergunta**, não o portal inteiro.
 */

const CONTATO = 'quem-procura-imovel@example.com';

describe('Onda 4 — demanda por bairro', () => {
  let app: FastifyInstance;
  let db: AppDb;

  beforeAll(async () => {
    app = await buildTestApp();
    db = app.db as AppDb;
  });

  afterAll(async () => {
    await app.close();
  });

  async function criarAlerta(
    citySlug: string,
    neighborhoodSlug: string,
    status: 'PENDING' | 'ACTIVE',
  ): Promise<void> {
    await db.insert(searchAlerts).values({
      purpose: 'RENT',
      citySlug,
      neighborhoodSlug,
      contactKind: 'EMAIL',
      contactValue: CONTATO,
      consentText: 'Aceito receber avisos de novos imóveis desta busca.',
      status,
      // Mesmo formato do token de uso único da API (sha256 hex); aqui só
      // precisa ser único, porque o teste não usa o link de confirmação.
      tokenHash: createHash('sha256')
        .update(`token-${citySlug}-${neighborhoodSlug}-${status}-${String(Math.random())}`)
        .digest('hex'),
      ...(status === 'ACTIVE' ? { confirmedAt: new Date() } : {}),
    });
  }

  /** Um anúncio publicado no bairro — é o que põe a cidade na carteira. */
  async function publicarEm(cookie: string, neighborhood: string): Promise<void> {
    const criado = await call(app, 'POST', '/properties', {
      cookie,
      payload: {
        title: `Imóvel ${neighborhood}`,
        propertyType: 'APARTMENT',
        purpose: 'RENT',
        bedrooms: 2,
        builtAreaSqm: 70,
      },
    });
    expect(criado.status, JSON.stringify(criado.body)).toBe(201);
    const propertyId = (criado.body.property as { id: string }).id;

    const endereco = await call(app, 'PUT', `/properties/${propertyId}/address`, {
      cookie,
      payload: {
        privateAddress: { street: 'Rua Privada', number: '123', zipCode: '74000-000' },
        publicAddress: { neighborhood, city: 'Goiânia', state: 'GO' },
      },
    });
    expect(endereco.status, JSON.stringify(endereco.body)).toBe(200);

    const termos = await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie,
      payload: { monthlyRentCents: 180_000, condoFeeCents: 40_000, iptuCents: 10_000 },
    });
    expect(termos.status, JSON.stringify(termos.body)).toBe(200);

    const listing = await call(app, 'POST', '/listings', {
      cookie,
      payload: { propertyId, title: `Anúncio ${neighborhood}` },
    });
    expect(listing.status, JSON.stringify(listing.body)).toBe(201);
    const listingId = (listing.body.listing as { id: string }).id;
    for (const status of ['READY', 'PUBLISHED']) {
      const mudou = await call(app, 'PATCH', `/listings/${listingId}/status`, {
        cookie,
        payload: { status },
      });
      expect(mudou.status, `${status}: ${JSON.stringify(mudou.body)}`).toBe(200);
    }
  }

  it('sem anúncio publicado, não inventa cidade: devolve vazio', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id, 'ESSENCIAL');
    const res = await call(app, 'GET', '/reporting/demand-by-neighborhood', {
      cookie: agency.cookie,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ city: null, totalActiveAlerts: 0, rows: [] });
  });

  it('conta só alerta confirmado e nunca devolve o contato de quem criou', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id, 'ESSENCIAL');
    await publicarEm(agency.cookie, 'Setor Bueno');

    await criarAlerta('goiania-go', 'setor-bueno', 'ACTIVE');
    await criarAlerta('goiania-go', 'setor-bueno', 'ACTIVE');
    // Quem ainda não confirmou não é demanda: contaria intenção não confirmada.
    await criarAlerta('goiania-go', 'setor-bueno', 'PENDING');
    await criarAlerta('goiania-go', 'setor-oeste', 'ACTIVE');

    const res = await call(app, 'GET', '/reporting/demand-by-neighborhood?city=goiania-go', {
      cookie: agency.cookie,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const corpo = res.body as {
      city: string | null;
      cityLabel: string | null;
      totalActiveAlerts: number;
      rows: {
        neighborhoodSlug: string;
        neighborhood: string;
        count: number;
        published: number;
      }[];
    };
    expect(corpo.city).toBe('goiania-go');
    expect(corpo.totalActiveAlerts).toBe(3);

    const bueno = corpo.rows.find((linha) => linha.neighborhoodSlug === 'setor-bueno');
    expect(bueno).toBeDefined();
    expect(bueno?.count).toBe(2);
    // O nome vem do endereço cadastrado, com acento e caixa, não do slug.
    expect(bueno?.neighborhood).toBe('Setor Bueno');
    // Quantos anúncios a imobiliária já tem ali: sem isso a contagem não é acionável.
    expect(bueno?.published).toBe(1);

    const oeste = corpo.rows.find((linha) => linha.neighborhoodSlug === 'setor-oeste');
    expect(oeste?.count).toBe(1);
    expect(oeste?.published).toBe(0);

    const cru = JSON.stringify(res.body);
    expect(cru).not.toContain(CONTATO);
    expect(cru).not.toContain('tokenHash');
    expect(cru.toLowerCase()).not.toContain('contact');
  });

  it('não enxerga cidade onde não publica', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id, 'ESSENCIAL');
    await publicarEm(agency.cookie, 'Setor Marista');
    await criarAlerta('sao-paulo-sp', 'pinheiros', 'ACTIVE');

    const res = await call(app, 'GET', '/reporting/demand-by-neighborhood?city=sao-paulo-sp', {
      cookie: agency.cookie,
    });
    expect(res.status).toBe(200);
    // Pedir uma cidade fora da carteira não abre o portal inteiro.
    expect((res.body as { city: string | null }).city).toBeNull();
  });

  it('exige sessão e permissão de relatório', async () => {
    const res = await call(app, 'GET', '/reporting/demand-by-neighborhood');
    expect(res.status).toBe(401);
  });
});
