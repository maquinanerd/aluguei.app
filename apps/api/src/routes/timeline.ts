import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { timelineEvents } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import {
  createTimelineEventRequestSchema,
  createTimelineEventResponseSchema,
  listTimelineQuerySchema,
  listTimelineResponseSchema,
  timelineEventSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

function toTimelineDto(row: typeof timelineEvents.$inferSelect): unknown {
  return timelineEventSchema.parse({
    id: row.id,
    orgId: row.orgId,
    entityType: row.entityType,
    entityId: row.entityId,
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
    actorUserId: row.actorUserId,
    occurredAt: row.occurredAt.toISOString(),
  });
}

export const timelineRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/timeline',
    { onRequest: [requirePermission('timeline:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createTimelineEventRequestSchema.parse(request.body);

      const event = first(
        await db
          .insert(timelineEvents)
          .values({
            orgId: auth.orgId,
            entityType: input.entityType,
            entityId: input.entityId,
            eventType: input.eventType,
            payload: input.payload ?? {},
            actorUserId: auth.userId,
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.TIMELINE_CREATED,
        entityType: input.entityType,
        entityId: input.entityId,
      });

      return reply
        .status(201)
        .send(createTimelineEventResponseSchema.parse({ event: toTimelineDto(event) }));
    },
  );

  app.get('/timeline', { onRequest: [requirePermission('timeline:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listTimelineQuerySchema.parse(request.query);
    const rows = await db
      .select()
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.orgId, auth.orgId),
          eq(timelineEvents.entityType, query.entityType),
          eq(timelineEvents.entityId, query.entityId),
        ),
      )
      .orderBy(desc(timelineEvents.occurredAt))
      .limit(query.limit);
    return listTimelineResponseSchema.parse({ events: rows.map((row) => toTimelineDto(row)) });
  });
  return Promise.resolve();
};
