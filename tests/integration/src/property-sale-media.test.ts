import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, fakeStorage } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { Json, RegisteredAgency } from './platform-fixtures.js';

/**
 * Onda 2A do frontend do AchouImóvel: o imóvel ganha finalidade (alugar, vender
 * ou os dois), preço de venda e os tipos novos do design; a foto ganha legenda,
 * ordem e capa.
 *
 * O que estes testes seguram: valor que não combina com a finalidade não entra,
 * preço por m² é calculado (nunca guardado meio errado) e a capa é uma só.
 */
describe('Onda 2A — finalidade, venda e fotos do imóvel', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id);
  });

  afterAll(async () => {
    await app.close();
  });

  async function criarImovel(payload: Json): Promise<{ id: string; body: Json }> {
    const res = await call(app, 'POST', '/properties', { cookie: agencia.cookie, payload });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const property = res.body.property as { id: string };
    return { id: property.id, body: res.body };
  }

  it('imóvel nasce de aluguel, como todo imóvel que já existia', async () => {
    const { body } = await criarImovel({ title: 'Apartamento herdado', propertyType: 'APARTMENT' });
    expect((body.property as Json).purpose).toBe('RENT');
  });

  it('aceita os tipos que o design desenhou', async () => {
    for (const tipo of ['HOUSE_CONDO', 'TOWNHOUSE', 'STUDIO', 'PENTHOUSE']) {
      const { body } = await criarImovel({ title: `Imóvel ${tipo}`, propertyType: tipo });
      expect((body.property as Json).propertyType).toBe(tipo);
    }
    const invalido = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Tipo inventado', propertyType: 'CASTELO' },
    });
    expect(invalido.status).toBe(400);
  });

  it('imóvel à venda guarda preço e devolve o preço por m² calculado', async () => {
    const { id } = await criarImovel({
      title: 'Casa à venda',
      propertyType: 'HOUSE',
      purpose: 'SALE',
      builtAreaSqm: 148,
    });
    const terms = await call(app, 'PUT', `/properties/${id}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { salePriceCents: 74_000_000, condoFeeCents: 42_000 },
    });
    expect(terms.status, JSON.stringify(terms.body)).toBe(200);
    const financeiro = (terms.body.property as { financialTerms: Json }).financialTerms;
    expect(financeiro.salePriceCents).toBe(74_000_000);
    expect(financeiro.monthlyRentCents).toBeNull();
    // 74.000.000 centavos / 148 m² = 500.000 centavos (R$ 5.000,00 por m²).
    expect(financeiro.pricePerSqmCents).toBe(500_000);
  });

  it('nas duas finalidades, os dois valores convivem', async () => {
    const { id } = await criarImovel({
      title: 'Cobertura para alugar ou comprar',
      propertyType: 'PENTHOUSE',
      purpose: 'BOTH',
    });
    const terms = await call(app, 'PUT', `/properties/${id}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { monthlyRentCents: 950_000, salePriceCents: 98_000_000 },
    });
    expect(terms.status, JSON.stringify(terms.body)).toBe(200);
    const financeiro = (terms.body.property as { financialTerms: Json }).financialTerms;
    expect(financeiro.monthlyRentCents).toBe(950_000);
    expect(financeiro.salePriceCents).toBe(98_000_000);
    // Sem área, o preço por m² não é inventado.
    expect(financeiro.pricePerSqmCents).toBeNull();
  });

  it('valor que não combina com a finalidade é recusado', async () => {
    const { id } = await criarImovel({
      title: 'Apartamento só de aluguel',
      propertyType: 'APARTMENT',
    });
    const comVenda = await call(app, 'PUT', `/properties/${id}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { monthlyRentCents: 250_000, salePriceCents: 74_000_000 },
    });
    expect(comVenda.status).toBe(400);
    expect(comVenda.body.code).toBe('INVALID_INPUT');

    const { id: venda } = await criarImovel({
      title: 'Terreno à venda',
      propertyType: 'LAND',
      purpose: 'SALE',
    });
    const semPreco = await call(app, 'PUT', `/properties/${venda}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { condoFeeCents: 10_000 },
    });
    expect(semPreco.status).toBe(400);
    expect((semPreco.body.details as Json | undefined)?.field).toBe('salePriceCents');
  });

  it('a finalidade pode mudar depois do cadastro', async () => {
    const { id } = await criarImovel({ title: 'Vira venda', propertyType: 'HOUSE' });
    const mudou = await call(app, 'PATCH', `/properties/${id}`, {
      cookie: agencia.cookie,
      payload: { purpose: 'SALE' },
    });
    expect(mudou.status, JSON.stringify(mudou.body)).toBe(200);
    expect((mudou.body.property as Json).purpose).toBe('SALE');
  });

  it('teto de centavos vale para o preço de venda', async () => {
    const { id } = await criarImovel({
      title: 'Mansão cara demais',
      propertyType: 'HOUSE',
      purpose: 'SALE',
    });
    const acimaDoTeto = await call(app, 'PUT', `/properties/${id}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { salePriceCents: 100_000_001 },
    });
    expect(acimaDoTeto.status).toBe(400);
  });

  it('foto ganha legenda, ordem e capa — e a capa é uma só', async () => {
    const { id } = await criarImovel({ title: 'Casa com fotos', propertyType: 'HOUSE' });

    async function subirFoto(): Promise<string> {
      const upload = await call(app, 'POST', `/properties/${id}/media/upload-url`, {
        cookie: agencia.cookie,
        payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
      });
      expect(upload.status, JSON.stringify(upload.body)).toBe(200);
      const { key } = upload.body as { key: string };
      fakeStorage.markUploaded(key, 2048);
      const confirm = await call(app, 'POST', `/properties/${id}/media/confirm`, {
        cookie: agencia.cookie,
        payload: { key },
      });
      expect(confirm.status, JSON.stringify(confirm.body)).toBe(201);
      const media = confirm.body.media as { id: string; caption: unknown; isCover: boolean };
      // Nasce sem legenda e sem ser capa: quem decide é a pessoa.
      expect(media.caption).toBeNull();
      expect(media.isCover).toBe(false);
      return media.id;
    }

    const primeira = await subirFoto();
    const segunda = await subirFoto();

    const legenda = await call(app, 'PATCH', `/properties/${id}/media/${primeira}`, {
      cookie: agencia.cookie,
      payload: { caption: 'Cozinha', sortOrder: 1, isCover: true },
    });
    expect(legenda.status, JSON.stringify(legenda.body)).toBe(200);

    const trocaCapa = await call(app, 'PATCH', `/properties/${id}/media/${segunda}`, {
      cookie: agencia.cookie,
      payload: { isCover: true },
    });
    expect(trocaCapa.status, JSON.stringify(trocaCapa.body)).toBe(200);

    const fotos = (trocaCapa.body.property as { media: Array<Record<string, unknown>> }).media;
    const capas = fotos.filter((m) => m.isCover === true);
    expect(capas).toHaveLength(1);
    expect(capas[0]?.id).toBe(segunda);
    expect(fotos.find((m) => m.id === primeira)?.caption).toBe('Cozinha');
  });

  it('documento não vira capa do anúncio', async () => {
    const { id } = await criarImovel({ title: 'Casa com documento', propertyType: 'HOUSE' });
    const upload = await call(app, 'POST', `/properties/${id}/media/upload-url`, {
      cookie: agencia.cookie,
      payload: { kind: 'DOCUMENT', mimeType: 'application/pdf', sizeBytes: 1024 },
    });
    const { key } = upload.body as { key: string };
    fakeStorage.markUploaded(key, 1024);
    const confirm = await call(app, 'POST', `/properties/${id}/media/confirm`, {
      cookie: agencia.cookie,
      payload: { key },
    });
    const doc = confirm.body.media as { id: string };
    const recusa = await call(app, 'PATCH', `/properties/${id}/media/${doc.id}`, {
      cookie: agencia.cookie,
      payload: { isCover: true },
    });
    expect(recusa.status).toBe(400);
  });
});
