import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { listings, properties, propertyAddresses, propertyMedia } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  DomainError,
  isIndexablePage,
  medianCents,
  robotsFor,
  showsPriceStats,
} from '@aluguei/domain';
import { publicSearchQuerySchema, publicSearchResponseSchema } from '@aluguei/contracts';
import type { PublicListingCard } from '@aluguei/contracts';
import {
  MAX_SAMPLE,
  listingCardFrom,
  loadCards,
  photosOf,
  priceOf,
  purposeIn,
} from './public-cards.js';

/** Anúncios por página na busca — o mesmo número da tela de referência. */
const PAGE_SIZE = 12;

/** Bairros vizinhos mostrados na página (os de maior estoque na mesma cidade). */
const NEIGHBORS_LIMIT = 8;

export const publicSearchRoutes: FastifyPluginAsync = (app) => {
  const db: AppDb = app.db;

  /**
   * Busca pública nacional. A resposta carrega o que a página precisa para
   * decidir robots e canônica (ADR-099): contagem do recorte, estatística só com
   * amostra suficiente e bairros vizinhos.
   */
  app.get('/public/search', async (request) => {
    const query = publicSearchQuerySchema.parse(request.query);
    const purpose = query.purpose;

    const filtros: SQL[] = [purposeIn(purpose), eq(propertyAddresses.citySlug, query.city)];
    if (query.neighborhood !== undefined) {
      filtros.push(eq(propertyAddresses.neighborhoodSlug, query.neighborhood));
    }
    if (query.propertyType !== undefined) {
      filtros.push(eq(properties.propertyType, query.propertyType));
    }
    if (query.bedrooms !== undefined) {
      filtros.push(
        query.bedrooms >= 4
          ? sql`${properties.bedrooms} >= ${query.bedrooms}`
          : eq(properties.bedrooms, query.bedrooms),
      );
    }

    const linhas = await loadCards(db, filtros, { limit: MAX_SAMPLE });

    // Anúncio sem valor na finalidade buscada não entra: card sem valor é ruído
    // na busca, e estatística sem valor é número torto.
    const comValor = linhas
      .map((linha) => ({ linha, price: priceOf(purpose, linha) }))
      .filter((item): item is { linha: (typeof linhas)[number]; price: number } => {
        if (item.price === null) {
          return false;
        }
        return query.maxPriceCents === undefined || item.price <= query.maxPriceCents;
      });

    const ordenado = [...comValor].sort((a, b) => {
      if (query.order === 'PRICE_ASC') {
        return a.price - b.price;
      }
      if (query.order === 'PRICE_DESC') {
        return b.price - a.price;
      }
      const dataA = a.linha.publishedAt?.getTime() ?? 0;
      const dataB = b.linha.publishedAt?.getTime() ?? 0;
      return dataB - dataA;
    });

    const total = ordenado.length;
    const inicio = (query.page - 1) * PAGE_SIZE;
    const pagina = ordenado.slice(inicio, inicio + PAGE_SIZE);

    const fotos = await photosOf(
      db,
      pagina.map((item) => item.linha.propertyId),
    );
    const items: PublicListingCard[] = pagina.map(({ linha }) => listingCardFrom(linha, fotos));

    // Estatística do recorte inteiro (não só da página), com o limiar do domínio.
    const valores = ordenado.map((item) => item.price);
    const stats = showsPriceStats(valores.length)
      ? {
          sampleSize: valores.length,
          medianCents: medianCents(valores),
          minCents: Math.min(...valores),
          maxCents: Math.max(...valores),
          byBedrooms: [1, 2, 3, 4]
            .map((quartos) => {
              const doGrupo = ordenado
                .filter((item) =>
                  quartos === 4 ? (item.linha.bedrooms ?? 0) >= 4 : item.linha.bedrooms === quartos,
                )
                .map((item) => item.price);
              return {
                bedrooms: quartos,
                count: doGrupo.length,
                medianCents: medianCents(doGrupo),
              };
            })
            .filter((grupo) => grupo.count > 0),
        }
      : null;

    // Vizinhos: outros bairros da mesma cidade, com contagem e mediana própria.
    const vizinhosBrutos =
      query.neighborhood !== undefined
        ? await loadCards(
            db,
            [
              purposeIn(purpose),
              eq(propertyAddresses.citySlug, query.city),
              isNotNull(propertyAddresses.neighborhoodSlug),
              ne(propertyAddresses.neighborhoodSlug, query.neighborhood),
            ],
            { limit: MAX_SAMPLE },
          )
        : [];

    const porBairro = new Map<string, { name: string; valores: number[] }>();
    for (const linha of vizinhosBrutos) {
      const slug = linha.neighborhoodSlug;
      const preco = priceOf(purpose, linha);
      if (slug === null || preco === null) {
        continue;
      }
      const atual = porBairro.get(slug) ?? { name: linha.neighborhood ?? slug, valores: [] };
      atual.valores.push(preco);
      porBairro.set(slug, atual);
    }
    const neighbors = [...porBairro.entries()]
      .map(([slug, dados]) => ({
        slug,
        name: dados.name,
        count: dados.valores.length,
        medianCents: medianCents(dados.valores),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, NEIGHBORS_LIMIT);

    const indexingInput = {
      count: total,
      hasModifier: query.bedrooms !== undefined,
      page: query.page,
      hasQueryFilters: query.maxPriceCents !== undefined || query.order !== 'RECENT',
    };

    return publicSearchResponseSchema.parse({
      items,
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
      stats,
      neighbors,
      indexable: isIndexablePage(indexingInput),
      robots: robotsFor(indexingInput),
    });
  });

  /**
   * Foto pública do anúncio. Responde 302 para uma URL assinada de vida curta: o
   * endereço que fica no HTML em cache nunca muda e o `storage_key` não sai daqui
   * (ADR-099). Só foto pública de anúncio publicado.
   */
  app.get('/public/media/:mediaId', async (request, reply) => {
    const { mediaId } = request.params as { mediaId: string };
    const [foto] = await db
      .select({ storageKey: propertyMedia.storageKey })
      .from(propertyMedia)
      .innerJoin(properties, eq(properties.id, propertyMedia.propertyId))
      .innerJoin(listings, eq(listings.propertyId, properties.id))
      .where(
        and(
          eq(propertyMedia.id, mediaId),
          eq(propertyMedia.isPublic, true),
          inArray(propertyMedia.kind, ['PHOTO', 'FLOORPLAN']),
          eq(listings.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    if (!foto) {
      return reply
        .status(404)
        .send({ error: 'NotFound', code: 'NOT_FOUND', message: 'Foto não encontrada' });
    }
    if (!app.storage) {
      throw new DomainError('INVALID_INPUT', 'Storage não configurado');
    }
    const { url } = await app.storage.getPresignedDownloadUrl({
      key: foto.storageKey,
      expiresInSeconds: 3600,
    });
    // Cache curto no redirecionamento: a URL assinada vence, o caminho não.
    return reply.header('cache-control', 'public, max-age=600').redirect(url, 302);
  });

  return Promise.resolve();
};
