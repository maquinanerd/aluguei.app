import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { leads, parties, properties, timelineEvents, visits } from '@aluguei/db';
import type { DbExecutor } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  isVisitStatus,
  transitionVisit,
  visitReschedulable,
} from '@aluguei/domain';
import type { VisitStatus } from '@aluguei/domain';
import {
  uuidSchema,
  createVisitRequestSchema,
  createVisitResponseSchema,
  getVisitResponseSchema,
  listVisitsQuerySchema,
  listVisitsResponseSchema,
  rescheduleVisitRequestSchema,
  rescheduleVisitResponseSchema,
  updateVisitStatusRequestSchema,
  updateVisitStatusResponseSchema,
  visitSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { assertOwnedByOrg, first } from './helpers.js';

type VisitRow = typeof visits.$inferSelect;

function toVisitDto(row: VisitRow): unknown {
  return visitSchema.parse({
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    partyId: row.partyId,
    propertyId: row.propertyId,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    note: row.note,
    cancelReason: row.cancelReason,
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/**
 * Visita da própria organização com trava de linha: duas mudanças de status simultâneas não
 * atropelam uma à outra (mesmo padrão de `lockLease` em leases.ts).
 */
async function lockVisit(tx: DbExecutor, orgId: string, visitId: string): Promise<VisitRow> {
  const [visit] = await tx
    .select()
    .from(visits)
    .where(and(eq(visits.id, visitId), eq(visits.orgId, orgId)))
    .for('update');
  if (!visit) {
    throw new DomainError('NOT_FOUND', 'Visita não encontrada');
  }
  return visit;
}

/** Status gravado fora do domínio conhecido não deveria existir (o CHECK do banco impede). */
function currentStatus(visit: VisitRow): VisitStatus {
  if (!isVisitStatus(visit.status)) {
    throw new Error(`status de visita inválido: ${visit.status}`);
  }
  return visit.status;
}

async function visitTimeline(
  tx: DbExecutor,
  visit: VisitRow,
  actorUserId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(timelineEvents).values({
    orgId: visit.orgId,
    entityType: 'VISIT',
    entityId: visit.id,
    eventType,
    payload,
    actorUserId,
  });
}

export const visitRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post('/visits', { onRequest: [requirePermission('visit:write')] }, async (request, reply) => {
    const auth = requireAuth(request);
    const input = createVisitRequestSchema.parse(request.body);

    // P0-05: lead/pessoa/imóvel precisam ser da própria organização.
    await assertOwnedByOrg(db, leads, input.leadId, auth.orgId, 'Lead não encontrado');
    await assertOwnedByOrg(db, parties, input.partyId, auth.orgId, 'Parte não encontrada');
    await assertOwnedByOrg(db, properties, input.propertyId, auth.orgId, 'Imóvel não encontrado');

    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new DomainError('INVALID_INPUT', 'Data e hora da visita inválidas');
    }
    // Uma visita nasce agendada ou já confirmada; os finais só chegam por transição (P2-02).
    if (input.status && input.status !== 'SCHEDULED' && input.status !== 'CONFIRMED') {
      throw new DomainError(
        'INVALID_INPUT',
        'A visita nasce agendada ou confirmada; o restante vem das transições',
      );
    }

    const visit = first(
      await db
        .insert(visits)
        .values({
          orgId: auth.orgId,
          leadId: input.leadId ?? null,
          partyId: input.partyId ?? null,
          propertyId: input.propertyId ?? null,
          scheduledAt,
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

  app.get('/visits/:id', { onRequest: [requirePermission('visit:read')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const [visit] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.id, id), eq(visits.orgId, auth.orgId)))
      .limit(1);
    if (!visit) {
      throw new DomainError('NOT_FOUND', 'Visita não encontrada');
    }
    return getVisitResponseSchema.parse({ visit: toVisitDto(visit) });
  });

  /**
   * Ciclo de vida da visita (auditoria 2026-09-10, P2-02): confirmar, realizar, cancelar (com
   * motivo) e não comparecimento. Transição inválida → 409 pelo domínio.
   */
  app.patch(
    '/visits/:id/status',
    { onRequest: [requirePermission('visit:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateVisitStatusRequestSchema.parse(request.body);

      const updated = await db.transaction(async (tx) => {
        const visit = await lockVisit(tx, auth.orgId, id);
        const from = currentStatus(visit);
        const next = transitionVisit(from, input.status, { reason: input.reason ?? null });
        if (next === from && input.reason === undefined) {
          return visit; // idempotente sem nada para mudar
        }
        const row = first(
          await tx
            .update(visits)
            .set({
              status: next,
              cancelReason: next === 'CANCELLED' ? (input.reason ?? null) : visit.cancelReason,
              statusChangedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(visits.id, visit.id), eq(visits.status, from)))
            .returning(),
        );
        await visitTimeline(tx, row, auth.userId, 'VISIT_STATUS_CHANGED', {
          from,
          to: next,
          reason: input.reason ?? null,
        });
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.VISIT_STATUS_CHANGED,
          entityType: 'VISIT',
          entityId: visit.id,
          payload: { changes: { status: { from, to: next } } },
        });
        return row;
      });

      return updateVisitStatusResponseSchema.parse({ visit: toVisitDto(updated) });
    },
  );

  /** Reagendar: nova data e hora; a visita volta para agendada (P2-02). */
  app.post(
    '/visits/:id/reschedule',
    { onRequest: [requirePermission('visit:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = rescheduleVisitRequestSchema.parse(request.body);
      const scheduledAt = new Date(input.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new DomainError('INVALID_INPUT', 'Data e hora da visita inválidas');
      }

      const updated = await db.transaction(async (tx) => {
        const visit = await lockVisit(tx, auth.orgId, id);
        const from = currentStatus(visit);
        if (!visitReschedulable(from)) {
          throw new DomainError(
            'INVALID_TRANSITION',
            `Visita: não é possível reagendar uma visita em ${from}`,
            { from },
          );
        }
        const next = transitionVisit(from, 'SCHEDULED');
        const row = first(
          await tx
            .update(visits)
            .set({
              status: next,
              scheduledAt,
              note: input.note ?? visit.note,
              statusChangedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(visits.id, visit.id), eq(visits.status, from)))
            .returning(),
        );
        await visitTimeline(tx, row, auth.userId, 'VISIT_RESCHEDULED', {
          from: visit.scheduledAt.toISOString(),
          to: scheduledAt.toISOString(),
        });
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.VISIT_RESCHEDULED,
          entityType: 'VISIT',
          entityId: visit.id,
          payload: {
            changes: {
              scheduledAt: {
                from: visit.scheduledAt.toISOString(),
                to: scheduledAt.toISOString(),
              },
              status: { from, to: next },
            },
          },
        });
        return row;
      });

      return rescheduleVisitResponseSchema.parse({ visit: toVisitDto(updated) });
    },
  );

  return Promise.resolve();
};
