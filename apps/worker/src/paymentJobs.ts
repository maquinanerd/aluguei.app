import { and, asc, eq, inArray, isNotNull, lt, lte } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { charges, leaseAmendments, leases, payments, reconciliations } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  BILLABLE_LEASE_STATUSES,
  DomainError,
  chargeDueDate,
  isChargeOverdue,
  monthStartOf,
  rentForPeriod,
  saoPauloDate,
  shouldBillPeriod,
  shouldFinalizeLeaseEnd,
  transitionCharge,
  transitionLease,
} from '@aluguei/domain';
import type { RentChange } from '@aluguei/domain';
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

async function rentChangesByLease(
  db: AppDb,
  leaseIds: readonly string[],
): Promise<Map<string, RentChange[]>> {
  const byLease = new Map<string, RentChange[]>();
  if (leaseIds.length === 0) {
    return byLease;
  }
  const rows = await db
    .select()
    .from(leaseAmendments)
    .where(inArray(leaseAmendments.leaseId, [...leaseIds]))
    .orderBy(asc(leaseAmendments.createdAt));
  for (const row of rows) {
    if (row.effectiveFrom === null || row.previousRentCents === null || row.newRentCents === null) {
      continue;
    }
    const list = byLease.get(row.leaseId) ?? [];
    list.push({
      effectiveFrom: row.effectiveFrom,
      previousRentCents: row.previousRentCents,
      newRentCents: row.newRentCents,
    });
    byLease.set(row.leaseId, list);
  }
  return byLease;
}

/**
 * Gera as cobranças do período (idempotente por UNIQUE lease+period). Auditoria 2026-09-10, P1-20:
 * lista explícita de status cobráveis dentro da vigência — antes `lt(status, 'TERMINATING')`
 * comparava texto e cobrava ENDED e PENDING, e deixava de cobrar TERMINATING. Vencimento no dia da
 * locação e aluguel do período pelo histórico de reajustes (P1-07).
 */
export async function processPaymentSchedulerJob(db: AppDb, job: PaymentJob): Promise<void> {
  const today = saoPauloDate(new Date());
  const periodStart =
    typeof job.payload['periodStart'] === 'string'
      ? monthStartOf(job.payload['periodStart'])
      : monthStartOf(today);
  const candidates = await db
    .select()
    .from(leases)
    .where(and(eq(leases.orgId, job.orgId), inArray(leases.status, [...BILLABLE_LEASE_STATUSES])));
  const billable = candidates.filter((lease) => shouldBillPeriod(lease, periodStart));
  const changes = await rentChangesByLease(
    db,
    billable.map((lease) => lease.id),
  );
  for (const lease of billable) {
    const rentCents = rentForPeriod(
      lease.monthlyRentCents,
      changes.get(lease.id) ?? [],
      periodStart,
    );
    const condoFeeCents = lease.condoFeeCents ?? 0;
    await db
      .insert(charges)
      .values({
        orgId: job.orgId,
        leaseId: lease.id,
        periodStart,
        dueDate: chargeDueDate(periodStart, lease.dueDay),
        status: 'SCHEDULED',
        amountCents: rentCents + condoFeeCents,
        rentCents,
        condoFeeCents,
      })
      .onConflictDoNothing();
  }
  await advanceBillingLifecycle(db, job.orgId, today);
}

/**
 * Varredura diária da cobrança e da locação (auditoria 2026-09-10, P1-07 e P1-20), com `today` na
 * data de São Paulo:
 *  - agendada abre (OPEN) quando o período começa;
 *  - em aberto vence (OVERDUE) só depois do dia útil seguinte ao vencimento;
 *  - em encerramento com a data de fim já passada termina (ENDED);
 *  - o aluguel em vigor da locação acompanha os reajustes que já começaram.
 */
export async function advanceBillingLifecycle(
  db: AppDb,
  orgId: string,
  today: string,
): Promise<void> {
  await db
    .update(charges)
    .set({ status: 'OPEN', updatedAt: new Date() })
    .where(
      and(
        eq(charges.orgId, orgId),
        eq(charges.status, 'SCHEDULED'),
        lte(charges.periodStart, today),
      ),
    );

  const pastDue = await db
    .select({ id: charges.id, dueDate: charges.dueDate })
    .from(charges)
    .where(and(eq(charges.orgId, orgId), eq(charges.status, 'OPEN'), lt(charges.dueDate, today)));
  for (const charge of pastDue) {
    if (!isChargeOverdue(charge.dueDate, today)) {
      continue;
    }
    transitionCharge('OPEN', 'OVERDUE');
    await db
      .update(charges)
      .set({ status: 'OVERDUE', updatedAt: new Date() })
      .where(and(eq(charges.id, charge.id), eq(charges.status, 'OPEN')));
  }

  const ending = await db
    .select()
    .from(leases)
    .where(and(eq(leases.orgId, orgId), eq(leases.status, 'TERMINATING')));
  for (const lease of ending) {
    if (!shouldFinalizeLeaseEnd(lease, today)) {
      continue;
    }
    transitionLease('TERMINATING', 'ENDED');
    const [ended] = await db
      .update(leases)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(and(eq(leases.id, lease.id), eq(leases.status, 'TERMINATING')))
      .returning({ id: leases.id });
    if (ended) {
      await writeAudit(db, {
        orgId,
        action: AUDIT_ACTIONS.LEASE_ENDED,
        entityType: 'LEASE',
        entityId: lease.id,
        payload: { endDate: lease.endDate, source: 'scheduler' },
      });
    }
  }

  const inForce = await db
    .select()
    .from(leases)
    .where(and(eq(leases.orgId, orgId), inArray(leases.status, [...BILLABLE_LEASE_STATUSES])));
  const changes = await rentChangesByLease(
    db,
    inForce.map((lease) => lease.id),
  );
  const currentMonth = monthStartOf(today);
  for (const lease of inForce) {
    const leaseChanges = changes.get(lease.id);
    if (!leaseChanges) {
      continue;
    }
    const current = rentForPeriod(lease.monthlyRentCents, leaseChanges, currentMonth);
    if (current !== lease.monthlyRentCents) {
      await db
        .update(leases)
        .set({ monthlyRentCents: current, updatedAt: new Date() })
        .where(eq(leases.id, lease.id));
    }
  }
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
  // A conciliação é diária: roda também a varredura de cobrança e locação (P1-07, P1-20).
  await advanceBillingLifecycle(db, job.orgId, saoPauloDate(new Date()));
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
