import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { listingChannelPublications, propertyMedia } from '@aluguei/db';
import type { StorageService } from '@aluguei/storage';
import { call } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Fixtures do Grupo OLX (ADR-107, ADR-108): imobiliária com contato e conexão ligada, anúncio
 * pronto para o feed (endereço completo, valores, 5 fotos JPG) e a busca do robô. O "robô" é uma
 * requisição com o User-Agent dele — nada aqui fala com o Grupo OLX.
 */

export const API_PUBLIC_URL = 'https://api.achouimovel.test';
export const CRAWLER = 'VivaRealBot/1.0 (+http://www.vivareal.com/bot.html)';
export const BROWSER = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
export const DESCRICAO =
  'Apartamento ventilado, com varanda e duas vagas. Perto de escolas, mercados e do parque.';

/** Storage em memória que guarda os bytes (o falso compartilhado devolve zeros). */
export class MemoryStorage implements StorageService {
  readonly objects = new Map<string, Buffer>();
  putObject(input: { key: string; body: Buffer | Uint8Array }) {
    this.objects.set(input.key, Buffer.from(input.body));
    return Promise.resolve({ key: input.key, size: input.body.byteLength });
  }
  getObject(key: string) {
    return Promise.resolve(this.objects.get(key) ?? null);
  }
  deleteObject(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
  headObject(key: string) {
    const body = this.objects.get(key);
    return Promise.resolve(body ? { key, size: body.byteLength } : null);
  }
  getPresignedPutUrl(input: { key: string }) {
    return Promise.resolve({ url: `https://storage.test/${input.key}`, expiresIn: 300 });
  }
  getPresignedDownloadUrl(input: { key: string }) {
    return Promise.resolve({ url: `https://storage.test/${input.key}`, expiresIn: 300 });
  }
}

export interface Semente {
  propertyType?: string;
  purpose?: 'RENT' | 'SALE' | 'BOTH';
  fotos?: number;
  fotoPng?: boolean;
  descricao?: string | null;
  titulo?: string;
  cep?: string | null;
}

/** O que os testes leem da resposta do feed (a resposta do `inject`). */
export interface InjectedResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | number | undefined>;
  rawPayload: Buffer;
}

