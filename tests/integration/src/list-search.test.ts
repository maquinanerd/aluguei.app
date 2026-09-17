import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';
import type { RegisteredUser } from './helpers.js';

/**
 * P1-01 (auditoria 2026-09-10): o painel carregava a organização inteira com
 * `limit=200` (a API aceita até 100) para achar o nome de uma pessoa ou de um
 * imóvel e para montar selects — 400 em silêncio, select vazio, nomes "—".
 * Duas buscas nas listagens, sempre restritas à organização da sessão:
 *  - `q` em /properties: trecho do título, sem diferenciar maiúsculas, com `%`
 *    e `_` tratados como texto (combobox de imóvel);
 *  - `ids` em /properties, /parties e /listings: resolve os nomes das linhas da
 *    página (até 100 ids); id de outra organização some da resposta, igual a um
 *    id inexistente.
 */

interface Row {
  id: string;
  title?: string;
}

describe('P1-01: buscas nas listagens, restritas à organização', () => {
  let app: FastifyInstance;
  let A: RegisteredUser;
  let B: RegisteredUser;
  const aProperties: Record<string, string> = {};
  let bProperty = '';
  const aParties: string[] = [];
  let bParty = '';
  const aListings: string[] = [];
  let bListing = '';

  async function post<T>(user: RegisteredUser, url: string, payload: object): Promise<T> {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { cookie: user.cookie },
      payload,
    });
    expect(res.statusCode, `${url} ${res.body}`).toBe(201);
    return res.json() as T;
  }

  async function get(user: RegisteredUser, url: string) {
    const res = await app.inject({ method: 'GET', url, headers: { cookie: user.cookie } });
    return {
      status: res.statusCode,
      body: res.statusCode === 200 ? (res.json() as Record<string, Row[]>) : {},
    };
  }

  async function createProperty(user: RegisteredUser, title: string, status?: 'ARCHIVED') {
    const body = await post<{ property: Row }>(user, '/properties', {
      title,
      propertyType: 'APARTMENT',
      ...(status ? { status } : {}),
    });
    return body.property.id;
  }

  async function createParty(user: RegisteredUser, name: string) {
    const body = await post<{ party: Row }>(user, '/parties', {
      type: 'PERSON',
      name,
      identities: [{ kind: 'EMAIL', value: `${randomUUID()}@example.com` }],
    });
    return body.party.id;
  }

  async function createListing(user: RegisteredUser, propertyId: string, title: string) {
    const body = await post<{ listing: Row }>(user, '/listings', { propertyId, title });
    return body.listing.id;
  }

  async function titlesFor(user: RegisteredUser, query: string) {
    const res = await get(user, `/properties?${query}`);
    return {
      status: res.status,
      titles: (res.body.properties ?? []).map((p) => p.title ?? '').sort(),
    };
  }

  const idsOf = (rows: Row[] | undefined) => (rows ?? []).map((r) => r.id).sort();

  beforeAll(async () => {
    app = await buildTestApp();
    A = await registerUser(app);
    B = await registerUser(app);
    for (const title of [
      'Casa Azul Centro',
      'Apartamento Verde',
      'Sala 100% comercial',
      'Galpão_Norte',
    ]) {
      aProperties[title] = await createProperty(A, title);
    }
    aProperties['Casa Azul Arquivada'] = await createProperty(A, 'Casa Azul Arquivada', 'ARCHIVED');
    bProperty = await createProperty(B, 'Casa Azul da outra imobiliária');

    for (const name of ['Pessoa A1', 'Pessoa A2', 'Pessoa A3']) {
      aParties.push(await createParty(A, name));
    }
    bParty = await createParty(B, 'Pessoa B1');

    for (const title of ['Casa Azul Centro', 'Apartamento Verde', 'Galpão_Norte']) {
      aListings.push(await createListing(A, aProperties[title] ?? '', `Anúncio ${title}`));
    }
    bListing = await createListing(B, bProperty, 'Anúncio da outra imobiliária');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('q em /properties', () => {
    it('filtra por trecho do título sem diferenciar maiúsculas', async () => {
      expect(await titlesFor(A, 'q=casa%20azul')).toEqual({
        status: 200,
        titles: ['Casa Azul Arquivada', 'Casa Azul Centro'],
      });
      expect(await titlesFor(A, 'q=VERDE')).toEqual({
        status: 200,
        titles: ['Apartamento Verde'],
      });
    });

    it('nunca devolve imóvel de outra organização', async () => {
      expect(await titlesFor(A, 'q=outra')).toEqual({ status: 200, titles: [] });
      expect(await titlesFor(B, 'q=casa')).toEqual({
        status: 200,
        titles: ['Casa Azul da outra imobiliária'],
      });
    });

    it('% e _ são texto, não curinga', async () => {
      expect(await titlesFor(A, 'q=%25')).toEqual({
        status: 200,
        titles: ['Sala 100% comercial'],
      });
      expect(await titlesFor(A, 'q=100%25')).toEqual({
        status: 200,
        titles: ['Sala 100% comercial'],
      });
      expect(await titlesFor(A, 'q=_')).toEqual({ status: 200, titles: ['Galpão_Norte'] });
    });

    it('combina com filtro de status e paginação', async () => {
      expect(await titlesFor(A, 'q=casa&status=ACTIVE')).toEqual({
        status: 200,
        titles: ['Casa Azul Centro'],
      });
      const page = await titlesFor(A, 'q=casa&limit=1');
      expect(page.status).toBe(200);
      expect(page.titles).toHaveLength(1);
    });

    it('sem q mantém a listagem completa da organização', async () => {
      expect(await titlesFor(A, 'limit=100')).toEqual({
        status: 200,
        titles: [
          'Apartamento Verde',
          'Casa Azul Arquivada',
          'Casa Azul Centro',
          'Galpão_Norte',
          'Sala 100% comercial',
        ],
      });
    });

    it('q acima de 100 caracteres é recusado', async () => {
      expect((await titlesFor(A, `q=${'x'.repeat(101)}`)).status).toBe(400);
    });
  });

  describe('ids em /properties, /parties e /listings', () => {
    it('/properties devolve só os ids pedidos que são da organização', async () => {
      const wanted = [aProperties['Casa Azul Centro'] ?? '', aProperties['Galpão_Norte'] ?? ''];
      const res = await get(A, `/properties?limit=100&ids=${[...wanted, bProperty].join(',')}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.properties)).toEqual([...wanted].sort());
    });

    it('/parties devolve só os ids pedidos que são da organização', async () => {
      const wanted = [aParties[0] ?? '', aParties[2] ?? ''];
      const res = await get(A, `/parties?limit=100&ids=${[...wanted, bParty].join(',')}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.parties)).toEqual([...wanted].sort());
    });

    it('/listings devolve só os ids pedidos que são da organização', async () => {
      const wanted = [aListings[1] ?? '', aListings[2] ?? ''];
      const res = await get(A, `/listings?limit=100&ids=${[...wanted, bListing].join(',')}`);
      expect(res.status).toBe(200);
      expect(idsOf(res.body.listings)).toEqual([...wanted].sort());
    });

    it('só ids de outra organização: lista vazia, sem vazar existência', async () => {
      for (const [resource, foreignId] of [
        ['properties', bProperty],
        ['parties', bParty],
        ['listings', bListing],
      ] as const) {
        const res = await get(A, `/${resource}?limit=100&ids=${foreignId}`);
        expect(res.status, resource).toBe(200);
        expect(res.body[resource], resource).toEqual([]);
      }
    });

    it('aceita até 100 ids e recusa lista maior ou id fora do formato', async () => {
      const hundred = Array.from({ length: 100 }, () => randomUUID());
      expect((await get(A, `/parties?limit=100&ids=${hundred.join(',')}`)).status).toBe(200);
      expect((await get(A, `/parties?ids=${[...hundred, randomUUID()].join(',')}`)).status).toBe(
        400,
      );
      expect((await get(A, '/properties?ids=nao-e-uuid')).status).toBe(400);
      expect((await get(A, '/listings?ids=')).status).toBe(400);
    });
  });
});
