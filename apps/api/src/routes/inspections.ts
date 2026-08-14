import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  inspections,
  inspectionRooms,
  inspectionMedia,
  inspectionTranscripts,
  inspectionAiSuggestions,
  inspectionObservations,
  inspectionComparisons,
  webhookInbox,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  computeInspectionDifferences,
  isInspectionStatus,
  transitionInspection,
} from '@aluguei/domain';
import type { InspectionStatus } from '@aluguei/domain';
import {
  confirmInspectionMediaRequestSchema,
  createComparisonRequestSchema,
  createInspectionRequestSchema,
  createObservationRequestSchema,
  createRoomRequestSchema,
  inspectionAggregateSchema,
  inspectionComparisonSchema,
  inspectionMediaSchema,
  inspectionObservationSchema,
  inspectionReportSchema,
  inspectionRoomSchema,
  inspectionSummarySchema,
  inspectionMediaUploadUrlRequestSchema,
  listInspectionsQuerySchema,
  resolveSuggestionRequestSchema,
  updateInspectionStatusRequestSchema,
  uuidSchema,
  inspectionUploadUrlResponseSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import {
  assertInspectionSizeAllowed,
  buildInspectionStorageKey,
  inferInspectionKindFromKey,
} from '../media-rules.js';
import { first } from './helpers.js';

type InspectionRow = typeof inspections.$inferSelect;

function toSummary(row: InspectionRow): unknown {
  return inspectionSummarySchema.parse({
    id: row.id,
    orgId: row.orgId,
    propertyId: row.propertyId,
    type: row.type,
    status: row.status,
    startedBy: row.startedBy,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toRoom(row: typeof inspectionRooms.$inferSelect): unknown {
  return inspectionRoomSchema.parse({
    id: row.id,
    inspectionId: row.inspectionId,
    name: row.name,
    orderIndex: row.orderIndex,
  });
}

function toMedia(row: typeof inspectionMedia.$inferSelect): unknown {
  return inspectionMediaSchema.parse({
    id: row.id,
    inspectionId: row.inspectionId,
    roomId: row.roomId,
    kind: row.kind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    durationMs: row.durationMs,
    isEvidence: row.isEvidence,
    capturedAt: row.capturedAt?.toISOString() ?? null,
  });
}

function toObservation(row: typeof inspectionObservations.$inferSelect): unknown {
  return inspectionObservationSchema.parse({
    id: row.id,
    inspectionId: row.inspectionId,
    roomId: row.roomId,
    mediaId: row.mediaId,
    category: row.category,
    severity: row.severity,
    description: row.description,
    source: row.source,
    status: row.status,
    aiSuggestionId: row.aiSuggestionId,
    createdAt: row.createdAt.toISOString(),
  });
}

/** Conta pendências para os guards da máquina de estado. */
async function transitionCounts(db: AppDb, orgId: string, inspectionId: string) {
  const [pendingTranscripts, pendingSuggestions, draftObservations] = await Promise.all([
    db
      .select({ count: inspectionTranscripts.id })
      .from(inspectionTranscripts)
      .where(
        and(
          eq(inspectionTranscripts.inspectionId, inspectionId),
          eq(inspectionTranscripts.status, 'PENDING'),
        ),
      ),
    db
      .select({ count: inspectionAiSuggestions.id })
      .from(inspectionAiSuggestions)
      .where(
        and(
          eq(inspectionAiSuggestions.inspectionId, inspectionId),
          eq(inspectionAiSuggestions.status, 'PENDING'),
        ),
      ),
    db
      .select({ count: inspectionObservations.id })
      .from(inspectionObservations)
      .where(
        and(
          eq(inspectionObservations.inspectionId, inspectionId),
          eq(inspectionObservations.status, 'DRAFT'),
        ),
      ),
  ]);
  return {
    pendingTranscripts: pendingTranscripts.length,
    pendingSuggestions: pendingSuggestions.length,
    draftObservations: draftObservations.length,
  };
}

export const inspectionRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/inspections',
    { onRequest: [requirePermission('inspection:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createInspectionRequestSchema.parse(request.body);
      const inspection = first(
        await db
          .insert(inspections)
          .values({
            orgId: auth.orgId,
            propertyId: input.propertyId,
            type: input.type,
            scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
            notes: input.notes ?? null,
            startedBy: auth.userId,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_CREATED,
        entityType: 'INSPECTION',
        entityId: inspection.id,
      });
      return reply.status(201).send({ inspection: toSummary(inspection) });
    },
  );

  app.get(
    '/inspections',
    { onRequest: [requirePermission('inspection:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listInspectionsQuerySchema.parse(request.query);
      const where = and(
        eq(inspections.orgId, auth.orgId),
        query.status ? eq(inspections.status, query.status) : undefined,
        query.type ? eq(inspections.type, query.type) : undefined,
        query.propertyId ? eq(inspections.propertyId, query.propertyId) : undefined,
      );
      const rows = await db
        .select()
        .from(inspections)
        .where(where)
        .orderBy(desc(inspections.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return {
        inspections: rows.map((row) => toSummary(row)),
        total: rows.length,
      };
    },
  );

  app.get(
    '/inspections/:id',
    { onRequest: [requirePermission('inspection:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [inspection] = await db
        .select()
        .from(inspections)
        .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
        .limit(1);
      if (!inspection) {
        throw new DomainError('NOT_FOUND', 'Vistoria não encontrada');
      }
      const [rooms, media, transcripts, observations, aiSuggestions] = await Promise.all([
        db.select().from(inspectionRooms).where(eq(inspectionRooms.inspectionId, id)),
        db.select().from(inspectionMedia).where(eq(inspectionMedia.inspectionId, id)),
        db.select().from(inspectionTranscripts).where(eq(inspectionTranscripts.inspectionId, id)),
        db.select().from(inspectionObservations).where(eq(inspectionObservations.inspectionId, id)),
        db
          .select()
          .from(inspectionAiSuggestions)
          .where(eq(inspectionAiSuggestions.inspectionId, id)),
      ]);
      return inspectionAggregateSchema.parse({
        inspection: toSummary(inspection),
        rooms: rooms.map((row) => toRoom(row)),
        media: media.map((row) => toMedia(row)),
        transcripts: transcripts.map((row) => ({
          id: row.id,
          inspectionId: row.inspectionId,
          mediaId: row.mediaId,
          text: row.text,
          status: row.status,
          aiModel: row.aiModel,
        })),
        observations: observations.map((row) => toObservation(row)),
        aiSuggestions: aiSuggestions.map((row) => ({
          id: row.id,
          inspectionId: row.inspectionId,
          mediaId: row.mediaId,
          transcriptId: row.transcriptId,
          kind: row.kind,
          payload: row.payload as Record<string, unknown>,
          confidence: row.confidence,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    },
  );

  app.post(
    '/inspections/:id/rooms',
    { onRequest: [requirePermission('inspection:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createRoomRequestSchema.parse(request.body);
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      const room = first(
        await db
          .insert(inspectionRooms)
          .values({ orgId: auth.orgId, inspectionId: inspection.id, name: input.name })
          .returning(),
      );
      return reply.status(201).send({ room: toRoom(room) });
    },
  );

  app.post(
    '/inspections/:id/media/upload-url',
    { onRequest: [requirePermission('inspection:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = inspectionMediaUploadUrlRequestSchema.parse(request.body);
      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      assertInspectionSizeAllowed(input.kind, input.sizeBytes);
      const key = buildInspectionStorageKey(auth.orgId, inspection.id, input.kind, input.mimeType);
      const { url, expiresIn } = await app.storage.getPresignedPutUrl({
        key,
        contentType: input.mimeType,
      });
      return inspectionUploadUrlResponseSchema.parse({ url, key, expiresIn });
    },
  );

  app.post(
    '/inspections/:id/media/confirm',
    { onRequest: [requirePermission('inspection:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = confirmInspectionMediaRequestSchema.parse(request.body);
      if (!app.storage) {
        throw new DomainError('INVALID_INPUT', 'Storage não configurado');
      }
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      if (!input.key.startsWith(`orgs/${auth.orgId}/inspections/${inspection.id}/`)) {
        throw new DomainError('INVALID_INPUT', 'Chave de storage inválida');
      }
      const head = await app.storage.headObject(input.key);
      if (!head) {
        throw new DomainError('INVALID_INPUT', 'Objeto não encontrado no storage');
      }
      const kind = inferInspectionKindFromKey(input.key);
      assertInspectionSizeAllowed(kind, head.size);
      const media = first(
        await db
          .insert(inspectionMedia)
          .values({
            orgId: auth.orgId,
            inspectionId: inspection.id,
            kind,
            storageKey: input.key,
            mimeType: null,
            sizeBytes: head.size,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_MEDIA_CONFIRMED,
        entityType: 'INSPECTION',
        entityId: inspection.id,
        payload: { mediaId: media.id, kind },
      });
      return reply.status(201).send({ media: toMedia(media) });
    },
  );

  app.delete(
    '/inspections/:id/media/:mediaId',
    { onRequest: [requirePermission('inspection:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, mediaId } = z
        .object({ id: uuidSchema, mediaId: uuidSchema })
        .parse(request.params);
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      const [media] = await db
        .select()
        .from(inspectionMedia)
        .where(
          and(eq(inspectionMedia.id, mediaId), eq(inspectionMedia.inspectionId, inspection.id)),
        )
        .limit(1);
      if (media) {
        await db.delete(inspectionMedia).where(eq(inspectionMedia.id, media.id));
        if (app.storage) {
          await app.storage.deleteObject(media.storageKey).catch(() => undefined);
        }
      }
      return { ok: true as const };
    },
  );

  app.post(
    '/inspections/:id/process',
    { onRequest: [requirePermission('inspection:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [inspection] = await db
        .select()
        .from(inspections)
        .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
        .limit(1);
      if (!inspection) {
        throw new DomainError('NOT_FOUND', 'Vistoria não encontrada');
      }
      if (!isInspectionStatus(inspection.status)) {
        throw new Error(`inspection status inválido: ${inspection.status}`);
      }
      if (inspection.status === 'CAPTURING' || inspection.status === 'PROCESSING') {
        transitionInspection(inspection.status as InspectionStatus, 'PROCESSING');
        await db
          .update(inspections)
          .set({ status: 'PROCESSING', updatedAt: new Date() })
          .where(eq(inspections.id, inspection.id));
      }
      await db
        .insert(webhookInbox)
        .values({
          orgId: auth.orgId,
          provider: 'INSPECTION',
          providerEventId: `${auth.orgId}:${inspection.id}:PROCESS`,
          payload: { inspectionId: inspection.id },
        })
        .onConflictDoNothing();
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_PROCESS_REQUESTED,
        entityType: 'INSPECTION',
        entityId: inspection.id,
      });
      return reply.status(202).send({ ok: true as const });
    },
  );

  app.post(
    '/inspections/:id/observations',
    { onRequest: [requirePermission('inspection:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createObservationRequestSchema.parse(request.body);
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      const observation = first(
        await db
          .insert(inspectionObservations)
          .values({
            orgId: auth.orgId,
            inspectionId: inspection.id,
            roomId: input.roomId ?? null,
            mediaId: input.mediaId ?? null,
            category: input.category,
            severity: input.severity,
            description: input.description,
            source: 'HUMAN',
            status: 'CONFIRMED',
            createdBy: auth.userId,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_OBSERVATION_CREATED,
        entityType: 'INSPECTION',
        entityId: inspection.id,
      });
      return reply.status(201).send({ observation: toObservation(observation) });
    },
  );

  app.patch(
    '/inspections/:id/ai-suggestions/:suggestionId',
    { onRequest: [requirePermission('inspection:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id, suggestionId } = z
        .object({ id: uuidSchema, suggestionId: uuidSchema })
        .parse(request.params);
      const input = resolveSuggestionRequestSchema.parse(request.body);
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      const [suggestion] = await db
        .select()
        .from(inspectionAiSuggestions)
        .where(
          and(
            eq(inspectionAiSuggestions.id, suggestionId),
            eq(inspectionAiSuggestions.inspectionId, inspection.id),
          ),
        )
        .limit(1);
      if (!suggestion) {
        throw new DomainError('NOT_FOUND', 'Sugestão não encontrada');
      }
      if (suggestion.status !== 'PENDING') {
        throw new DomainError('CONFLICT', 'Sugestão já resolvida');
      }
      const payload = suggestion.payload as {
        category?: string;
        severity?: string;
        description?: string;
      };

      let observation: typeof inspectionObservations.$inferSelect | null = null;
      if (input.action === 'ACCEPT' || input.action === 'EDIT') {
        const [created] = await db
          .insert(inspectionObservations)
          .values({
            orgId: auth.orgId,
            inspectionId: inspection.id,
            mediaId: suggestion.mediaId,
            category: payload.category ?? 'OTHER',
            severity: payload.severity ?? 'NONE',
            description: input.description ?? payload.description ?? '',
            source: 'AI',
            status: input.action === 'EDIT' ? 'EDITED' : 'CONFIRMED',
            aiSuggestionId: suggestion.id,
            createdBy: auth.userId,
          })
          .returning();
        observation = created ?? null;
      }
      const [updated] = await db
        .update(inspectionAiSuggestions)
        .set({ status: input.action, updatedAt: new Date() })
        .where(eq(inspectionAiSuggestions.id, suggestion.id))
        .returning();
      if (!updated) {
        throw new Error('suggestion update failed');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_SUGGESTION_RESOLVED,
        entityType: 'INSPECTION',
        entityId: inspection.id,
        payload: { suggestionId: suggestion.id, action: input.action },
      });
      return {
        suggestion: {
          id: updated.id,
          inspectionId: updated.inspectionId,
          mediaId: updated.mediaId,
          transcriptId: updated.transcriptId,
          kind: updated.kind,
          payload: updated.payload as Record<string, unknown>,
          confidence: updated.confidence,
          status: updated.status,
          createdAt: updated.createdAt.toISOString(),
        },
        observation: observation ? toObservation(observation) : null,
      };
    },
  );

  app.get(
    '/inspections/:id/review',
    { onRequest: [requirePermission('inspection:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const inspection = first(
        await db
          .select()
          .from(inspections)
          .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
          .limit(1),
      );
      const [observations, aiSuggestions] = await Promise.all([
        db
          .select()
          .from(inspectionObservations)
          .where(eq(inspectionObservations.inspectionId, inspection.id)),
        db
          .select()
          .from(inspectionAiSuggestions)
          .where(eq(inspectionAiSuggestions.inspectionId, inspection.id)),
      ]);
      return {
        observations: observations.map((row) => toObservation(row)),
        aiSuggestions: aiSuggestions.map((row) => ({
          id: row.id,
          inspectionId: row.inspectionId,
          mediaId: row.mediaId,
          transcriptId: row.transcriptId,
          kind: row.kind,
          payload: row.payload as Record<string, unknown>,
          confidence: row.confidence,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
  );

  app.patch(
    '/inspections/:id/status',
    { onRequest: [requirePermission('inspection:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateInspectionStatusRequestSchema.parse(request.body);
      const [inspection] = await db
        .select()
        .from(inspections)
        .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
        .limit(1);
      if (!inspection) {
        throw new DomainError('NOT_FOUND', 'Vistoria não encontrada');
      }
      if (!isInspectionStatus(inspection.status) || !isInspectionStatus(input.status)) {
        throw new Error('inspection status inválido');
      }
      if (input.status === 'SIGNED') {
        throw new DomainError('INVALID_INPUT', 'Assinatura de vistoria entra na Fase 07');
      }
      const ctx = await transitionCounts(db, auth.orgId, inspection.id);
      transitionInspection(
        inspection.status as InspectionStatus,
        input.status as InspectionStatus,
        ctx,
      );
      const patch: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.status === 'COMPLETED') {
        patch.completedBy = auth.userId;
      }
      const updated = first(
        await db
          .update(inspections)
          .set(patch as never)
          .where(eq(inspections.id, inspection.id))
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_STATUS_CHANGED,
        entityType: 'INSPECTION',
        entityId: inspection.id,
        payload: { from: inspection.status, to: input.status },
      });
      return { inspection: toSummary(updated) };
    },
  );

  app.post(
    '/inspections/:id/compare',
    { onRequest: [requirePermission('inspection:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createComparisonRequestSchema.parse(request.body);
      const [checkin] = await db
        .select()
        .from(inspections)
        .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
        .limit(1);
      const [checkout] = await db
        .select()
        .from(inspections)
        .where(
          and(eq(inspections.id, input.checkoutInspectionId), eq(inspections.orgId, auth.orgId)),
        )
        .limit(1);
      if (!checkin || !checkout) {
        throw new DomainError('NOT_FOUND', 'Vistoria não encontrada');
      }
      if (checkin.type !== 'CHECKIN' || checkout.type !== 'CHECKOUT') {
        throw new DomainError(
          'INVALID_INPUT',
          'Comparação exige uma vistoria de entrada e uma de saída',
        );
      }
      if (checkin.propertyId !== checkout.propertyId) {
        throw new DomainError('INVALID_INPUT', 'Vistorias de imóveis diferentes');
      }
      if (checkin.status !== 'COMPLETED' || checkout.status !== 'COMPLETED') {
        throw new DomainError('INVALID_INPUT', 'Ambas as vistorias precisam estar COMPLETED');
      }
      const [checkinObs, checkoutObs] = await Promise.all([
        db
          .select()
          .from(inspectionObservations)
          .where(eq(inspectionObservations.inspectionId, checkin.id)),
        db
          .select()
          .from(inspectionObservations)
          .where(eq(inspectionObservations.inspectionId, checkout.id)),
      ]);
      const [rooms, checkinRooms, checkoutRooms] = await Promise.all([
        db.select().from(inspectionRooms),
        db.select().from(inspectionRooms).where(eq(inspectionRooms.inspectionId, checkin.id)),
        db.select().from(inspectionRooms).where(eq(inspectionRooms.inspectionId, checkout.id)),
      ]);
      void rooms;
      const roomName = new Map(
        [...checkinRooms, ...checkoutRooms].map((room) => [room.id, room.name]),
      );
      const toComparable = (row: typeof inspectionObservations.$inferSelect) => ({
        roomId: row.roomId,
        roomName: row.roomId ? (roomName.get(row.roomId) ?? null) : null,
        category: row.category,
        severity: row.severity,
        description: row.description,
      });
      const differences = computeInspectionDifferences(
        checkinObs.map(toComparable),
        checkoutObs.map(toComparable),
      );
      const comparison = first(
        await db
          .insert(inspectionComparisons)
          .values({
            orgId: auth.orgId,
            checkinInspectionId: checkin.id,
            checkoutInspectionId: checkout.id,
            differences: differences as unknown as Record<string, unknown>,
            createdBy: auth.userId,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.INSPECTION_COMPARISON_CREATED,
        entityType: 'INSPECTION',
        entityId: checkin.id,
      });
      return reply.status(201).send(
        inspectionComparisonSchema.parse({
          id: comparison.id,
          checkinInspectionId: comparison.checkinInspectionId,
          checkoutInspectionId: comparison.checkoutInspectionId,
          status: comparison.status,
          differences: comparison.differences as Record<string, unknown>,
          createdAt: comparison.createdAt.toISOString(),
        }),
      );
    },
  );

  app.get(
    '/inspections/:id/report',
    { onRequest: [requirePermission('inspection:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [inspection] = await db
        .select()
        .from(inspections)
        .where(and(eq(inspections.id, id), eq(inspections.orgId, auth.orgId)))
        .limit(1);
      if (!inspection) {
        throw new DomainError('NOT_FOUND', 'Vistoria não encontrada');
      }
      const [rooms, media, transcripts, observations, aiSuggestions] = await Promise.all([
        db.select().from(inspectionRooms).where(eq(inspectionRooms.inspectionId, id)),
        db.select().from(inspectionMedia).where(eq(inspectionMedia.inspectionId, id)),
        db.select().from(inspectionTranscripts).where(eq(inspectionTranscripts.inspectionId, id)),
        db.select().from(inspectionObservations).where(eq(inspectionObservations.inspectionId, id)),
        db
          .select()
          .from(inspectionAiSuggestions)
          .where(eq(inspectionAiSuggestions.inspectionId, id)),
      ]);
      const mediaCounts: Record<string, number> = {};
      for (const item of media) {
        mediaCounts[item.kind] = (mediaCounts[item.kind] ?? 0) + 1;
      }
      return inspectionReportSchema.parse({
        inspection: toSummary(inspection),
        rooms: rooms.map((row) => toRoom(row)),
        observations: observations.map((row) => toObservation(row)),
        aiSuggestions: aiSuggestions.map((row) => ({
          id: row.id,
          inspectionId: row.inspectionId,
          mediaId: row.mediaId,
          transcriptId: row.transcriptId,
          kind: row.kind,
          payload: row.payload as Record<string, unknown>,
          confidence: row.confidence,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
        transcripts: transcripts.map((row) => ({
          id: row.id,
          inspectionId: row.inspectionId,
          mediaId: row.mediaId,
          text: row.text,
          status: row.status,
          aiModel: row.aiModel,
        })),
        mediaCounts,
      });
    },
  );

  return Promise.resolve();
};
