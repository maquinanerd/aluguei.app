import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { leads, leadPropertyInterests, timelineEvents } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  isFunnelStatus,
  transitionLead,
  type FunnelStatus,
} from '@aluguei/domain';
import {
  uuidSchema,
  createLeadRequestSchema,
  createLeadResponseSchema,
  leadSchema,
  listLeadsQuerySchema,
  listLeadsResponseSchema,
  updateLeadStatusRequestSchema,
  updateLeadStatusResponseSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

function toLeadDto(row: typeof leads.$inferSelect): unknown {
  return leadSchema.parse({
    id: row.id,
    orgId: row.orgId,
    status: row.status,
    source: row.source,
    channel: row.channel,
    partyId: row.partyId,
    ownerUserId: row.ownerUserId,
    budgetMinCents: row.budgetMinCents,
    budgetMaxCents: row.budgetMaxCents,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export const leadRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post('/leads', { onRequest: [requirePermission('lead:write')] }, async (request, reply) => {
    const auth = requireAuth(request);
    const input = createLeadRequestSchema.parse(request.body);

    const lead = first(
      await db
        .insert(leads)
        .values({
          orgId: auth.orgId,
          partyId: input.partyId ?? null,
          source: input.source ?? null,
          channel: input.channel ?? null,
          ownerUserId: auth.userId,
          budgetMinCents: input.budgetMinCents ?? null,
          budgetMaxCents: input.budgetMaxCents ?? null,
          notes: input.notes ?? null,
        })
        .returning(),
    );

    if (input.interestedPropertyIds && input.interestedPropertyIds.length > 0) {
      await db.insert(leadPropertyInterests).values(
        input.interestedPropertyIds.map((propertyId) => ({
          orgId: auth.orgId,
          leadId: lead.id,
          propertyId,
        })),
      );
    }

    const timeline = first(
      await db
        .insert(timelineEvents)
        .values({
          orgId: auth.orgId,
          entityType: 'LEAD',
          entityId: lead.id,
          eventType: 'LEAD_CREATED',
          payload: { status: 'NEW' },
          actorUserId: auth.userId,
        })
        .returning(),
    );

    await writeAudit(db, {
      orgId: auth.orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.LEAD_CREATED,
      entityType: 'LEAD',
      entityId: lead.id,
    });

    return reply.status(201).send(
      createLeadResponseSchema.parse({
        lead: toLeadDto(lead),
        timelineEventId: timeline.id,
      }),
    );
  });

  app.get('/leads', { onRequest: [requirePermission('lead:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listLeadsQuerySchema.parse(request.query);

    const where = and(
      eq(leads.orgId, auth.orgId),
      query.status ? eq(leads.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    const totalRows = await db.select({ count: leads.id }).from(leads).where(where);

    return listLeadsResponseSchema.parse({
      leads: rows.map((row) => toLeadDto(row)),
      total: totalRows.length,
    });
  });

  app.patch(
    '/leads/:id/status',
    { onRequest: [requirePermission('lead:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateLeadStatusRequestSchema.parse(request.body);

      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.orgId, auth.orgId)))
        .limit(1);
      if (!lead) {
        throw new DomainError('NOT_FOUND', 'Lead não encontrado');
      }
      if (!isFunnelStatus(lead.status)) {
        throw new Error(`lead status inválido: ${lead.status}`);
      }
      const transitionContext = input.reason === undefined ? {} : { reason: input.reason };
      const nextStatus = transitionLead(
        lead.status as FunnelStatus,
        input.status,
        transitionContext,
      );

      const updated = first(
        await db
          .update(leads)
          .set({
            status: nextStatus,
            notes: input.notes ?? lead.notes,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, lead.id))
          .returning(),
      );

      await db.insert(timelineEvents).values({
        orgId: auth.orgId,
        entityType: 'LEAD',
        entityId: lead.id,
        eventType: 'LEAD_STATUS_CHANGED',
        payload: { from: lead.status, to: nextStatus, reason: input.reason ?? null },
        actorUserId: auth.userId,
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.LEAD_STATUS_CHANGED,
        entityType: 'LEAD',
        entityId: lead.id,
        payload: { from: lead.status, to: nextStatus },
      });

      return updateLeadStatusResponseSchema.parse({ lead: toLeadDto(updated) });
    },
  );
  return Promise.resolve();
};
