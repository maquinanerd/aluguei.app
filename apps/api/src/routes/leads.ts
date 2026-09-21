import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { leads, leadPropertyInterests, parties, properties, timelineEvents } from '@aluguei/db';
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
  getLeadResponseSchema,
  leadSchema,
  listLeadsQuerySchema,
  listLeadsResponseSchema,
  updateLeadRequestSchema,
  updateLeadResponseSchema,
  updateLeadStatusRequestSchema,
  updateLeadStatusResponseSchema,
} from '@aluguei/contracts';
import type { AppDb } from '@aluguei/db';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { assertAllOwnedByOrg, assertOrgMember, assertOwnedByOrg, first } from './helpers.js';

/** Detalhe do lead com os imóveis de interesse (P2-03). Outra org → 404 uniforme (ADR-044). */
async function leadDetail(db: AppDb, orgId: string, leadId: string): Promise<unknown> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  if (!lead) {
    throw new DomainError('NOT_FOUND', 'Lead não encontrado');
  }
  const interests = await db
    .select({ propertyId: leadPropertyInterests.propertyId })
    .from(leadPropertyInterests)
    .where(eq(leadPropertyInterests.leadId, leadId));
  return getLeadResponseSchema.parse({
    lead: toLeadDto(lead),
    interestedPropertyIds: interests
      .map((row) => row.propertyId)
      .filter((value): value is string => value !== null),
  });
}

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

    // P0-05: referências do corpo são validadas na org antes de qualquer escrita.
    await assertOwnedByOrg(db, parties, input.partyId, auth.orgId, 'Parte não encontrada');
    await assertAllOwnedByOrg(
      db,
      properties,
      input.interestedPropertyIds,
      auth.orgId,
      'Imóvel não encontrado',
    );

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

  /** Detalhe do lead (auditoria 2026-09-10, P2-03: só existia a lista). */
  app.get('/leads/:id', { onRequest: [requirePermission('lead:read')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    return await leadDetail(db, auth.orgId, id);
  });

  /**
   * Edição do lead (P2-03): dados e responsável. O status continua em `/leads/:id/status`, que
   * passa pelo funil do domínio. O responsável precisa ser membro da própria organização.
   */
  app.patch('/leads/:id', { onRequest: [requirePermission('lead:write')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const input = updateLeadRequestSchema.parse(request.body);

    if (input.ownerUserId !== undefined && input.ownerUserId !== null) {
      await assertOrgMember(db, auth.orgId, input.ownerUserId, 'Responsável não encontrado');
    }
    await assertOwnedByOrg(db, parties, input.partyId, auth.orgId, 'Parte não encontrada');
    await assertAllOwnedByOrg(
      db,
      properties,
      input.interestedPropertyIds,
      auth.orgId,
      'Imóvel não encontrado',
    );
    if (
      input.budgetMinCents !== undefined &&
      input.budgetMinCents !== null &&
      input.budgetMaxCents !== undefined &&
      input.budgetMaxCents !== null &&
      input.budgetMinCents > input.budgetMaxCents
    ) {
      throw new DomainError('INVALID_INPUT', 'O orçamento mínimo não pode passar do máximo');
    }

    await db.transaction(async (tx) => {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.orgId, auth.orgId)))
        .for('update');
      if (!lead) {
        throw new DomainError('NOT_FOUND', 'Lead não encontrado');
      }
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const next: Partial<typeof leads.$inferInsert> = {};
      for (const field of [
        'source',
        'channel',
        'ownerUserId',
        'budgetMinCents',
        'budgetMaxCents',
        'notes',
        'partyId',
      ] as const) {
        const value = input[field];
        if (value !== undefined && value !== lead[field]) {
          // `notes` é texto livre do corretor: o diff guarda só o tamanho, não o conteúdo.
          changes[field] =
            field === 'notes'
              ? { from: (lead.notes ?? '').length, to: String(value ?? '').length }
              : { from: lead[field], to: value };
          Object.assign(next, { [field]: value });
        }
      }
      // Orçamento final (o já gravado conta quando só um dos limites vem no corpo).
      // `null` no corpo limpa o limite: não cai no valor antigo.
      const finalMin =
        next.budgetMinCents === undefined ? lead.budgetMinCents : next.budgetMinCents;
      const finalMax =
        next.budgetMaxCents === undefined ? lead.budgetMaxCents : next.budgetMaxCents;
      if (finalMin !== null && finalMax !== null && finalMin > finalMax) {
        throw new DomainError('INVALID_INPUT', 'O orçamento mínimo não pode passar do máximo');
      }

      if (input.interestedPropertyIds) {
        const current = await tx
          .select({ propertyId: leadPropertyInterests.propertyId })
          .from(leadPropertyInterests)
          .where(eq(leadPropertyInterests.leadId, lead.id));
        const before = current
          .map((row) => row.propertyId)
          .filter((value): value is string => value !== null)
          .sort();
        const after = [...new Set(input.interestedPropertyIds)].sort();
        if (before.join('|') !== after.join('|')) {
          changes['interestedPropertyIds'] = { from: before.length, to: after.length };
          await tx.delete(leadPropertyInterests).where(eq(leadPropertyInterests.leadId, lead.id));
          if (after.length > 0) {
            await tx.insert(leadPropertyInterests).values(
              after.map((propertyId) => ({
                orgId: auth.orgId,
                leadId: lead.id,
                propertyId,
              })),
            );
          }
        }
      }

      if (Object.keys(changes).length === 0) {
        return;
      }
      await tx
        .update(leads)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
      await tx.insert(timelineEvents).values({
        orgId: auth.orgId,
        entityType: 'LEAD',
        entityId: lead.id,
        eventType: 'LEAD_UPDATED',
        payload: { fields: Object.keys(changes) },
        actorUserId: auth.userId,
      });
      await writeAudit(tx, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.LEAD_UPDATED,
        entityType: 'LEAD',
        entityId: lead.id,
        payload: { changes },
      });
    });

    return updateLeadResponseSchema.parse(await leadDetail(db, auth.orgId, id));
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
