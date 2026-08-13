import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listingChannelPublications, listings } from '@aluguei/db';
import type { channelSyncJobs } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  isChannelPublicationStatus,
  transitionChannelPublication,
} from '@aluguei/domain';
import type { ChannelPublicationStatus, ChannelType } from '@aluguei/domain';
import {
  channelPublicationSchema,
  channelSyncJobSchema,
  channelSummarySchema,
  channelTypeSchema,
  importLeadsRequestSchema,
  listChannelsResponseSchema,
  publishRequestSchema,
  reconcileRequestSchema,
  removeRequestSchema,
  updateRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { getChannelAdapter } from '@aluguei/integrations';
import type { FakeChannel, IListingChannelAdapter } from '@aluguei/integrations';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { buildChannelListingInput, enqueueChannelJob } from './channel-jobs.js';
import { first } from './helpers.js';

declare module 'fastify' {
  interface FastifyInstance {
    channels: { fake?: FakeChannel };
  }
}

function toPublicationDto(row: typeof listingChannelPublications.$inferSelect): unknown {
  return channelPublicationSchema.parse({
    id: row.id,
    orgId: row.orgId,
    listingId: row.listingId,
    channel: row.channel,
    channelListingId: row.channelListingId,
    status: row.status,
    lastError: row.lastError,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toJobDto(row: typeof channelSyncJobs.$inferSelect): unknown {
  return channelSyncJobSchema.parse({
    id: row.id,
    orgId: row.orgId,
    listingId: row.listingId,
    channel: row.channel,
    jobType: row.jobType,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    runAt: row.runAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

/** Resolve adapter; canais reais sem contrato → 404 (nunca inventar endpoints). */
function resolveAdapter(app: FastifyApp, channel: ChannelType): IListingChannelAdapter {
  const adapter = getChannelAdapter(channel, app.channels);
  if (!adapter) {
    throw new DomainError('NOT_FOUND', 'Canal não configurado');
  }
  return adapter;
}

type FastifyApp = Parameters<FastifyPluginAsync>[0];

async function loadPublication(
  db: FastifyApp['db'],
  orgId: string,
  listingId: string,
  channel: string,
) {
  const [publication] = await db
    .select()
    .from(listingChannelPublications)
    .where(
      and(
        eq(listingChannelPublications.listingId, listingId),
        eq(listingChannelPublications.channel, channel),
        eq(listingChannelPublications.orgId, orgId),
      ),
    )
    .limit(1);
  return publication ?? null;
}

async function upsertPublication(
  db: FastifyApp['db'],
  orgId: string,
  listingId: string,
  channel: string,
  status: ChannelPublicationStatus,
): Promise<typeof listingChannelPublications.$inferSelect> {
  const existing = await loadPublication(db, orgId, listingId, channel);
  if (existing) {
    return first(
      await db
        .update(listingChannelPublications)
        .set({ status, updatedAt: new Date() })
        .where(eq(listingChannelPublications.id, existing.id))
        .returning(),
    );
  }
  return first(
    await db
      .insert(listingChannelPublications)
      .values({ orgId, listingId, channel, status })
      .returning(),
  );
}

export const channelRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/listings/:id/channels/:channel/publish',
    { onRequest: [requirePermission('listing:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const params = z.object({ id: uuidSchema, channel: channelTypeSchema }).parse(request.params);
      publishRequestSchema.parse(request.body);

      const adapter = resolveAdapter(app, params.channel);
      const [listing] = await db

        .select()
        .from(listings)
        .where(and(eq(listings.id, params.id), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!listing) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const input = await buildChannelListingInput(db, auth.orgId, listing);
      const validation = await adapter.validate(input);
      if (!validation.valid) {
        throw new DomainError('INVALID_INPUT', validation.errors.join('; '));
      }

      const existing = await loadPublication(db, auth.orgId, listing.id, params.channel);
      // Normaliza o estado de desejo: FAILED/REMOVED voltam a PENDING antes de publicar;
      // já PUBLISHED permanece (republish reusa o job via idempotency_key).
      let target: ChannelPublicationStatus = 'PUBLISHING';
      if (existing) {
        if (!isChannelPublicationStatus(existing.status)) {
          throw new Error(`publication status inválido: ${existing.status}`);
        }
        if (existing.status === 'FAILED' || existing.status === 'REMOVED') {
          transitionChannelPublication(existing.status as ChannelPublicationStatus, 'PENDING');
          await upsertPublication(db, auth.orgId, listing.id, params.channel, 'PENDING');
        }
        if (existing.status === 'PUBLISHED') {
          target = 'PUBLISHED';
        }
      } else {
        // Nova publicação: parte de PENDING (estado inicial do schema).
        await upsertPublication(db, auth.orgId, listing.id, params.channel, 'PENDING');
      }
      const publication = await upsertPublication(
        db,
        auth.orgId,
        listing.id,
        params.channel,
        target,
      );
      const job = await enqueueChannelJob(db, {
        orgId: auth.orgId,
        listingId: listing.id,
        channel: params.channel,
        jobType: 'PUBLISH',
        payload: { listingId: listing.id },
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_PUBLISH_REQUESTED,
        entityType: 'LISTING',
        entityId: listing.id,
        payload: { channel: params.channel },
      });

      return reply
        .status(201)
        .send({ publication: toPublicationDto(publication), job: toJobDto(job) });
    },
  );

  app.post(
    '/listings/:id/channels/:channel/update',
    { onRequest: [requirePermission('listing:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const params = z.object({ id: uuidSchema, channel: channelTypeSchema }).parse(request.params);
      updateRequestSchema.parse(request.body);
      resolveAdapter(app, params.channel);

      const [listing] = await db

        .select()
        .from(listings)
        .where(and(eq(listings.id, params.id), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!listing) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const existing = await loadPublication(db, auth.orgId, listing.id, params.channel);
      if (!existing || existing.status !== 'PUBLISHED') {
        throw new DomainError('CONFLICT', 'Publicação não está ativa no canal');
      }
      const status = transitionChannelPublication('PUBLISHED', 'UPDATE_PENDING');
      const publication = await upsertPublication(
        db,
        auth.orgId,
        listing.id,
        params.channel,
        status,
      );
      const input = await buildChannelListingInput(db, auth.orgId, listing);
      const job = await enqueueChannelJob(db, {
        orgId: auth.orgId,
        listingId: listing.id,
        channel: params.channel,
        jobType: 'UPDATE',
        payload: { listingId: listing.id, input },
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_UPDATE_REQUESTED,
        entityType: 'LISTING',
        entityId: listing.id,
        payload: { channel: params.channel },
      });

      return reply
        .status(200)
        .send({ publication: toPublicationDto(publication), job: toJobDto(job) });
    },
  );

  app.post(
    '/listings/:id/channels/:channel/remove',
    { onRequest: [requirePermission('listing:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const params = z.object({ id: uuidSchema, channel: channelTypeSchema }).parse(request.params);
      removeRequestSchema.parse(request.body);
      resolveAdapter(app, params.channel);

      const [listing] = await db

        .select()
        .from(listings)
        .where(and(eq(listings.id, params.id), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!listing) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const existing = await loadPublication(db, auth.orgId, listing.id, params.channel);
      if (!existing) {
        throw new DomainError('NOT_FOUND', 'Publicação não encontrada no canal');
      }
      if (!isChannelPublicationStatus(existing.status)) {
        throw new Error(`publication status inválido: ${existing.status}`);
      }
      const status = transitionChannelPublication(
        existing.status as ChannelPublicationStatus,
        'REMOVING',
      );
      const publication = await upsertPublication(
        db,
        auth.orgId,
        listing.id,
        params.channel,
        status,
      );
      const job = await enqueueChannelJob(db, {
        orgId: auth.orgId,
        listingId: listing.id,
        channel: params.channel,
        jobType: 'REMOVE',
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_REMOVE_REQUESTED,
        entityType: 'LISTING',
        entityId: listing.id,
        payload: { channel: params.channel },
      });

      return reply
        .status(200)
        .send({ publication: toPublicationDto(publication), job: toJobDto(job) });
    },
  );

  app.post(
    '/channels/:channel/reconcile',
    { onRequest: [requirePermission('listing:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { channel } = z.object({ channel: channelTypeSchema }).parse(request.params);
      const input = reconcileRequestSchema.parse(request.body);
      resolveAdapter(app, channel);

      // Escopo do listingId: pertence à org (senão 404).
      if (input.listingId) {
        const [listing] = await db
          .select()
          .from(listings)
          .where(and(eq(listings.id, input.listingId), eq(listings.orgId, auth.orgId)))
          .limit(1);
        if (!listing) {
          throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
        }
      }

      const jobInput: Parameters<typeof enqueueChannelJob>[1] = {
        orgId: auth.orgId,
        listingId: input.listingId ?? null,
        channel,
        jobType: 'RECONCILE',
      };
      if (input.listingId) {
        jobInput.payload = { listingId: input.listingId };
      }
      const job = await enqueueChannelJob(db, jobInput);

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_RECONCILE_REQUESTED,
        entityType: 'CHANNEL',
        entityId: channel,
      });

      return reply.status(201).send({ job: toJobDto(job), processed: 0 });
    },
  );

  app.post(
    '/channels/:channel/import-leads',
    { onRequest: [requirePermission('listing:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { channel } = z.object({ channel: channelTypeSchema }).parse(request.params);
      importLeadsRequestSchema.parse(request.body);
      const adapter = resolveAdapter(app, channel);
      if (!adapter.supportsImportLeads) {
        throw new DomainError('INVALID_INPUT', 'Canal não suporta importação de leads');
      }

      const job = await enqueueChannelJob(db, {
        orgId: auth.orgId,
        listingId: null,
        channel,
        jobType: 'IMPORT_LEADS',
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHANNEL_IMPORT_LEADS_REQUESTED,
        entityType: 'CHANNEL',
        entityId: channel,
      });

      return reply.status(201).send({ job: toJobDto(job), imported: 0 });
    },
  );

  app.get(
    '/listings/:id/channels',
    { onRequest: [requirePermission('listing:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [listing] = await db

        .select()
        .from(listings)
        .where(and(eq(listings.id, id), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!listing) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const rows = await db
        .select()
        .from(listingChannelPublications)
        .where(eq(listingChannelPublications.listingId, listing.id));
      return listChannelsResponseSchema.parse({
        channels: rows.map((row) => toPublicationDto(row)),
      });
    },
  );

  app.get(
    '/channels/summary',
    { onRequest: [requirePermission('listing:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const publications = await db
        .select()
        .from(listingChannelPublications)
        .where(eq(listingChannelPublications.orgId, auth.orgId));
      const listingIds = [...new Set(publications.map((p) => p.listingId))];
      const listingRows =
        listingIds.length > 0
          ? await db.select().from(listings).where(inArray(listings.id, listingIds))
          : [];
      const listingById = new Map(listingRows.map((l) => [l.id, l]));

      const byChannel = new Map<
        string,
        { total: number; published: number; pending: number; failed: number; removed: number }
      >();
      for (const p of publications) {
        const agg = byChannel.get(p.channel) ?? {
          total: 0,
          published: 0,
          pending: 0,
          failed: 0,
          removed: 0,
        };
        agg.total += 1;
        if (p.status === 'PUBLISHED') agg.published += 1;
        if (
          p.status === 'PENDING' ||
          p.status === 'PUBLISHING' ||
          p.status === 'UPDATE_PENDING' ||
          p.status === 'RECONCILING'
        )
          agg.pending += 1;
        if (p.status === 'FAILED') agg.failed += 1;
        if (p.status === 'REMOVED') agg.removed += 1;
        byChannel.set(p.channel, agg);
      }

      const byListing = new Map<
        string,
        Array<{ channel: string; status: string; lastError: string | null }>
      >();
      for (const p of publications) {
        const arr = byListing.get(p.listingId) ?? [];
        arr.push({ channel: p.channel, status: p.status, lastError: p.lastError });
        byListing.set(p.listingId, arr);
      }

      return channelSummarySchema.parse({
        channels: [...byChannel.entries()].map(([channel, agg]) => ({ channel, ...agg })),
        listings: [...byListing.entries()].map(([listingId, channels]) => ({
          listingId,
          title: listingById.get(listingId)?.title ?? '?',
          channels: channels.map((c) => ({
            channel: c.channel,
            status: c.status,
            lastError: c.lastError,
          })),
        })),
      });
    },
  );

  return Promise.resolve();
};
