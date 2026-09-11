import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { charges, leases, payments, reconciliations } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, isLeaseStatus } from '@aluguei/domain';
import type { IPaymentProvider } from '@aluguei/integrations';
import { writeAudit } from '@aluguei/api/audit';
import {
  applyProviderConfirmation,
  applyProviderFailure,
  applyProviderRefund,
  findPaymentByProviderId,
  markChargeOverdue,
} from '@aluguei/api/finance';

export interface PaymentJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

const EVENT_TYPES = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_REFUNDED',
  'PAYMENT_FAILED',
  'PAYMENT_OVERDUE',
] as const;

type PaymentEventType = (typeof EVENT_TYPES)[number];

interface PaymentEvent {
  eventType: PaymentEventType;
  provider: string;
  providerChargeId: string;
  paidAt: Date;
}

function parsePaymentEvent(payload: Record<string, unknown>): PaymentEvent | null {
  const eventType = typeof payload['eventType'] === 'string' ? payload['eventType'] : '';
  const providerChargeId =
    typeof payload['providerChargeId'] === 'string' ? payload['providerChargeId'] : '';
  if (!providerChargeId || !(EVENT_TYPES as readonly string[]).includes(eventType)) {
    return null;
  }
  const paidAt = typeof payload['paidAt'] === 'string' ? new Date(payload['paidAt']) : new Date();
  return {
    eventType: eventType as PaymentEventType,
    provider: typeof payload['provider'] === 'string' ? payload['provider'] : '',
    providerChargeId,
    paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
  };
}

/**
 * Processa um evento de pagamento. O evento é apenas uma NOTIFICAÇÃO: o estado
 * real é sempre relido no provider antes de qualquer efeito (auditoria
 * 2026-09-10, P0-02 — webhook forjado não credita nem estorna). Os efeitos
 * monetários ficam em @aluguei/api/finance, numa transação com trava na
 * cobrança e compare-and-set de status (P0-01), e dinheiro recebido para uma
 * cobrança que não aceita mais liquidação vira recebimento não aplicado (P0-03).
 */
export async function processPaymentJob(
  db: AppDb,
  job: PaymentJob,
  provider: IPaymentProvider,
): Promise<void> {
  const event = parsePaymentEvent(job.payload);
  if (!event) {
    return; // payload desconhecido — ignora
  }
  if (event.provider && event.provider !== provider.name) {
    throw new DomainError(
      'PROVIDER_ERROR',
      `Evento do provider ${event.provider} com ${provider.name} configurado`,
    );
  }
  const payment = await findPaymentByProviderId(
    db,
    provider.name,
    event.providerChargeId,
    job.orgId,
  );
  if (!payment) {
    return; // pagamento desconhecido — ignora
  }
  const status = await provider.getChargeStatus(event.providerChargeId);

  if (event.eventType === 'PAYMENT_CONFIRMED') {
    if (status !== 'CONFIRMED' && status !== 'REFUNDED') {
      throw new DomainError(
        'PROVIDER_ERROR',
        `Pagamento não confirmado no provider (status ${status})`,
      );
    }
    await applyProviderConfirmation(db, job.orgId, payment.id, event.paidAt);
    return;
  }
  if (event.eventType === 'PAYMENT_REFUNDED') {
    if (status !== 'REFUNDED') {
      throw new DomainError(
        'PROVIDER_ERROR',
        `Estorno não confirmado no provider (status ${status})`,
      );
    }
    await applyProviderRefund(db, job.orgId, payment.id);
    return;
  }
  if (event.eventType === 'PAYMENT_FAILED') {
    if (status !== 'FAILED') {
      return; // evento sem respaldo no provider
    }
    await applyProviderFailure(db, job.orgId, payment.id);
    return;
  }
  await markChargeOverdue(db, job.orgId, payment.chargeId);
}

/** Gera charges do mês corrente para leases ACTIVE/DELINQUENT (idempotente por UNIQUE lease+period). */
export async function processPaymentSchedulerJob(db: AppDb, job: PaymentJob): Promise<void> {
  const periodStart =
    typeof job.payload['periodStart'] === 'string'
      ? job.payload['periodStart']
      : `${new Date().toISOString().slice(0, 8)}01`;
  const activeLeases = await db
    .select()
    .from(leases)
    .where(and(eq(leases.orgId, job.orgId), lt(leases.status, 'TERMINATING')));
  for (const lease of activeLeases) {
    if (!isLeaseStatus(lease.status)) {
      continue;
    }
    const dueDate = new Date(new Date(`${periodStart}T00:00:00.000Z`).getTime() + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await db
      .insert(charges)
      .values({
        orgId: job.orgId,
        leaseId: lease.id,
        periodStart,
        dueDate,
        status: 'SCHEDULED',
        amountCents: lease.monthlyRentCents + (lease.condoFeeCents ?? 0),
        rentCents: lease.monthlyRentCents,
        condoFeeCents: lease.condoFeeCents ?? 0,
      })
      .onConflictDoNothing();
  }
  const today = new Date().toISOString().slice(0, 10);
  await db
    .update(charges)
    .set({ status: 'OPEN', updatedAt: new Date() })
    .where(
      and(
        eq(charges.orgId, job.orgId),
        eq(charges.status, 'SCHEDULED'),
        lt(charges.dueDate, today),
      ),
    );
}

/**
 * Conciliação. Além do total, faz a varredura de segurança: pagamento pendente
 * que o provider já confirmou é liquidado aqui — um webhook perdido não pode
 * significar dinheiro recebido sem registro (auditoria 2026-09-10, P0-03).
 */
export async function processReconcileJob(
  db: AppDb,
  job: PaymentJob,
  provider: IPaymentProvider | null,
): Promise<void> {
  const periodStart =
    typeof job.payload['periodStart'] === 'string' ? job.payload['periodStart'] : '';
  let recovered = 0;
  if (provider) {
    const pendingPayments = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orgId, job.orgId),
          eq(payments.status, 'PENDING'),
          isNotNull(payments.providerPaymentId),
        ),
      )
      .limit(200);
    for (const payment of pendingPayments) {
      const status = await provider.getChargeStatus(payment.providerPaymentId ?? '');
      if (status === 'CONFIRMED') {
        await applyProviderConfirmation(db, job.orgId, payment.id, new Date());
        recovered += 1;
      }
    }
  }

  const providerCharges = provider?.getProviderCharges ? await provider.getProviderCharges() : [];
  const providerTotal = providerCharges.reduce((sum, item) => sum + item.amountCents, 0);
  const localCharges = await db
    .select()
    .from(charges)
    .where(and(eq(charges.orgId, job.orgId), eq(charges.status, 'PAID')));
  const localTotal = localCharges.reduce((sum, charge) => sum + charge.amountCents, 0);
  const matched = providerTotal === localTotal;
  await db.insert(reconciliations).values({
    orgId: job.orgId,
    provider: provider?.name ?? 'NONE',
    periodStart,
    periodEnd: periodStart,
    status: matched ? 'MATCHED' : 'DISCREPANCY',
    providerTotalCents: providerTotal,
    localTotalCents: localTotal,
    differences: matched ? [] : [{ providerTotal, localTotal }],
  });
  await writeAudit(db, {
    orgId: job.orgId,
    action: AUDIT_ACTIONS.RECONCILIATION_COMPLETED,
    entityType: 'RECONCILIATION',
    entityId: periodStart,
    payload: { matched, providerTotal, localTotal, recovered },
  });
}
