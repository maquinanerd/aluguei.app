import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { proposals, timelineEvents } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  isProposalExpired,
  saoPauloDate,
  transitionProposal,
} from '@aluguei/domain';
import { writeAudit } from '@aluguei/api/audit';

export interface CrmJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

/**
 * Expiração da proposta (auditoria 2026-09-10, P2-02: `validUntil` não tinha efeito nenhum).
 * Varredura diária: proposta enviada com a validade já passada vira EXPIRED, com auditoria e
 * evento na timeline. "Hoje" é a data civil de São Paulo — entre 21h e meia-noite a data UTC já é
 * o dia seguinte e a proposta expiraria um dia antes (mesma armadilha do P1-07).
 */
export async function processProposalExpiryJob(db: AppDb, job: CrmJob): Promise<number> {
  const today =
    typeof job.payload['today'] === 'string' ? job.payload['today'] : saoPauloDate(new Date());
  const candidates = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.orgId, job.orgId),
        eq(proposals.status, 'SENT'),
        isNotNull(proposals.validUntil),
        lt(proposals.validUntil, today),
      ),
    );

  let expired = 0;
  for (const proposal of candidates) {
    // Releitura da regra no domínio: a validade é o último dia em que a proposta vale.
    if (!isProposalExpired(proposal.validUntil, today)) {
      continue;
    }
    const next = transitionProposal('SENT', 'EXPIRED');
    const now = new Date();
    await db.transaction(async (tx) => {
      // Compare-and-set: uma aceitação no mesmo instante não é sobrescrita pela varredura.
      const [row] = await tx
        .update(proposals)
        .set({ status: next, decidedAt: now, updatedAt: now })
        .where(and(eq(proposals.id, proposal.id), eq(proposals.status, 'SENT')))
        .returning({ id: proposals.id });
      if (!row) {
        return;
      }
      await tx.insert(timelineEvents).values({
        orgId: job.orgId,
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        eventType: 'PROPOSAL_STATUS_CHANGED',
        payload: { from: 'SENT', to: next, reason: 'validade vencida', source: 'scheduler' },
      });
      await writeAudit(tx, {
        orgId: job.orgId,
        action: AUDIT_ACTIONS.PROPOSAL_EXPIRED,
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        payload: {
          changes: { status: { from: 'SENT', to: next } },
          validUntil: proposal.validUntil,
          source: 'scheduler',
        },
      });
      expired += 1;
    });
  }
  return expired;
}
