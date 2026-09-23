import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  leadPropertyInterests,
  leads,
  listingSlugHistory,
  listings,
  parties,
  partyIdentities,
  propertyAddresses,
  propertyFeatures,
  searchAlerts,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, medianCents, normalizeEmail } from '@aluguei/domain';
import {
  createPublicLeadRequestSchema,
  createPublicLeadResponseSchema,
  createSearchAlertRequestSchema,
  publicListingGoneSchema,
  publicListingResponseSchema,
  publicSitemapResponseSchema,
  searchAlertResponseSchema,
  searchAlertTokenRequestSchema,
} from '@aluguei/contracts';
import { generateOpaqueToken, hashOpaqueToken, queueEmail } from '../email-outbox.js';
import { writeAudit } from '../plugins/audit.js';
import {
  MAX_SAMPLE,
  listingCardFrom,
  loadCards,
  photosOf,
  priceOf,
  purposeIn,
} from './public-cards.js';

/** Quantos "outros imóveis no bairro" a página do anúncio mostra. */
const SIMILAR_LIMIT = 4;

/** Teto de linhas por seção do sitemap: o portal pagina se crescer além disso. */
const SITEMAP_LIMIT = 5000;

const CONSENT_ALERTA =
  'Autorizo o AchouImóvel a me avisar por este contato quando aparecer imóvel nesta busca.';

