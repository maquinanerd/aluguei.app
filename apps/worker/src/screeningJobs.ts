import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  leads,
  partyIdentities,
  rentalApplications,
  screeningRequests,
  screeningResults,
  timelineEvents,
} from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  decideApplication,
  describeScreeningDecision,
  normalizeDocument,
  transitionLead,
  transitionRentalApplication,
} from '@aluguei/domain';
import type { RentalApplicationStatus } from '@aluguei/domain';
import type { IScreeningProvider } from '@aluguei/integrations';
import { writeAudit } from '@aluguei/api/audit';

export interface ScreeningJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

/**
 * Processa um job de screening: valida consentimento, executa o provider,
 * aplica regras determinísticas (explicáveis) e decide a candidatura.
 *
 * Decisão automática auditável (auditoria 2026-09-10, P1-06): a candidatura só
 * sai de SCREENING com o resultado gravado; APPROVED/REJECTED registram origem
 * AUTOMATIC, motivo com a regra que decidiu e data — `decided_by` fica nulo
 * porque não há pessoa. Resultado, decisão, timeline e auditoria vão numa única
 * transação; a chamada ao provider fica fora dela.
 */
export async function processScreeningJob(
  db: AppDb,
  job: ScreeningJob,
  provider: IScreeningProvider,
  approveScoreMin?: number,
): Promise<void> {
  const rawRequestId = job.payload['screeningRequestId'];
  const screeningRequestId = typeof rawRequestId === 'string' ? rawRequestId : '';
  if (!screeningRequestId) {
    throw new Error('job sem screeningRequestId');
  }
  const [request] = await db
    .select()
    .from(screeningRequests)
    .where(
      and(eq(screeningRequests.id, screeningRequestId), eq(screeningRequests.orgId, job.orgId)),
    )
    .limit(1);
  if (!request || request.status !== 'PENDING') {
    return; // já processado (idempotente)
  }
  const [application] = await db
    .select()
    .from(rentalApplications)
    .where(
      and(
        eq(rentalApplications.id, request.applicationId),
        eq(rentalApplications.orgId, job.orgId),
      ),
    )
    .limit(1);
  if (!application || application.status !== 'SCREENING') {
    return; // skip se não está em SCREENING (idempotência)
  }

  // CPF do candidato (identidade normalizada)
  const [identity] = await db
    .select({ value: partyIdentities.value })
    .from(partyIdentities)
    .where(
      and(
        eq(partyIdentities.orgId, job.orgId),
        eq(partyIdentities.partyId, application.partyId),
        eq(partyIdentities.kind, 'CPF'),
      ),
    )
    .limit(1);
  const cpf = identity?.value ?? normalizeDocument(application.partyId);

  const result = await provider.requestCreditScreening({ cpf, purpose: request.purpose });

  const decisionInput: Parameters<typeof decideApplication>[0] = {
    score: result.score,
    redFlags: result.redFlags,
  };
  if (approveScoreMin !== undefined) {
    decisionInput.approveScoreMin = approveScoreMin;
  }
  const decision = decideApplication(decisionInput);
  const nextStatus: RentalApplicationStatus =
    decision.decision === 'APPROVE'
      ? 'APPROVED'
      : decision.decision === 'REJECT'
        ? 'REJECTED'
        : 'MANUAL_REVIEW';
  // Revisão manual ainda não é decisão: o motivo é registrado por quem decidir.
  const decisionReason =
    nextStatus === 'MANUAL_REVIEW' ? null : describeScreeningDecision(request.provider, decision);
  transitionRentalApplication('SCREENING', nextStatus, {
    source: 'SCREENING_RESULT',
    hasConsent: true,
    hasRequiredData: true,
    hasDecisionReason: decisionReason !== null,
    hasDecidedBy: false,
    hasScreeningResult: true,
    hasContract: false,
  });

  await db.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(screeningRequests)
      .set({
        status: 'COMPLETED',
        completedAt: now,
        rawPayload: { score: result.score, redFlags: result.redFlags } as unknown as Record<
          string,
          unknown
        >,
      })
      .where(and(eq(screeningRequests.id, request.id), eq(screeningRequests.status, 'PENDING')))
      .returning({ id: screeningRequests.id });
    if (!claimed) {
      return; // outra execução já registrou este pedido (idempotente)
    }
    const [stored] = await tx
      .insert(screeningResults)
      .values({
        orgId: job.orgId,
        applicationId: application.id,
        requestId: request.id,
        provider: request.provider,
        score: result.score,
        summary: result.summary,
        redFlags: result.redFlags as unknown as Record<string, unknown>,
        decision: decision.decision,
        decisionRules: decision.rules as unknown as Record<string, unknown>,
      })
      .returning({ id: screeningResults.id });
    if (!stored) {
      throw new Error('screening result insert failed');
    }

    const patch: Partial<typeof rentalApplications.$inferInsert> = {
      status: nextStatus,
      updatedAt: now,
    };
    if (decisionReason !== null) {
      patch.decisionReason = decisionReason;
      patch.decisionSource = 'AUTOMATIC';
      patch.decidedBy = null;
      patch.decidedAt = now;
    }
    const [moved] = await tx
      .update(rentalApplications)
      .set(patch)
      .where(
        and(
          eq(rentalApplications.id, application.id),
          eq(rentalApplications.orgId, job.orgId),
          eq(rentalApplications.status, 'SCREENING'),
        ),
      )
      .returning({ id: rentalApplications.id });
    if (!moved) {
      // Desfaz resultado e conclusão do pedido: a próxima tentativa reavalia.
      throw new Error(`candidatura ${application.id} saiu de SCREENING durante a análise`);
    }

    if (nextStatus === 'REJECTED' && application.leadId) {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.id, application.leadId), eq(leads.orgId, job.orgId)))
        .limit(1);
      if (lead) {
        try {
          const next = transitionLead(lead.status as never, 'LOST');
          await tx
            .update(leads)
            .set({ status: next, updatedAt: new Date() })
            .where(eq(leads.id, lead.id));
        } catch {
          // transição inválida do funil — ignora
        }
      }
    }
    await tx.insert(timelineEvents).values({
      orgId: job.orgId,
      entityType: 'RENTAL_APPLICATION',
      entityId: application.id,
      eventType: 'SCREENING_DECIDED',
      payload: { decision: decision.decision, rules: decision.rules, source: 'AUTOMATIC' },
    });
    await writeAudit(tx, {
      orgId: job.orgId,
      action: AUDIT_ACTIONS.SCREENING_COMPLETED,
      entityType: 'RENTAL_APPLICATION',
      entityId: application.id,
      payload: { decision: decision.decision, screeningResultId: stored.id },
    });
    await writeAudit(tx, {
      orgId: job.orgId,
      action: AUDIT_ACTIONS.RENTAL_APPLICATION_DECIDED,
      entityType: 'RENTAL_APPLICATION',
      entityId: application.id,
      payload: {
        from: 'SCREENING',
        to: nextStatus,
        source: 'AUTOMATIC',
        decision: decision.decision,
        screeningResultId: stored.id,
      },
    });
  });
}
