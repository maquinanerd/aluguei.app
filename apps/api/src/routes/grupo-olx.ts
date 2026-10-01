import { Readable } from 'node:stream';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  channelConnections,
  channelImportReports,
  listingChannelPublications,
  listings,
  organizations,
  properties,
  propertyMedia,
  webhookInbox,
} from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, FEED_DESIRED_STATUSES } from '@aluguei/domain';
import {
  grupoOlxFeedTokenResponseSchema,
  grupoOlxImportReportSchema,
  grupoOlxListingSettingsRequestSchema,
  grupoOlxListingsResponseSchema,
  grupoOlxOverviewResponseSchema,
  grupoOlxPropertyTypeOptionsResponseSchema,
  updateGrupoOlxConnectionRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import type { GrupoOlxListingIssue } from '@aluguei/contracts';
import {
  CHANNEL_TYPE_FEATURES,
  VRSYNC_MAX_IMAGE_BYTES,
  VRSYNC_MAX_LISTINGS,
  portalPropertyTypeOptions,
} from '@aluguei/integrations';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import {
  buildFeedUrl,
  ensureConnection,
  findConnectionByFeedToken,
  loadConnection,
  resolveApiPublicUrl,
  revokeFeedToken,
  rotateFeedToken,
  toConnectionDto,
} from '../grupo-olx/connection.js';
import { countGrupoOlxByStatus, updateGrupoOlxSettings } from '../grupo-olx/evaluate.js';
import { GRUPO_OLX_CHANNEL, loadAgency, mediaVersion } from '../grupo-olx/feed-data.js';
import {
  applyCrawlerFetch,
  generateGrupoOlxFeed,
  isGrupoOlxCrawler,
  recordFeedFetch,
} from '../grupo-olx/feed.js';

/** Provider da caixa de entrada para os leads do Grupo OLX (ADR-108). */
export const GRUPO_OLX_LEAD_PROVIDER = 'GRUPO_OLX_LEAD';

const XML_TYPE = 'application/xml; charset=utf-8';

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** 503 com o formato de erro da API: a instalação não tem o que a rota precisa. */
function unavailable(reply: FastifyReply, message: string): FastifyReply {
  return reply.status(503).send({ error: 'ServiceUnavailable', code: 'UNAVAILABLE', message });
}

function issuesOf(value: unknown): GrupoOlxListingIssue[] {
  return Array.isArray(value) ? (value as GrupoOlxListingIssue[]) : [];
}

/**
 * Grupo OLX / Canal Pro (ADR-107): configuração da imobiliária, acompanhamento, ajustes por anúncio
 * e as duas rotas públicas que o robô do Grupo OLX usa — o feed VRSync (token opaco no caminho) e
 * as fotos em JPG com URL estável.
 */
export const grupoOlxRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;
  const apiPublicUrl = (): string | null => resolveApiPublicUrl(app.env);

  // ---------------------------------------------------------------- painel

  app.get(
    '/integrations/grupo-olx',
    { onRequest: [requirePermission('listing:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const connection = await loadConnection(db, auth.orgId);
      const agency = await loadAgency(db, auth.orgId);
      const byStatus = await countGrupoOlxByStatus(db, auth.orgId);
      const total = (status: string): number => byStatus.get(status)?.total ?? 0;
      const desired = FEED_DESIRED_STATUSES.reduce((sum, status) => sum + total(status), 0);
      const inFeed = ['ELIGIBLE', 'AWAITING_IMPORT', 'IMPORTED', 'IMPORTED_WITH_WARNINGS'];
      let premium = 0;
      let superPremium = 0;
      for (const status of inFeed) {
        premium += byStatus.get(status)?.premium ?? 0;
        superPremium += byStatus.get(status)?.superPremium ?? 0;
      }
      const inFeedTotal = inFeed.reduce((sum, status) => sum + total(status), 0);

      const [leadCount] = await db
        .select({ received: count() })
        .from(webhookInbox)
        .where(
          and(
            eq(webhookInbox.orgId, auth.orgId),
            eq(webhookInbox.provider, GRUPO_OLX_LEAD_PROVIDER),
          ),
        );
      const [lastReport] = await db
        .select()
        .from(channelImportReports)
        .where(
          and(
            eq(channelImportReports.orgId, auth.orgId),
            eq(channelImportReports.channel, GRUPO_OLX_CHANNEL),
          ),
        )
        .orderBy(desc(channelImportReports.receivedAt))
        .limit(1);

      const feedAvailable = apiPublicUrl() !== null;
      const leadsWebhookConfigured = Boolean(app.env.GRUPO_OLX_LEADS_SECRET_KEY);
      const warnings: Array<{ code: string; message: string }> = [];
      if (!feedAvailable) {
        warnings.push({
          code: 'API_PUBLIC_URL_MISSING',
          message:
            'Esta instalação não tem o endereço público da API (API_PUBLIC_URL): o feed não pode ser gerado.',
        });
      }
      if (!agency.email) {
        warnings.push({
          code: 'CONTACT_EMAIL_MISSING',
          message:
            'Cadastre o e-mail público da imobiliária: o Grupo OLX exige e-mail no contato de cada anúncio.',
        });
      }
      if (connection && !connection.enabled) {
        warnings.push({
          code: 'CONNECTION_DISABLED',
          message: 'O feed está desligado: a URL responde 404 e nenhum anúncio sai daqui.',
        });
      }
      if (connection?.enabled && connection.feedTokenHash === null) {
        warnings.push({
          code: 'FEED_TOKEN_MISSING',
          message: 'Gere a URL do feed e cadastre no Canal Pro.',
        });
      }
      if (
        connection?.enabled &&
        connection.feedTokenHash !== null &&
        !connection.lastCrawlerFetchAt
      ) {
        warnings.push({
          code: 'NO_CRAWLER_FETCH_YET',
          message:
            'O Grupo OLX ainda não buscou o feed. Cadastre a URL no Canal Pro (Integração de anúncios → Software → Desenvolvedor Próprio); a leitura acontece a cada 12 horas.',
        });
      }
      if (
        connection?.listingQuota !== null &&
        connection?.listingQuota !== undefined &&
        inFeedTotal > connection.listingQuota
      ) {
        warnings.push({
          code: 'QUOTA_EXCEEDED',
          message: `O feed tem ${String(inFeedTotal)} anúncios e a cota declarada é ${String(connection.listingQuota)}: o Grupo OLX desativa o excedente.`,
        });
      }
      if (
        connection?.featuredQuota !== null &&
        connection?.featuredQuota !== undefined &&
        premium > connection.featuredQuota
      ) {
        warnings.push({
          code: 'FEATURED_QUOTA_EXCEEDED',
          message: `${String(premium)} anúncios marcados como destaque para uma cota de ${String(connection.featuredQuota)}.`,
        });
      }
      if (
        connection?.superFeaturedQuota !== null &&
        connection?.superFeaturedQuota !== undefined &&
        superPremium > connection.superFeaturedQuota
      ) {
        warnings.push({
          code: 'SUPER_FEATURED_QUOTA_EXCEEDED',
          message: `${String(superPremium)} anúncios marcados como super destaque para uma cota de ${String(connection.superFeaturedQuota)}.`,
        });
      }
      if (desired > VRSYNC_MAX_LISTINGS) {
        warnings.push({
          code: 'FEED_OVER_LIMIT',
          message: `O Grupo OLX processa até ${String(VRSYNC_MAX_LISTINGS)} anúncios por arquivo; o excedente fica fora.`,
        });
      }
      if (!leadsWebhookConfigured) {
        warnings.push({
          code: 'LEADS_SECRET_MISSING',
          message:
            'Os leads do Grupo OLX ainda não chegam: a chave do webhook vem com a homologação do AchouImóvel Gestão.',
        });
      }

      return grupoOlxOverviewResponseSchema.parse({
        stage: CHANNEL_TYPE_FEATURES.grupoolx.stage,
        connection: connection ? toConnectionDto(connection) : null,
        publicContactEmail: agency.email,
        installation: { feedAvailable, leadsWebhookConfigured },
        counts: {
          total: [...byStatus.values()].reduce((sum, value) => sum + value.total, 0),
          pending: total('PENDING') + total('FAILED'),
          eligible: total('ELIGIBLE'),
          awaitingImport: total('AWAITING_IMPORT'),
          imported: total('IMPORTED'),
          importedWithWarnings: total('IMPORTED_WITH_WARNINGS'),
          importErrors: total('IMPORT_ERROR'),
          blocked: total('BLOCKED'),
          removing: total('REMOVING'),
          premium,
          superPremium,
        },
        leads: {
          received: leadCount?.received ?? 0,
          duplicates: connection?.leadDuplicateDeliveries ?? 0,
          lastReceivedAt: iso(connection?.lastLeadAt),
        },
        lastReport: lastReport
          ? grupoOlxImportReportSchema.parse({
              id: lastReport.id,
              externalReportId: lastReport.externalReportId,
              company: lastReport.company,
              reportDate: iso(lastReport.reportDate),
              receivedAt: lastReport.receivedAt.toISOString(),
              contracted: lastReport.contracted,
              created: lastReport.created,
              updated: lastReport.updated,
              deleted: lastReport.deleted,
              unchanged: lastReport.unchanged,
              errors: lastReport.errorCount,
              warnings: lastReport.warningCount,
              link: lastReport.link,
            })
          : null,
        warnings,
      });
    },
  );

  app.put(
    '/integrations/grupo-olx',
    { onRequest: [requirePermission('org:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const input = updateGrupoOlxConnectionRequestSchema.parse(request.body);
      const connection = await ensureConnection(db, auth.orgId);
      const [updated] = await db
        .update(channelConnections)
        .set({
          enabled: input.enabled,
          destinations: input.destinations,
          externalAccountId: input.externalAccountId,
          externalCustomerId: input.externalCustomerId,
          listingQuota: input.listingQuota,
          featuredQuota: input.featuredQuota,
          superFeaturedQuota: input.superFeaturedQuota,
          updatedAt: new Date(),
        })
        .where(eq(channelConnections.id, connection.id))
        .returning();
      if (!updated) {
        throw new Error('conexão do Grupo OLX não atualizada');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_CONNECTION_UPDATED,
        entityType: 'CHANNEL',
        entityId: GRUPO_OLX_CHANNEL,
        payload: { enabled: input.enabled, destinations: input.destinations },
      });
      return { connection: toConnectionDto(updated) };
    },
  );

  app.post(
    '/integrations/grupo-olx/feed-token',
    { onRequest: [requirePermission('org:manage')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const base = apiPublicUrl();
      if (base === null) {
        throw new DomainError(
          'CONFLICT',
          'Esta instalação não tem o endereço público da API (API_PUBLIC_URL): não há URL de feed para gerar.',
        );
      }
      const { token, connection } = await rotateFeedToken(db, auth.orgId);
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_FEED_TOKEN_ROTATED,
        entityType: 'CHANNEL',
        entityId: GRUPO_OLX_CHANNEL,
        // Nunca o token: só o final, que a tela também mostra.
        payload: { hint: connection.feedTokenHint },
      });
      return reply.status(201).send(
        grupoOlxFeedTokenResponseSchema.parse({
          feedUrl: buildFeedUrl(base, token),
          hint: connection.feedTokenHint,
          createdAt: iso(connection.feedTokenCreatedAt),
        }),
      );
    },
  );

  app.delete(
    '/integrations/grupo-olx/feed-token',
    { onRequest: [requirePermission('org:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const connection = await revokeFeedToken(db, auth.orgId);
      if (!connection) {
        throw new DomainError('NOT_FOUND', 'Integração com o Grupo OLX não configurada');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_FEED_TOKEN_REVOKED,
        entityType: 'CHANNEL',
        entityId: GRUPO_OLX_CHANNEL,
      });
      return { connection: toConnectionDto(connection) };
    },
  );

  app.get(
    '/integrations/grupo-olx/listings',
    { onRequest: [requirePermission('listing:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = z
        .object({
          status: z.string().max(40).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse(request.query);
      const conditions = [
        eq(listingChannelPublications.orgId, auth.orgId),
        eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
      ];
      if (query.status) {
        conditions.push(eq(listingChannelPublications.status, query.status));
      }
      const [totalRow] = await db
        .select({ total: count() })
        .from(listingChannelPublications)
        .where(and(...conditions));
      const rows = await db
        .select({ publication: listingChannelPublications, title: listings.title })
        .from(listingChannelPublications)
        .innerJoin(listings, eq(listings.id, listingChannelPublications.listingId))
        .where(and(...conditions))
        .orderBy(desc(listingChannelPublications.updatedAt))
        .limit(query.limit)
        .offset(query.offset);
      return grupoOlxListingsResponseSchema.parse({
        total: totalRow?.total ?? 0,
        items: rows.map(({ publication, title }) => ({
          listingId: publication.listingId,
          title,
          status: publication.status,
          publicationTier: publication.publicationTier ?? 'STANDARD',
          portalPropertyType: publication.portalPropertyType,
          issues: issuesOf(publication.issues),
          lastInFeedAt: iso(publication.lastInFeedAt),
          lastReportAt: iso(publication.lastReportAt),
          updatedAt: publication.updatedAt.toISOString(),
        })),
      });
    },
  );

  app.get(
    '/integrations/grupo-olx/listings/:listingId/property-type-options',
    { onRequest: [requirePermission('listing:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { listingId } = z.object({ listingId: uuidSchema }).parse(request.params);
      const [row] = await db
        .select({ propertyType: properties.propertyType })
        .from(listings)
        .innerJoin(properties, eq(properties.id, listings.propertyId))
        .where(and(eq(listings.id, listingId), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!row) {
        throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
      }
      const options = portalPropertyTypeOptions(row.propertyType);
      return grupoOlxPropertyTypeOptionsResponseSchema.parse({
        defaultType: options.defaultType,
        options: [...options.options],
      });
    },
  );

  app.patch(
    '/integrations/grupo-olx/listings/:listingId',
    { onRequest: [requirePermission('listing:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { listingId } = z.object({ listingId: uuidSchema }).parse(request.params);
      const input = grupoOlxListingSettingsRequestSchema.parse(request.body);
      const publication = await updateGrupoOlxSettings(db, auth.orgId, listingId, input);
      if (!publication) {
        throw new DomainError('NOT_FOUND', 'Anúncio não está no Grupo OLX');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_SETTINGS_UPDATED,
        entityType: 'LISTING',
        entityId: listingId,
        payload: { channel: GRUPO_OLX_CHANNEL, ...input },
      });
      return {
        status: publication.status,
        publicationTier: publication.publicationTier ?? 'STANDARD',
        portalPropertyType: publication.portalPropertyType,
        issues: issuesOf(publication.issues),
      };
    },
  );

  /**
   * O arquivo inteiro, para conferir no validador oficial (developers.grupozap.com/feeds/xml_validator)
   * — o upload lá é manual. Não conta como busca e não mexe no estado dos anúncios.
   */
  app.get(
    '/integrations/grupo-olx/feed-preview.xml',
    { onRequest: [requirePermission('org:manage')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const base = apiPublicUrl();
      if (base === null) {
        throw new DomainError(
          'CONFLICT',
          'Endereço público da API (API_PUBLIC_URL) não configurado',
        );
      }
      const connection = await ensureConnection(db, auth.orgId);
      const agency = await loadAgency(db, auth.orgId);
      const stream = Readable.from(
        generateGrupoOlxFeed({ db, connection, agency, apiPublicUrl: base, now: new Date() }),
      );
      return reply
        .type(XML_TYPE)
        .header('cache-control', 'no-store')
        .header('content-disposition', 'attachment; filename="grupo-olx-vrsync.xml"')
        .send(stream);
    },
  );

  // ------------------------------------------------------- rotas do robô

  /**
   * Feed VRSync que o Grupo OLX busca a cada 12 horas. O token (256 bits, só o hash no banco) é a
   * única credencial: a documentação não prevê usuário e senha. Token desconhecido, revogado,
   * conexão desligada ou imobiliária fora do ar dão a mesma resposta 404 — nada a enumerar.
   * Balde de limite próprio por token: atrás do Traefik todo mundo tem o mesmo IP (risco 1 do G0).
   */
  app.get(
    '/integrations/grupo-olx/feed/:file',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (request: { params?: unknown }) => {
            const params = request.params as { file?: string } | undefined;
            return `grupo-olx-feed:${(params?.file ?? '').slice(0, 12)}`;
          },
        },
      },
    },
    async (request, reply) => {
      const { file } = z.object({ file: z.string().max(80) }).parse(request.params);
      const token = file.endsWith('.xml') ? file.slice(0, -'.xml'.length) : '';
      const notFound: () => never = () => {
        throw new DomainError('NOT_FOUND', 'Feed não encontrado');
      };
      const base = apiPublicUrl();
      if (base === null) {
        return unavailable(reply, 'Feed indisponível nesta instalação');
      }
      const connection = (await findConnectionByFeedToken(db, token)) ?? notFound();
      if (!connection.enabled) notFound();
      const [org] = await db
        .select({ status: organizations.status })
        .from(organizations)
        .where(eq(organizations.id, connection.orgId))
        .limit(1);
      if (org?.status !== 'ACTIVE') notFound();

      const agency = await loadAgency(db, connection.orgId);
      const userAgent = request.headers['user-agent'];
      const isCrawler = isGrupoOlxCrawler(userAgent);
      const startedAt = new Date();
      const stream = Readable.from(
        generateGrupoOlxFeed({
          db,
          connection,
          agency,
          apiPublicUrl: base,
          now: startedAt,
          onComplete: async (summary, entries) => {
            await recordFeedFetch(db, {
              connection,
              isCrawler,
              userAgent,
              summary,
              startedAt,
              outcome: 'OK',
            });
            if (isCrawler) {
              await applyCrawlerFetch(db, connection.orgId, entries, startedAt);
            }
          },
          onAbort: async (summary, reason) => {
            await recordFeedFetch(db, {
              connection,
              isCrawler,
              userAgent,
              summary,
              startedAt,
              outcome: 'ERROR',
              errorMessage: reason,
            });
          },
          onBookkeepingError: (err) => {
            request.log.error({ err }, 'grupo-olx: falha ao registrar a busca do feed');
          },
        }),
      );
      return reply
        .type(XML_TYPE)
        .header('cache-control', 'no-store')
        .header('x-robots-tag', 'noindex, nofollow')
        .send(stream);
    },
  );

  /**
   * Foto em JPG com URL estável (`/{mediaId}/{versão}.jpg`): o Grupo OLX usa a URL como identidade da
   * imagem e baixa uma vez. Serve os bytes direto (sem redirecionar para URL assinada que vence) e só
   * foto pública de anúncio que está no feed de uma conexão ligada.
   */
  app.get(
    '/integrations/grupo-olx/media/:mediaId/:file',
    {
      config: {
        rateLimit: {
          max: 3000,
          timeWindow: '1 minute',
          keyGenerator: () => 'grupo-olx-media',
        },
      },
    },
    async (request, reply) => {
      const params = z
        .object({ mediaId: uuidSchema, file: z.string().regex(/^[0-9a-f]{16}\.jpg$/) })
        .safeParse(request.params);
      const notFound: () => never = () => {
        throw new DomainError('NOT_FOUND', 'Foto não encontrada');
      };
      if (!params.success) notFound();
      const { mediaId, file } = params.data;
      const version = file.slice(0, 16);
      if (!app.storage) {
        return unavailable(reply, 'Storage não configurado');
      }
      const [media] = await db
        .select({
          storageKey: propertyMedia.storageKey,
          sizeBytes: propertyMedia.sizeBytes,
          orgId: propertyMedia.orgId,
        })
        .from(propertyMedia)
        .innerJoin(listings, eq(listings.propertyId, propertyMedia.propertyId))
        .innerJoin(
          listingChannelPublications,
          and(
            eq(listingChannelPublications.listingId, listings.id),
            eq(listingChannelPublications.channel, GRUPO_OLX_CHANNEL),
            inArray(listingChannelPublications.status, [...FEED_DESIRED_STATUSES]),
          ),
        )
        .innerJoin(
          channelConnections,
          and(
            eq(channelConnections.orgId, propertyMedia.orgId),
            eq(channelConnections.channel, GRUPO_OLX_CHANNEL),
            eq(channelConnections.enabled, true),
          ),
        )
        .where(
          and(
            eq(propertyMedia.id, mediaId),
            eq(propertyMedia.kind, 'PHOTO'),
            eq(propertyMedia.isPublic, true),
            eq(listings.status, 'PUBLISHED'),
          ),
        )
        .limit(1);
      if (
        !media ||
        !/\.jpe?g$/i.test(media.storageKey) ||
        (media.sizeBytes ?? Number.POSITIVE_INFINITY) > VRSYNC_MAX_IMAGE_BYTES ||
        mediaVersion(media.storageKey, media.sizeBytes) !== version
      ) {
        notFound();
      }
      const bytes = await app.storage.getObject(media.storageKey);
      // A extensão é declarada pelo navegador no envio: confere a assinatura do JPEG antes de servir.
      if (
        !bytes ||
        bytes.length < 3 ||
        bytes[0] !== 0xff ||
        bytes[1] !== 0xd8 ||
        bytes[2] !== 0xff
      ) {
        request.log.warn({ mediaId }, 'grupo-olx: foto sem assinatura JPEG não servida');
        notFound();
      }
      return reply
        .type('image/jpeg')
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('etag', `"${version}"`)
        .header('x-robots-tag', 'noindex')
        .send(bytes);
    },
  );

  return Promise.resolve();
};
