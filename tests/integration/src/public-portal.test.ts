import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildTestApp, fakeStorage } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { Json, RegisteredAgency } from './platform-fixtures.js';

/**
 * Onda 2A · anúncio, contato, alerta e sitemap do portal (ADR-099).
 *
 * O ciclo de vida da URL é o que este arquivo segura: 200 no ar, 301 quando o
 * endereço muda, 410 quando o anúncio sai — nunca 404 numa página que já foi
 * indexada. Mais o contato virando lead com consentimento e o alerta que só vale
 * depois de confirmado.
 */

describe('Onda 2A — anúncio, contato, alerta e sitemap', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;
  const anuncios: { listingId: string; propertyId: string; slug: string }[] = [];

  async function publicar(indice: number, bairro = 'Setor Bueno'): Promise<void> {
    const cookie = agencia.cookie;
    const criado = await call(app, 'POST', '/properties', {
      cookie,
      payload: {
        title: `Imóvel ${String(indice)}`,
        propertyType: 'APARTMENT',
        bedrooms: 2,
        builtAreaSqm: 70,
      },
    });
    const propertyId = (criado.body.property as { id: string }).id;

    await call(app, 'PUT', `/properties/${propertyId}/address`, {
      cookie,
      payload: {
        privateAddress: { street: 'Rua Privada', number: '500', zipCode: '74000-000' },
        publicAddress: { neighborhood: bairro, city: 'Goiânia', state: 'GO' },
      },
    });
    await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie,
      payload: { monthlyRentCents: 300_000 + indice * 10_000, condoFeeCents: 40_000 },
    });
    await call(app, 'POST', `/properties/${propertyId}/features`, {
      cookie,
      payload: { feature: 'Piscina' },
    });

    const upload = await call(app, 'POST', `/properties/${propertyId}/media/upload-url`, {
      cookie,
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    });
    const { key } = upload.body as { key: string };
    fakeStorage.markUploaded(key, 2048);
    const confirm = await call(app, 'POST', `/properties/${propertyId}/media/confirm`, {
      cookie,
      payload: { key },
    });
    const media = confirm.body.media as { id: string };
    await call(app, 'PATCH', `/properties/${propertyId}/media/${media.id}`, {
      cookie,
      payload: { caption: 'Sala com varanda', isCover: true },
    });

    const listing = await call(app, 'POST', '/listings', {
      cookie,
      payload: { propertyId, title: `Apartamento no ${bairro} ${String(indice)}` },
    });
    expect(listing.status, JSON.stringify(listing.body)).toBe(201);
    const criadoListing = listing.body.listing as { id: string; slug: string };
    for (const status of ['READY', 'PUBLISHED']) {
      const mudou = await call(app, 'PATCH', `/listings/${criadoListing.id}/status`, {
        cookie,
        payload: { status },
      });
      expect(mudou.status, `${status}: ${JSON.stringify(mudou.body)}`).toBe(200);
    }
    const detalhe = await call(app, 'GET', `/listings/${criadoListing.id}`, { cookie });
    const { publicSlug } = detalhe.body.listing as { publicSlug: string };
    anuncios.push({ listingId: criadoListing.id, propertyId, slug: publicSlug });
  }

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id);
    for (let indice = 0; indice < 6; indice += 1) {
      await publicar(indice);
    }
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  it('anúncio no ar: detalhe com fotos, características e mediana do bairro', async () => {
    const alvo = anuncios[0];
    const res = await call(app, 'GET', `/public/listings/${alvo?.slug ?? ''}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const listing = res.body.listing as Json;
    expect(res.body.canonicalSlug).toBe(alvo?.slug);
    expect(listing.title).toContain('Setor Bueno');
    expect(listing.features).toEqual(['Piscina']);
    const fotos = listing.photos as Array<{ path: string; caption: string; isCover: boolean }>;
    expect(fotos[0]?.caption).toBe('Sala com varanda');
    expect(fotos[0]?.isCover).toBe(true);
    expect(fotos[0]?.path).toMatch(/^\/public\/media\//);
    // 6 anúncios no bairro: amostra suficiente para a comparação.
    expect(listing.neighborhoodMedianCents).toBe(365_000);
    expect((res.body.similar as unknown[]).length).toBeGreaterThan(0);

    const bruto = JSON.stringify(res.body);
    for (const proibido of ['Rua Privada', '74000-000', 'storage_key', 'storageKey']) {
      expect(bruto, `vazou ${proibido}`).not.toContain(proibido);
    }
  });

  it('endereço trocado responde 301 para o novo, sem virar 404', async () => {
    const alvo = anuncios[1];
    const novo = 'apartamento-2-quartos-setor-bueno-goiania';
    const trocou = await call(app, 'PATCH', `/listings/${alvo?.listingId ?? ''}`, {
      cookie: agencia.cookie,
      payload: { publicSlug: novo },
    });
    expect(trocou.status, JSON.stringify(trocou.body)).toBe(200);

    const antigo = await app.inject({ method: 'GET', url: `/public/listings/${alvo?.slug ?? ''}` });
    expect(antigo.statusCode).toBe(301);
    expect(antigo.headers.location).toBe(`/public/listings/${novo}`);

    const atual = await call(app, 'GET', `/public/listings/${novo}`);
    expect(atual.status).toBe(200);
    expect(atual.body.canonicalSlug).toBe(novo);

    // Endereço que já foi de alguém não pode ser reaproveitado por outro anúncio.
    const outro = anuncios[2];
    const conflito = await call(app, 'PATCH', `/listings/${outro?.listingId ?? ''}`, {
      cookie: agencia.cookie,
      payload: { publicSlug: alvo?.slug ?? '' },
    });
    expect(conflito.status).toBe(409);
  });

  it('anúncio fora do ar responde 410 com imóveis parecidos', async () => {
    const alvo = anuncios[3];
    const pausou = await call(app, 'PATCH', `/listings/${alvo?.listingId ?? ''}/status`, {
      cookie: agencia.cookie,
      payload: { status: 'PAUSED' },
    });
    expect(pausou.status, JSON.stringify(pausou.body)).toBe(200);

    const res = await app.inject({ method: 'GET', url: `/public/listings/${alvo?.slug ?? ''}` });
    expect(res.statusCode).toBe(410);
    const corpo = res.json() as { status: string; reason: string; similar: unknown[] };
    expect(corpo.status).toBe('REMOVED');
    expect(corpo.reason).toBe('UNPUBLISHED');
    expect(corpo.similar.length).toBeGreaterThan(0);
  });

  it('slug que nunca existiu é 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/public/listings/nunca-existiu' });
    expect(res.statusCode).toBe(404);
  });

  it('contato do portal vira lead no CRM da imobiliária dona do anúncio', async () => {
    const alvo = anuncios[4];
    const res = await call(app, 'POST', `/public/listings/${alvo?.slug ?? ''}/leads`, {
      payload: {
        name: 'Maria Interessada',
        phone: '(62) 99999-0000',
        message: 'Tenho interesse neste imóvel.',
        consent: true,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.contactedBy).toBe('PHONE');

    const leads = await call(app, 'GET', '/leads', { cookie: agencia.cookie });
    const lista = leads.body.leads as Array<{ source: string | null; status: string }>;
    const doPortal = lista.filter((lead) => lead.source === 'PORTAL_ACHOUIMOVEL');
    expect(doPortal.length).toBe(1);
    expect(doPortal[0]?.status).toBe('NEW');
  });

  it('contato sem consentimento é recusado', async () => {
    const alvo = anuncios[4];
    const semConsentimento = await call(app, 'POST', `/public/listings/${alvo?.slug ?? ''}/leads`, {
      payload: { name: 'Sem consentimento', phone: '(62) 98888-0000', consent: false },
    });
    expect(semConsentimento.status).toBe(400);

    const semContato = await call(app, 'POST', `/public/listings/${alvo?.slug ?? ''}/leads`, {
      payload: { name: 'Sem contato', consent: true },
    });
    expect(semContato.status).toBe(400);
  });

  it('alerta de imóvel só vale depois de confirmado, e pode ser cancelado', async () => {
    const criado = await call(app, 'POST', '/public/alerts', {
      payload: {
        purpose: 'RENT',
        city: 'goiania-go',
        neighborhood: 'setor-bueno',
        bedrooms: 2,
        contactKind: 'EMAIL',
        contactValue: 'quem.procura@example.com',
        consent: true,
      },
    });
    expect(criado.status, JSON.stringify(criado.body)).toBe(201);
    expect(criado.body.status).toBe('PENDING');
    // A API nunca devolve o token: ele só existe na mensagem.
    expect(JSON.stringify(criado.body)).not.toContain('token');

    const mensagens = await app.db.execute(
      sql`select body, kind, org_id from email_outbox where kind = 'SEARCH_ALERT_CONFIRM' order by created_at desc limit 1`,
    );
    const mensagem = mensagens.rows[0] as { body: string; org_id: string | null };
    // Mensagem de quem procura imóvel não pertence a nenhuma imobiliária.
    expect(mensagem.org_id).toBeNull();
    const token = /token=([A-Za-z0-9_-]+)/.exec(mensagem.body)?.[1] ?? '';
    expect(token.length).toBeGreaterThan(10);

    const confirmado = await call(app, 'POST', '/public/alerts/confirm', { payload: { token } });
    expect(confirmado.status, JSON.stringify(confirmado.body)).toBe(200);
    expect(confirmado.body.status).toBe('ACTIVE');

    // Confirmar de novo não faz nada: o token é de uso único para confirmar.
    const repetido = await call(app, 'POST', '/public/alerts/confirm', { payload: { token } });
    expect(repetido.status).toBe(404);

    const cancelado = await call(app, 'POST', '/public/alerts/cancel', { payload: { token } });
    expect(cancelado.status).toBe(200);
    expect(cancelado.body.status).toBe('CANCELED');
  });

  it('sitemap só traz o que pode ser indexado', async () => {
    const res = await call(app, 'GET', '/public/sitemap');
    expect(res.status).toBe(200);
    const pages = res.body.pages as Array<{ path: string; count: number }>;
    const cidade = pages.find((p) => p.path === '/alugar/goiania-go');
    expect(cidade?.count).toBeGreaterThanOrEqual(3);

    const listagens = res.body.listings as Array<{ path: string }>;
    // O anúncio pausado saiu do sitemap na hora.
    const pausado = anuncios[3];
    expect(listagens.some((l) => l.path === `/imovel/${pausado?.slug ?? ''}`)).toBe(false);
    // O que está no ar continua.
    const noAr = anuncios[0];
    expect(listagens.some((l) => l.path === `/imovel/${noAr?.slug ?? ''}`)).toBe(true);

    const vitrines = res.body.agencies as Array<{ path: string }>;
    expect(vitrines.length).toBe(1);
  });
});
