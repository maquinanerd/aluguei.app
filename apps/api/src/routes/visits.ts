import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { visits } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import {
  createVisitRequestSchema,
  createVisitResponseSchema,
  listVisitsQuerySchema,
  listVisitsResponseSchema,
  visitSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

function toVisitDto(row: typeof visits.$inferSelect): unknown {
  return visitSchema.parse({
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    partyId: row.partyId,
    propertyId: row.propertyId,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export const visitRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post('/visits', { onRequest: [requirePermission('visit:write')] }, async (request, reply) => {
    const auth = requireAuth(request);
    const input = createVisitRequestSchema.parse(request.body);

    const visit = first(
      await db
        .insert(visits)
        .values({
          orgId: auth.orgId,
          leadId: input.leadId ?? null,
          partyId: input.partyId ?? null,
          propertyId: input.propertyId ?? null,
          scheduledAt: new Date(input.scheduledAt),
          status: input.status ?? 'SCHEDULED',
          note: input.note ?? null,
        })
        .returning(),
    );

    await writeAudit(db, {
      orgId: auth.orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.VISIT_CREATED,
      entityType: 'VISIT',
      entityId: visit.id,
    });

    return reply.status(201).send(createVisitResponseSchema.parse({ visit: toVisitDto(visit) }));
  });

  app.get('/visits', { onRequest: [requirePermission('visit:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listVisitsQuerySchema.parse(request.query);
    const where = and(
      eq(visits.orgId, auth.orgId),
      query.status ? eq(visits.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(visits)
      .where(where)
      .orderBy(desc(visits.scheduledAt))
      .limit(query.limit)
      .offset(query.offset);
    return listVisitsResponseSchema.parse({
      visits: rows.map((row) => toVisitDto(row)),
      total: rows.length,
    });
  });
  return Promise.resolve();
};
