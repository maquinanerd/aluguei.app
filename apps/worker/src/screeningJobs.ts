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
  await db
    .update(screeningRequests)
    .set({
      status: 'COMPLETED',
      completedAt: new Date(),
      rawPayload: { score: result.score, redFlags: result.redFlags } as unknown as Record<
        string,
        unknown
      >,
    })
    .where(eq(screeningRequests.id, request.id));

  const decisionInput: Parameters<typeof decideApplication>[0] = {
    score: result.score,
    redFlags: result.redFlags,
  };
  if (approveScoreMin !== undefined) {
    decisionInput.approveScoreMin = approveScoreMin;
  }
  const decision = decideApplication(decisionInput);
  await db.insert(screeningResults).values({
    orgId: job.orgId,
    applicationId: application.id,
    requestId: request.id,
    provider: request.provider,
    score: result.score,
    summary: result.summary,
    redFlags: result.redFlags as unknown as Record<string, unknown>,
    decision: decision.decision,
    decisionRules: decision.rules as unknown as Record<string, unknown>,
  });

  const nextStatus: RentalApplicationStatus =
    decision.decision === 'APPROVE'
      ? 'APPROVED'
      : decision.decision === 'REJECT'
        ? 'REJECTED'
        : 'MANUAL_REVIEW';
  transitionRentalApplication('SCREENING', nextStatus, {
    hasConsent: true,
    hasRequiredData: true,
    hasDecisionReason: true,
    hasContract: false,
  });
  const patch: Record<string, unknown> = { status: nextStatus, updatedAt: new Date() };
  if (nextStatus === 'APPROVED' || nextStatus === 'REJECTED') {
    patch.decidedAt = new Date();
    patch.decisionReason = `auto:${decision.decision.toLowerCase()}`;
  }
  await db
    .update(rentalApplications)
    .set(patch as never)
    .where(eq(rentalApplications.id, application.id));

  if (nextStatus === 'REJECTED' && application.leadId) {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, application.leadId), eq(leads.orgId, job.orgId)))
      .limit(1);
    if (lead) {
      try {
        const next = transitionLead(lead.status as never, 'LOST');
        await db
          .update(leads)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(leads.id, lead.id));
      } catch {
        // transição inválida do funil — ignora
      }
    }
  }
  await db.insert(timelineEvents).values({
    orgId: job.orgId,
    entityType: 'RENTAL_APPLICATION',
    entityId: application.id,
    eventType: 'SCREENING_DECIDED',
    payload: { decision: decision.decision, rules: decision.rules },
  });
  await writeAudit(db, {
    orgId: job.orgId,
    action: AUDIT_ACTIONS.SCREENING_COMPLETED,
    entityType: 'RENTAL_APPLICATION',
    entityId: application.id,
    payload: { decision: decision.decision },
  });
}
