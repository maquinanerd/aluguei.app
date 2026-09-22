import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { leads, parties, properties, proposals, timelineEvents } from '@aluguei/db';
import type { DbExecutor } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  isProposalStatus,
  proposalEditable,
  saoPauloDate,
  transitionProposal,
} from '@aluguei/domain';
import type { ProposalStatus } from '@aluguei/domain';
import {
  uuidSchema,
  createProposalRequestSchema,
  createProposalResponseSchema,
  getProposalResponseSchema,
  listProposalsQuerySchema,
  listProposalsResponseSchema,
  proposalSchema,
  updateProposalRequestSchema,
  updateProposalResponseSchema,
  updateProposalStatusRequestSchema,
  updateProposalStatusResponseSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { assertOwnedByOrg, first } from './helpers.js';

type ProposalRow = typeof proposals.$inferSelect;

function toProposalDto(row: ProposalRow): unknown {
  return proposalSchema.parse({
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    partyId: row.partyId,
    propertyId: row.propertyId,
    status: row.status,
    monthlyRentCents: row.monthlyRentCents,
    terms: row.terms,
    validUntil: row.validUntil,
    sentAt: row.sentAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Proposta da própria organização com trava de linha (mesmo padrão de `lockLease`). */
async function lockProposal(
  tx: DbExecutor,
  orgId: string,
  proposalId: string,
): Promise<ProposalRow> {
  const [proposal] = await tx
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.orgId, orgId)))
    .for('update');
  if (!proposal) {
    throw new DomainError('NOT_FOUND', 'Proposta não encontrada');
  }
  return proposal;
}

function currentStatus(proposal: ProposalRow): ProposalStatus {
  if (!isProposalStatus(proposal.status)) {
    throw new Error(`status de proposta inválido: ${proposal.status}`);
  }
  return proposal.status;
}

async function proposalTimeline(
  tx: DbExecutor,
  proposal: ProposalRow,
  actorUserId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(timelineEvents).values({
    orgId: proposal.orgId,
    entityType: 'PROPOSAL',
    entityId: proposal.id,
    eventType,
    payload,
    actorUserId,
  });
}

export const proposalRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/proposals',
    { onRequest: [requirePermission('proposal:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createProposalRequestSchema.parse(request.body);

      // P0-05: lead/pessoa/imóvel precisam ser da própria organização.
      await assertOwnedByOrg(db, leads, input.leadId, auth.orgId, 'Lead não encontrado');
      await assertOwnedByOrg(db, parties, input.partyId, auth.orgId, 'Parte não encontrada');
      await assertOwnedByOrg(db, properties, input.propertyId, auth.orgId, 'Imóvel não encontrado');

      const proposal = first(
        await db
          .insert(proposals)
          .values({
            orgId: auth.orgId,
            leadId: input.leadId ?? null,
            partyId: input.partyId ?? null,
            propertyId: input.propertyId ?? null,
            monthlyRentCents: input.monthlyRentCents,
            terms: input.terms ?? null,
            validUntil: input.validUntil ?? null,
            createdBy: auth.userId,
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPOSAL_CREATED,
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        payload: { monthlyRentCents: input.monthlyRentCents },
      });

      return reply
        .status(201)
        .send(createProposalResponseSchema.parse({ proposal: toProposalDto(proposal) }));
    },
  );

  app.get('/proposals', { onRequest: [requirePermission('proposal:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listProposalsQuerySchema.parse(request.query);
    const where = and(
      eq(proposals.orgId, auth.orgId),
      query.status ? eq(proposals.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(proposals)
      .where(where)
      .orderBy(desc(proposals.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return listProposalsResponseSchema.parse({
      proposals: rows.map((row) => toProposalDto(row)),
      total: rows.length,
    });
  });

  app.get(
    '/proposals/:id',
    { onRequest: [requirePermission('proposal:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [proposal] = await db
        .select()
        .from(proposals)
        .where(and(eq(proposals.id, id), eq(proposals.orgId, auth.orgId)))
        .limit(1);
      if (!proposal) {
        throw new DomainError('NOT_FOUND', 'Proposta não encontrada');
      }
      return getProposalResponseSchema.parse({ proposal: toProposalDto(proposal) });
    },
  );

  /** Edição só no rascunho (auditoria 2026-09-10, P2-02): proposta enviada não muda de valor. */
  app.patch(
    '/proposals/:id',
    { onRequest: [requirePermission('proposal:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateProposalRequestSchema.parse(request.body);

      const updated = await db.transaction(async (tx) => {
        const proposal = await lockProposal(tx, auth.orgId, id);
        const from = currentStatus(proposal);
        if (!proposalEditable(from)) {
          throw new DomainError(
            'CONFLICT',
            `Proposta em ${from} não pode ser editada; só o rascunho aceita mudança`,
            { status: from },
          );
        }
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const next: Partial<typeof proposals.$inferInsert> = {};
        for (const field of ['monthlyRentCents', 'terms', 'validUntil'] as const) {
          const value = input[field];
          if (value !== undefined && value !== proposal[field]) {
            changes[field] = { from: proposal[field], to: value };
            Object.assign(next, { [field]: value });
          }
        }
        if (Object.keys(changes).length === 0) {
          return proposal;
        }
        const row = first(
          await tx
            .update(proposals)
            .set({ ...next, updatedAt: new Date() })
            .where(and(eq(proposals.id, proposal.id), eq(proposals.status, from)))
            .returning(),
        );
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PROPOSAL_UPDATED,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          payload: { changes },
        });
        return row;
      });

      return updateProposalResponseSchema.parse({ proposal: toProposalDto(updated) });
    },
  );

  /**
   * Ciclo de vida da proposta (P2-02): enviar (exige validade), aceitar, recusar (exige motivo) e
   * expirar. Transição inválida → 409 pelo domínio. A expiração automática é do worker.
   */
  app.patch(
    '/proposals/:id/status',
    { onRequest: [requirePermission('proposal:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateProposalStatusRequestSchema.parse(request.body);

      const updated = await db.transaction(async (tx) => {
        const proposal = await lockProposal(tx, auth.orgId, id);
        const from = currentStatus(proposal);
        const validUntil = input.validUntil ?? proposal.validUntil;
        const next = transitionProposal(from, input.status, {
          reason: input.reason ?? null,
          validUntil,
        });
        if (next === from) {
          return proposal; // idempotente
        }
        // Validade no passado não faz sentido para enviar: a proposta já nasceria expirada.
        if (next === 'SENT' && validUntil !== null && validUntil < saoPauloDate(new Date())) {
          throw new DomainError(
            'INVALID_INPUT',
            'A validade da proposta precisa ser hoje ou uma data futura',
          );
        }
        const now = new Date();
        const row = first(
          await tx
            .update(proposals)
            .set({
              status: next,
              validUntil,
              sentAt: next === 'SENT' ? now : proposal.sentAt,
              decidedAt:
                next === 'ACCEPTED' || next === 'REJECTED' || next === 'EXPIRED'
                  ? now
                  : proposal.decidedAt,
              decisionReason: input.reason ?? proposal.decisionReason,
              updatedAt: now,
            })
            .where(and(eq(proposals.id, proposal.id), eq(proposals.status, from)))
            .returning(),
        );
        await proposalTimeline(tx, row, auth.userId, 'PROPOSAL_STATUS_CHANGED', {
          from,
          to: next,
          reason: input.reason ?? null,
        });
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PROPOSAL_STATUS_CHANGED,
          entityType: 'PROPOSAL',
          entityId: proposal.id,
          payload: { changes: { status: { from, to: next } } },
        });
        return row;
      });

      return updateProposalStatusResponseSchema.parse({ proposal: toProposalDto(updated) });
    },
  );

  return Promise.resolve();
};