export interface GrupoOlxFixtures {
  db: AppDb;
  /** Contato público, conexão ligada e token; devolve o caminho do feed. */
  prepararImobiliaria(alvo: RegisteredAgency): Promise<string>;
  ligarConexao(alvo: RegisteredAgency, enabled?: boolean): Promise<void>;
  criarAnuncio(
    alvo: RegisteredAgency,
    semente?: Semente,
  ): Promise<{ listingId: string; propertyId: string }>;
  publicar(
    alvo: RegisteredAgency,
    listingId: string,
    payload?: object,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  buscar(path: string, userAgent: string): Promise<InjectedResponse>;
  estado(listingId: string): Promise<typeof listingChannelPublications.$inferSelect | undefined>;
}

let sequencia = 0;

export function grupoOlxFixtures(app: FastifyInstance, storage: MemoryStorage): GrupoOlxFixtures {
  const db = (app as unknown as { db: AppDb }).db;

  async function ligarConexao(alvo: RegisteredAgency, enabled = true): Promise<void> {
    const conexao = await call(app, 'PUT', '/integrations/grupo-olx', {
      cookie: alvo.cookie,
      payload: {
        enabled,
        destinations: enabled ? ['ZAP', 'VIVAREAL', 'OLX'] : [],
        externalAccountId: null,
        externalCustomerId: null,
        listingQuota: null,
        featuredQuota: null,
        superFeaturedQuota: null,
      },
    });
    expect(conexao.status, JSON.stringify(conexao.body)).toBe(200);
  }

  async function prepararImobiliaria(alvo: RegisteredAgency): Promise<string> {
    const contato = await call(app, 'PUT', '/organization/contact', {
      cookie: alvo.cookie,
      payload: { publicContactEmail: 'Contato@Imobiliaria.Test' },
    });
    expect(contato.status, JSON.stringify(contato.body)).toBe(200);
    await ligarConexao(alvo);
    const token = await call(app, 'POST', '/integrations/grupo-olx/feed-token', {
      cookie: alvo.cookie,
    });
    expect(token.status, JSON.stringify(token.body)).toBe(201);
    const url = new URL(String(token.body.feedUrl));
    expect(url.origin).toBe(API_PUBLIC_URL);
    return url.pathname;
  }

  async function criarAnuncio(
    alvo: RegisteredAgency,
    semente: Semente = {},
  ): Promise<{ listingId: string; propertyId: string }> {
    const imovel = await call(app, 'POST', '/properties', {
      cookie: alvo.cookie,
      payload: {
        title: 'Imóvel do feed',
        propertyType: semente.propertyType ?? 'APARTMENT',
        purpose: semente.purpose ?? 'RENT',
        builtAreaSqm: 72.5,
        totalAreaSqm: 90,
        bedrooms: 2,
        suites: 1,
        bathrooms: 2,
        parkingSpots: 1,
      },
    });
    expect(imovel.status, JSON.stringify(imovel.body)).toBe(201);
    const propertyId = (imovel.body.property as { id: string }).id;
    const endereco = await call(app, 'PUT', `/properties/${propertyId}/address`, {
      cookie: alvo.cookie,
      payload: {
        privateAddress: {
          street: 'Rua T-55',
          number: '930',
          complement: 'Apto 804',
          neighborhood: 'Setor Bueno',
          city: 'Goiânia',
          state: 'GO',
          ...(semente.cep === null ? {} : { zipCode: semente.cep ?? '74215-170' }),
        },
        publicAddress: { neighborhood: 'Setor Bueno', city: 'Goiânia', state: 'GO' },
      },
    });
    expect(endereco.status, JSON.stringify(endereco.body)).toBe(200);
    const venda = semente.purpose === 'SALE' || semente.purpose === 'BOTH';
    const aluguel = semente.purpose !== 'SALE';
    const valores = await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie: alvo.cookie,
      payload: {
        ...(aluguel ? { monthlyRentCents: 280_000 } : {}),
        ...(venda ? { salePriceCents: 86_000_000 } : {}),
        condoFeeCents: 48_000,
      },
    });
    expect(valores.status, JSON.stringify(valores.body)).toBe(200);
    // Fotos gravadas direto (banco e storage), como a confirmação de envio grava: estes testes são
    // do feed, e o envio pela API tem limite de 60 por minuto por usuário — de propósito.
    const total = semente.fotos ?? 5;
    for (let i = 0; i < total; i += 1) {
      const png = semente.fotoPng === true && i === 0;
      const key = `orgs/${alvo.org.id}/properties/${propertyId}/photo/${randomUUID()}.${png ? 'png' : 'jpg'}`;
      const body = png ? Buffer.alloc(2004, 1) : JPEG;
      await storage.putObject({ key, body });
      await db.insert(propertyMedia).values({
        orgId: alvo.org.id,
        propertyId,
        kind: 'PHOTO',
        storageKey: key,
        sizeBytes: body.byteLength,
        isPublic: true,
        sortOrder: i,
        isCover: i === 0,
      });
    }
    const anuncio = await call(app, 'POST', '/listings', {
      cookie: alvo.cookie,
      payload: {
        propertyId,
        // Título diferente a cada anúncio: o slug do portal é único no país inteiro.
        title:
          semente.titulo ?? `Apartamento com 2 quartos no Setor Bueno ${String((sequencia += 1))}`,
        ...(semente.descricao === null ? {} : { description: semente.descricao ?? DESCRICAO }),
      },
    });
    expect(anuncio.status, JSON.stringify(anuncio.body)).toBe(201);
    const listingId = (anuncio.body.listing as { id: string }).id;
    for (const status of ['READY', 'PUBLISHED']) {
      const mudou = await call(app, 'PATCH', `/listings/${listingId}/status`, {
        cookie: alvo.cookie,
        payload: { status },
      });
      expect(mudou.status, JSON.stringify(mudou.body)).toBe(200);
    }
    return { listingId, propertyId };
  }

  return {
    db,
    prepararImobiliaria,
    ligarConexao,
    criarAnuncio,
    publicar: (alvo, listingId, payload = {}) =>
      call(app, 'POST', `/listings/${listingId}/channels/grupoolx/publish`, {
        cookie: alvo.cookie,
        payload,
      }),
    buscar: async (path, userAgent) => {
      const res = await app.inject({
        method: 'GET',
        url: path,
        headers: { 'user-agent': userAgent },
      });
      return {
        statusCode: res.statusCode,
        body: res.body,
        headers: res.headers,
        rawPayload: res.rawPayload,
      };
    },
    estado: async (listingId) => {
      const [row] = await db
        .select()
        .from(listingChannelPublications)
        .where(
          and(
            eq(listingChannelPublications.listingId, listingId),
            eq(listingChannelPublications.channel, 'grupoolx'),
          ),
        );
      return row;
    },
  };
}
