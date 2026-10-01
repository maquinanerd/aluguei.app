import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Prontidão para publicar (Onda 4).
 *
 * O ponto do teste é a **coerência entre o diálogo e o portão**: o que a rota
 * lista como bloqueio tem de ser exatamente o que a publicação recusa. Diálogo
 * com régua própria é pior do que diálogo nenhum — a pessoa resolve o que a
 * tela pediu e leva o erro assim mesmo.
 */

describe('Onda 4 — prontidão para publicar', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ESSENCIAL');
  });

  afterAll(async () => {
    await app.close();
  });

  async function criarAnuncio(): Promise<{ listingId: string; propertyId: string }> {
    const criado = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Imóvel prontidão', propertyType: 'APARTMENT', purpose: 'RENT' },
    });
    const propertyId = (criado.body.property as { id: string }).id;
    const listing = await call(app, 'POST', '/listings', {
      cookie: agencia.cookie,
      payload: { propertyId, title: 'Anúncio prontidão' },
    });
    return { listingId: (listing.body.listing as { id: string }).id, propertyId };
  }

  it('lista os bloqueios que o portão realmente aplica, e o portão recusa o mesmo', async () => {
    const { listingId } = await criarAnuncio();

    const prontidao = await call(app, 'GET', `/listings/${listingId}/publish-readiness`, {
      cookie: agencia.cookie,
    });
    expect(prontidao.status, JSON.stringify(prontidao.body)).toBe(200);
    const corpo = prontidao.body as {
      canPublish: boolean;
      blockers: { code: string; label: string }[];
      channels: { channel: string; available: boolean; status: string | null }[];
    };
    expect(corpo.canPublish).toBe(false);
    expect(corpo.blockers.map((b) => b.code).sort()).toEqual(['FINANCIAL_TERMS', 'PUBLIC_ADDRESS']);

    // O portão fica na transição para READY, e recusa com a mesma frase que o
    // diálogo mostrou — é a garantia de que as duas réguas são uma só.
    const pronto = await call(app, 'PATCH', `/listings/${listingId}/status`, {
      cookie: agencia.cookie,
      payload: { status: 'READY' },
    });
    expect(pronto.status).toBe(400);
    expect(corpo.blockers.map((b) => b.label)).toContain(pronto.body.message);
  });

  it('canal sem adapter aparece como indisponível em vez de sumir', async () => {
    const { listingId } = await criarAnuncio();
    const res = await call(app, 'GET', `/listings/${listingId}/publish-readiness`, {
      cookie: agencia.cookie,
    });
    const canais = (res.body as { channels: { channel: string; available: boolean }[] }).channels;
    // Os canais oferecidos aparecem mesmo indisponíveis; a disponibilidade é que varia. Canal Pro,
    // ZAP e Viva Real deram lugar ao Grupo OLX, e a API própria da OLX fica fora (ADR-107).
    const nomes = canais.map((canal) => canal.channel);
    expect(nomes).toEqual(expect.arrayContaining(['grupoolx', 'imovelweb']));
    for (const substituido of ['canalpro', 'zap', 'vivareal', 'olx']) {
      expect(nomes).not.toContain(substituido);
    }
    expect(canais.find((canal) => canal.channel === 'grupoolx')?.available).toBe(false);
    expect(canais.find((canal) => canal.channel === 'imovelweb')?.available).toBe(false);
  });

  it('resolvidos os bloqueios, a rota libera e a publicação passa', async () => {
    const { listingId, propertyId } = await criarAnuncio();
    await call(app, 'PUT', `/properties/${propertyId}/address`, {
      cookie: agencia.cookie,
      payload: {
        privateAddress: { street: 'Rua Privada', number: '1', zipCode: '74000-000' },
        publicAddress: { neighborhood: 'Setor Bueno', city: 'Goiânia', state: 'GO' },
      },
    });
    await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { monthlyRentCents: 200_000 },
    });

    const prontidao = await call(app, 'GET', `/listings/${listingId}/publish-readiness`, {
      cookie: agencia.cookie,
    });
    expect(prontidao.body).toMatchObject({ canPublish: true, blockers: [] });

    await call(app, 'PATCH', `/listings/${listingId}/status`, {
      cookie: agencia.cookie,
      payload: { status: 'READY' },
    });
    const publicar = await call(app, 'PATCH', `/listings/${listingId}/status`, {
      cookie: agencia.cookie,
      payload: { status: 'PUBLISHED' },
    });
    expect(publicar.status, JSON.stringify(publicar.body)).toBe(200);
  });
});
