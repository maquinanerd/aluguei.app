import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, fakeStorage } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { Json, RegisteredAgency } from './platform-fixtures.js';

/**
 * Onda 2A · busca pública do portal (ADR-099 e `docs/frontend/PORTAL_SEO.md`).
 *
 * O que estes testes seguram é a régua de SEO: a página só é indexável com
 * anúncio suficiente, a estatística só aparece com amostra que não mente, o
 * recorte com modificador exige mais, e nada de endereço ou `storage_key` sai
 * na resposta pública.
 */

interface Cenario {
  neighborhood: string;
  neighborhoodSlug: string;
  bedrooms: number;
  rentCents?: number;
  salePriceCents?: number;
  purpose?: 'RENT' | 'SALE' | 'BOTH';
  comFoto?: boolean;
}

describe('Onda 2A — busca pública', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;

  async function publicar(cenario: Cenario, indice: number): Promise<void> {
    const cookie = agencia.cookie;
    const criado = await call(app, 'POST', '/properties', {
      cookie,
      payload: {
        title: `Imóvel ${cenario.neighborhoodSlug} ${String(indice)}`,
        propertyType: 'APARTMENT',
        purpose: cenario.purpose ?? 'RENT',
        bedrooms: cenario.bedrooms,
        builtAreaSqm: 70,
      },
    });
    expect(criado.status, JSON.stringify(criado.body)).toBe(201);
    const propertyId = (criado.body.property as { id: string }).id;

    const endereco = await call(app, 'PUT', `/properties/${propertyId}/address`, {
      cookie,
      payload: {
        privateAddress: { street: 'Rua Privada', number: '123', zipCode: '74000-000' },
        publicAddress: {
          neighborhood: cenario.neighborhood,
          city: 'Goiânia',
          state: 'GO',
        },
      },
    });
    expect(endereco.status, JSON.stringify(endereco.body)).toBe(200);

    const termos: Json = {};
    if (cenario.rentCents !== undefined) {
      termos.monthlyRentCents = cenario.rentCents;
      termos.condoFeeCents = 40_000;
      termos.iptuCents = 10_000;
    }
    if (cenario.salePriceCents !== undefined) {
      termos.salePriceCents = cenario.salePriceCents;
    }
    const terms = await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie,
      payload: termos,
    });
    expect(terms.status, JSON.stringify(terms.body)).toBe(200);

    if (cenario.comFoto) {
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
        payload: { caption: 'Sala', isCover: true },
      });
    }

    const listing = await call(app, 'POST', '/listings', {
      cookie,
      payload: { propertyId, title: `Anúncio ${cenario.neighborhoodSlug} ${String(indice)}` },
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

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id);

    // Setor Bueno: 6 anúncios de aluguel (amostra suficiente para estatística),
    // com dois de 2 quartos — o recorte com modificador fica abaixo do limiar.
    const bueno = [320_000, 250_000, 410_000, 280_000, 350_000, 300_000];
    for (const [indice, rent] of bueno.entries()) {
      await publicar(
        {
          neighborhood: 'Setor Bueno',
          neighborhoodSlug: 'setor-bueno',
          bedrooms: indice < 2 ? 2 : 3,
          rentCents: rent,
          comFoto: indice === 0,
        },
        indice,
      );
    }

    // Setor Oeste: 2 anúncios — bairro vizinho que ainda não indexa.
    for (const [indice, rent] of [270_000, 290_000].entries()) {
      await publicar(
        {
          neighborhood: 'Setor Oeste',
          neighborhoodSlug: 'setor-oeste',
          bedrooms: 3,
          rentCents: rent,
        },
        indice,
      );
    }

    // Um imóvel à venda, para provar que as duas buscas não se misturam.
    await publicar(
      {
        neighborhood: 'Setor Bueno',
        neighborhoodSlug: 'setor-bueno',
        bedrooms: 3,
        purpose: 'SALE',
        salePriceCents: 74_000_000,
      },
      99,
    );
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  async function buscar(params: Record<string, string>): Promise<Json> {
    const query = new URLSearchParams(params).toString();
    const res = await call(app, 'GET', `/public/search?${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body;
  }

  it('bairro com estoque: indexa e mostra estatística', async () => {
    const body = await buscar({ purpose: 'RENT', city: 'goiania-go', neighborhood: 'setor-bueno' });
    expect(body.total).toBe(6);
    expect(body.indexable).toBe(true);
    expect(body.robots).toBe('index, follow');

    const stats = body.stats as {
      sampleSize: number;
      medianCents: number;
      minCents: number;
      maxCents: number;
    };
    expect(stats.sampleSize).toBe(6);
    // Total do mês = aluguel + condomínio + IPTU; mediana de 6 valores é a média dos dois do meio.
    expect(stats.minCents).toBe(250_000 + 50_000);
    expect(stats.maxCents).toBe(410_000 + 50_000);
    expect(stats.medianCents).toBe(360_000);
  });

  it('bairro com 2 anúncios: a página vive, mas não indexa e não tem estatística', async () => {
    const body = await buscar({ purpose: 'RENT', city: 'goiania-go', neighborhood: 'setor-oeste' });
    expect(body.total).toBe(2);
    expect(body.indexable).toBe(false);
    expect(body.robots).toBe('noindex, follow');
    expect(body.stats).toBeNull();
    // Continua navegável: os anúncios estão lá.
    expect((body.items as unknown[]).length).toBe(2);
  });

  it('recorte com modificador exige amostra maior', async () => {
    const doisQuartos = await buscar({
      purpose: 'RENT',
      city: 'goiania-go',
      neighborhood: 'setor-bueno',
      bedrooms: '2',
    });
    expect(doisQuartos.total).toBe(2);
    expect(doisQuartos.indexable).toBe(false);

    const tresQuartos = await buscar({
      purpose: 'RENT',
      city: 'goiania-go',
      neighborhood: 'setor-bueno',
      bedrooms: '3',
    });
    expect(tresQuartos.total).toBe(4);
    // 4 anúncios passam do limiar de 3, mas não do limiar de 5 com modificador.
    expect(tresQuartos.indexable).toBe(false);
  });

  it('página 2 e ordenação nunca indexam', async () => {
    const pagina2 = await buscar({
      purpose: 'RENT',
      city: 'goiania-go',
      neighborhood: 'setor-bueno',
      page: '2',
    });
    expect(pagina2.indexable).toBe(false);

    const ordenado = await buscar({
      purpose: 'RENT',
      city: 'goiania-go',
      neighborhood: 'setor-bueno',
      order: 'PRICE_ASC',
    });
    expect(ordenado.indexable).toBe(false);
    const itens = ordenado.items as Array<{ totalMonthlyCents: number }>;
    expect(itens[0]?.totalMonthlyCents).toBe(300_000);
  });

  it('bairros vizinhos entram com contagem própria', async () => {
    const body = await buscar({ purpose: 'RENT', city: 'goiania-go', neighborhood: 'setor-bueno' });
    const vizinhos = body.neighbors as Array<{
      slug: string;
      count: number;
      medianCents: number | null;
    }>;
    const oeste = vizinhos.find((v) => v.slug === 'setor-oeste');
    expect(oeste?.count).toBe(2);
    // Vizinho com amostra pequena aparece com contagem, mas sem mediana.
    expect(oeste?.medianCents).toBeNull();
  });

  it('venda e aluguel não se misturam', async () => {
    const venda = await buscar({ purpose: 'SALE', city: 'goiania-go' });
    expect(venda.total).toBe(1);
    const item = (
      venda.items as Array<{
        salePriceCents: number;
        pricePerSqmCents: number;
        totalMonthlyCents: number | null;
      }>
    )[0];
    expect(item?.salePriceCents).toBe(74_000_000);
    // 74.000.000 / 70 m² arredondado.
    expect(item?.pricePerSqmCents).toBe(1_057_143);
    expect(item?.totalMonthlyCents).toBeNull();

    const aluguel = await buscar({ purpose: 'RENT', city: 'goiania-go' });
    expect(aluguel.total).toBe(8);
  });

  it('a resposta pública não traz endereço, CEP nem chave de storage', async () => {
    const body = await buscar({ purpose: 'RENT', city: 'goiania-go', neighborhood: 'setor-bueno' });
    const bruto = JSON.stringify(body);
    for (const proibido of ['Rua Privada', '74000-000', 'storageKey', 'storage_key', 'zipCode']) {
      expect(bruto, `vazou ${proibido}`).not.toContain(proibido);
    }
    expect(bruto).toContain('Setor Bueno');
  });

  it('a foto de capa vem como caminho do portal e redireciona para a URL assinada', async () => {
    const body = await buscar({ purpose: 'RENT', city: 'goiania-go', neighborhood: 'setor-bueno' });
    const comFoto = (
      body.items as Array<{
        coverPath: string | null;
        coverCaption: string | null;
        photoCount: number;
      }>
    ).find((item) => item.coverPath !== null);
    expect(comFoto?.coverCaption).toBe('Sala');
    expect(comFoto?.photoCount).toBe(1);
    expect(comFoto?.coverPath).toMatch(/^\/public\/media\/[0-9a-f-]+$/);

    const res = await app.inject({ method: 'GET', url: comFoto?.coverPath ?? '' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('fake-storage');
    expect(res.headers['cache-control']).toContain('max-age=600');
  });

  it('cidade sem anúncio devolve vazio, sem indexar e sem inventar estatística', async () => {
    const body = await buscar({ purpose: 'RENT', city: 'palmas-to' });
    expect(body.total).toBe(0);
    expect(body.indexable).toBe(false);
    expect(body.stats).toBeNull();
    expect(body.items).toEqual([]);
  });
});