export const publicPortalRoutes: FastifyPluginAsync = (app) => {
  const db: AppDb = app.db;

  /**
   * Anúncio pelo slug público. Respostas, na ordem do ciclo de vida da URL
   * (ADR-099): 200 no anúncio no ar, 301 quando o slug mudou, 410 quando saiu do
   * ar (com imóveis parecidos) e 404 quando nunca existiu.
   */
  app.get('/public/listings/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().min(1).max(160) }).parse(request.params);

    const [atual] = await loadCards(db, [eq(listings.publicSlug, slug)], { onlyPublished: false });
    if (!atual) {
      // Slug que já foi de um anúncio: 301 para o endereço de hoje.
      const [antigo] = await db
        .select({ listingId: listingSlugHistory.listingId })
        .from(listingSlugHistory)
        .where(eq(listingSlugHistory.slug, slug))
        .limit(1);
      if (antigo) {
        const [destino] = await db
          .select({ slug: listings.publicSlug })
          .from(listings)
          .where(eq(listings.id, antigo.listingId))
          .limit(1);
        if (destino) {
          return reply
            .header('location', `/public/listings/${destino.slug}`)
            .status(301)
            .send({ canonicalSlug: destino.slug });
        }
      }
      return reply
        .status(404)
        .send({ error: 'NotFound', code: 'NOT_FOUND', message: 'Anúncio não encontrado' });
    }

    const noAr = atual.listingStatus === 'PUBLISHED' && atual.orgStatus === 'ACTIVE';
    const parecidos =
      atual.neighborhoodSlug !== null && atual.citySlug !== null
        ? await loadCards(
            db,
            [
              eq(propertyAddresses.citySlug, atual.citySlug),
              eq(propertyAddresses.neighborhoodSlug, atual.neighborhoodSlug),
              ne(listings.id, atual.id),
              purposeIn(atual.purpose === 'SALE' ? 'SALE' : 'RENT'),
            ],
            { limit: SIMILAR_LIMIT },
          )
        : [];
    const cardsParecidos = await Promise.all(
      parecidos.map(async (linha) =>
        listingCardFrom(linha, await photosOf(db, [linha.propertyId])),
      ),
    );

    if (!noAr) {
      // 410: a remoção é definitiva e conhecida. O buscador tira do índice mais
      // rápido do que com 404, e quem chegou pelo link vê alternativa de verdade.
      return reply.status(410).send(
        publicListingGoneSchema.parse({
          status: 'REMOVED',
          reason: atual.listingStatus === 'ARCHIVED' ? 'RENTED_OR_SOLD' : 'UNPUBLISHED',
          neighborhood: atual.neighborhood,
          city: atual.city,
          similar: cardsParecidos,
        }),
      );
    }

    const fotos = await photosOf(db, [atual.propertyId]);
    const card = listingCardFrom(atual, fotos);
    const caracteristicas = await db
      .select({ feature: propertyFeatures.feature })
      .from(propertyFeatures)
      .where(eq(propertyFeatures.propertyId, atual.propertyId));

    // Comparação com o bairro: a mediana só existe com amostra suficiente.
    const doBairro =
      atual.citySlug !== null && atual.neighborhoodSlug !== null
        ? await loadCards(
            db,
            [
              eq(propertyAddresses.citySlug, atual.citySlug),
              eq(propertyAddresses.neighborhoodSlug, atual.neighborhoodSlug),
              purposeIn(atual.purpose === 'SALE' ? 'SALE' : 'RENT'),
            ],
            { limit: MAX_SAMPLE },
          )
        : [];
    const valores = doBairro
      .map((linha) => priceOf(atual.purpose === 'SALE' ? 'SALE' : 'RENT', linha))
      .filter((valor): valor is number => valor !== null);

    return publicListingResponseSchema.parse({
      listing: {
        ...card,
        description: atual.description,
        features: caracteristicas.map((c) => c.feature),
        photos: fotos
          .filter((foto) => foto.propertyId === atual.propertyId)
          .map((foto) => ({
            path: `/public/media/${foto.id}`,
            caption: foto.caption,
            isCover: foto.isCover,
          })),
        updatedAt: atual.updatedAt.toISOString(),
        neighborhoodMedianCents: medianCents(valores),
      },
      canonicalSlug: atual.slug,
      similar: cardsParecidos,
    });
  });

  /**
   * Contato do portal: vira lead no CRM da imobiliária dona do anúncio. Exige
   * consentimento LGPD (o schema só aceita `true`) e tem limite por IP — o
   * formulário é público e sem ele vira porta de spam.
   */
  app.post(
    '/public/listings/:slug/leads',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(160) }).parse(request.params);
      const input = createPublicLeadRequestSchema.parse(request.body);

      const [anuncio] = await loadCards(db, [eq(listings.publicSlug, slug)]);
      if (!anuncio) {
        throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
      }

      const email = input.email === undefined ? null : normalizeEmail(input.email);
      const telefone = input.phone === undefined ? null : input.phone.replace(/\D/g, '');

      await db.transaction(async (tx) => {
        const [pessoa] = await tx
          .insert(parties)
          .values({ orgId: anuncio.orgId, type: 'PERSON', name: input.name })
          .returning({ id: parties.id });
        if (!pessoa) {
          throw new Error('party not created for public lead');
        }
        for (const [kind, value] of [
          ['EMAIL', email],
          ['PHONE', telefone],
        ] as const) {
          if (value !== null && value !== '') {
            await tx
              .insert(partyIdentities)
              .values({ orgId: anuncio.orgId, partyId: pessoa.id, kind, value })
              .onConflictDoNothing();
          }
        }
        const [lead] = await tx
          .insert(leads)
          .values({
            orgId: anuncio.orgId,
            status: 'NEW',
            source: 'PORTAL_ACHOUIMOVEL',
            channel: 'PORTAL',
            partyId: pessoa.id,
            notes: input.message ?? null,
          })
          .returning({ id: leads.id });
        if (!lead) {
          throw new Error('lead not created for public contact');
        }
        await tx
          .insert(leadPropertyInterests)
          .values({ orgId: anuncio.orgId, leadId: lead.id, propertyId: anuncio.propertyId })
          .onConflictDoNothing();
        await writeAudit(tx, {
          orgId: anuncio.orgId,
          actorUserId: null,
          action: AUDIT_ACTIONS.LEAD_CREATED,
          entityType: 'LEAD',
          entityId: lead.id,
          // Sem dado pessoal na auditoria: só de onde veio e por qual anúncio.
          payload: { source: 'PORTAL_ACHOUIMOVEL', listingId: anuncio.id, consent: true },
        });
      });

      return reply.status(201).send(
        createPublicLeadResponseSchema.parse({
          ok: true,
          contactedBy: telefone !== null && telefone !== '' ? 'PHONE' : 'EMAIL',
        }),
      );
    },
  );

  /**
   * Alerta de imóvel. Nasce PENDING e só vale depois de confirmar pelo link de
   * uso único: ninguém entra numa lista de aviso sem dizer que quer. A mensagem
   * de confirmação vai para a caixa de saída local — nada é enviado daqui.
   */
  app.post(
    '/public/alerts',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = createSearchAlertRequestSchema.parse(request.body);
      const token = generateOpaqueToken();

      const contato =
        input.contactKind === 'EMAIL'
          ? normalizeEmail(input.contactValue)
          : input.contactValue.replace(/\D/g, '');

      await db.transaction(async (tx) => {
        await tx.insert(searchAlerts).values({
          purpose: input.purpose,
          citySlug: input.city,
          neighborhoodSlug: input.neighborhood ?? null,
          propertyType: input.propertyType ?? null,
          bedrooms: input.bedrooms ?? null,
          maxPriceCents: input.maxPriceCents ?? null,
          contactKind: input.contactKind,
          contactValue: contato,
          consentText: CONSENT_ALERTA,
          tokenHash: hashOpaqueToken(token),
        });
        if (input.contactKind === 'EMAIL') {
          await queueEmail(tx, {
            // Sem organização: o contato de quem procura imóvel não é de nenhuma imobiliária.
            orgId: null,
            kind: 'SEARCH_ALERT_CONFIRM',
            toEmail: contato,
            subject: 'Confirme seu alerta de imóvel',
            body: `Confirme o alerta para continuar recebendo avisos: /alerta/confirmado?token=${token}`,
          });
        }
      });

      // O token só existe na mensagem da caixa de saída: a API nunca o devolve.
      return reply.status(201).send(searchAlertResponseSchema.parse({ status: 'PENDING' }));
    },
  );

  app.post('/public/alerts/confirm', async (request) => {
    const { token } = searchAlertTokenRequestSchema.parse(request.body);
    const [alerta] = await db
      .update(searchAlerts)
      .set({ status: 'ACTIVE', confirmedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(searchAlerts.tokenHash, hashOpaqueToken(token)), eq(searchAlerts.status, 'PENDING')),
      )
      .returning({ status: searchAlerts.status });
    if (!alerta) {
      throw new DomainError('NOT_FOUND', 'Alerta não encontrado ou já confirmado');
    }
    return searchAlertResponseSchema.parse({ status: alerta.status });
  });

  app.post('/public/alerts/cancel', async (request) => {
    const { token } = searchAlertTokenRequestSchema.parse(request.body);
    const [alerta] = await db
      .update(searchAlerts)
      .set({ status: 'CANCELED', canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(searchAlerts.tokenHash, hashOpaqueToken(token)),
          ne(searchAlerts.status, 'CANCELED'),
        ),
      )
      .returning({ status: searchAlerts.status });
    if (!alerta) {
      throw new DomainError('NOT_FOUND', 'Alerta não encontrado ou já cancelado');
    }
    return searchAlertResponseSchema.parse({ status: alerta.status });
  });

  /**
   * Fonte do sitemap: só o que pode ser indexado (ADR-099). Recorte abaixo do
   * limiar não entra, e anúncio fora do ar sai na hora — é o que evita o índice
   * encher de página vazia.
   */
  app.get('/public/sitemap', async () => {
    const linhas = await loadCards(db, [isNotNull(propertyAddresses.citySlug)], {
      limit: SITEMAP_LIMIT,
    });

    interface Recorte {
      count: number;
      lastmod: Date;
      hasModifier: boolean;
    }
    const recortes = new Map<string, Recorte>();
    const marcar = (path: string, quando: Date, hasModifier: boolean): void => {
      const atual = recortes.get(path);
      if (atual) {
        atual.count += 1;
        atual.lastmod = quando > atual.lastmod ? quando : atual.lastmod;
        return;
      }
      recortes.set(path, { count: 1, lastmod: quando, hasModifier });
    };

    for (const linha of linhas) {
      const quando = linha.publishedAt ?? linha.updatedAt;
      const finalidades =
        linha.purpose === 'BOTH'
          ? ['alugar', 'comprar']
          : [linha.purpose === 'SALE' ? 'comprar' : 'alugar'];
      for (const finalidade of finalidades) {
        const cidade = linha.citySlug;
        if (cidade === null) {
          continue;
        }
        marcar(`/${finalidade}/${cidade}`, quando, false);
        if (linha.neighborhoodSlug !== null) {
          marcar(`/${finalidade}/${cidade}/${linha.neighborhoodSlug}`, quando, false);
        }
      }
    }

    const pages = [...recortes.entries()]
      .filter(([, dados]) => dados.count >= (dados.hasModifier ? 5 : 3))
      .map(([path, dados]) => ({
        path,
        count: dados.count,
        lastmod: dados.lastmod.toISOString(),
      }))
      .sort((a, b) => b.count - a.count);

    const listagens = linhas.map((linha) => ({
      path: `/imovel/${linha.slug}`,
      lastmod: (linha.publishedAt ?? linha.updatedAt).toISOString(),
    }));

    const porImobiliaria = new Map<string, Date>();
    for (const linha of linhas) {
      const quando = linha.publishedAt ?? linha.updatedAt;
      const atual = porImobiliaria.get(linha.orgSlug);
      if (!atual || quando > atual) {
        porImobiliaria.set(linha.orgSlug, quando);
      }
    }

    return publicSitemapResponseSchema.parse({
      pages,
      listings: listagens,
      agencies: [...porImobiliaria.entries()].map(([slug, lastmod]) => ({
        path: `/imobiliaria/${slug}`,
        lastmod: lastmod.toISOString(),
      })),
    });
  });

  return Promise.resolve();
};
