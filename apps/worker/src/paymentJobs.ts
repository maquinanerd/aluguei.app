import { randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  charges,
  leases,
  payouts,
  payments,
  splitAllocations,
  splitRules,
  reconciliations,
} from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  isChargeStatus,
  isLeaseStatus,
  isPaymentStatus,
  splitPayment,
  transitionCharge,
  transitionPayment,
} from '@aluguei/domain';
import type { ChargeStatus, PaymentStatus } from '@aluguei/domain';
import type { IPaymentProvider } from '@aluguei/integrations';
import { writeAudit } from '@aluguei/api/audit';
import { postLedgerTransaction } from '@aluguei/api/ledger';

export interface PaymentJob {
  id: string;
  orgId: string;
  payload: Record<string, unknown>;
}

/** Aplica PAID no pagamento + charge, ledger T2, split allocations e payout. */
export async function processPaymentJob(
  db: AppDb,
  job: PaymentJob,
  provider: IPaymentProvider,
): Promise<void> {
  const eventType =
    typeof job.payload['eventType'] === 'string' ? job.payload['eventType'] : 'PAYMENT_FAILED';
  const providerChargeId =
    typeof job.payload['providerChargeId'] === 'string' ? job.payload['providerChargeId'] : '';
  const amountCents =
    typeof job.payload['amountCents'] === 'number' ? job.payload['amountCents'] : 0;
  const paidAt =
    typeof job.payload['paidAt'] === 'string' ? job.payload['paidAt'] : new Date().toISOString();

  const [charge] = await db
    .select()
    .from(charges)
    .where(and(eq(charges.orgId, job.orgId), eq(charges.providerChargeId, providerChargeId)))
    .limit(1);
  if (!charge) {
    return; // charge desconhecida — ignora
  }
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.chargeId, charge.id))
    .orderBy(payments.createdAt)
    .limit(1);
  if (!payment) {
    return;
  }
  if (!isPaymentStatus(payment.status) || !isChargeStatus(charge.status)) {
    throw new Error('status inválido');
  }

  if (eventType === 'PAYMENT_CONFIRMED') {
    if (payment.status === 'CONFIRMED') {
      return; // idempotente
    }
    transitionPayment(payment.status as PaymentStatus, 'CONFIRMED');
    transitionCharge(charge.status as ChargeStatus, 'PAID');
    await db
      .update(payments)
      .set({ status: 'CONFIRMED', paidAt: new Date(paidAt) })
      .where(eq(payments.id, payment.id));
    await db
      .update(charges)
      .set({ status: 'PAID', paidAt: new Date(paidAt), updatedAt: new Date() })
      .where(eq(charges.id, charge.id));

    // Ledger T2: CASH débito / AR_RECEIVABLE crédito.
    const transactionId = randomUUID();
    await postLedgerTransaction(db, job.orgId, transactionId, 'PAYMENT', payment.id, [
      { code: 'CASH', amountCents: payment.amountCents },
      { code: 'AR_RECEIVABLE', amountCents: -payment.amountCents },
    ]);

    // Split allocations (AGENCY/LANDLORD) + payout.
    const [rule] = await db
      .select()
      .from(splitRules)
      .where(eq(splitRules.leaseId, charge.leaseId))
      .limit(1);
    const allocations = splitPayment({
      rentCents: charge.rentCents,
      amountCents: payment.amountCents,
      agencyShareBps: rule?.agencyShareBps ?? 1000,
    });
    for (const allocation of allocations) {
      await db.insert(splitAllocations).values({
        orgId: job.orgId,
        paymentId: payment.id,
        partyId: allocation.role === 'LANDLORD' ? (rule?.landlordPartyId ?? null) : null,
        role: allocation.role,
        amountCents: allocation.amountCents,
        status: 'PENDING',
      });
    }
    const landlordAllocation = allocations.find((a) => a.role === 'LANDLORD');
    if (landlordAllocation && landlordAllocation.amountCents > 0 && rule?.landlordPartyId) {
      await db.insert(payouts).values({
        orgId: job.orgId,
        partyId: rule.landlordPartyId,
        amountCents: landlordAllocation.amountCents,
        status: 'PENDING',
      });
      await postLedgerTransaction(db, job.orgId, randomUUID(), 'PAYOUT', payment.id, [
        { code: 'LANDLORD_PAYABLE', amountCents: landlordAllocation.amountCents },
        { code: 'CASH', amountCents: -landlordAllocation.amountCents },
      ]);
    }
    await writeAudit(db, {
      orgId: job.orgId,
      action: AUDIT_ACTIONS.PAYMENT_CONFIRMED,
      entityType: 'CHARGE',
      entityId: charge.id,
      payload: { paymentId: payment.id, amountCents: payment.amountCents },
    });
  } else if (eventType === 'PAYMENT_REFUNDED') {
    transitionPayment(payment.status as PaymentStatus, 'REFUNDED');
    transitionCharge(charge.status as ChargeStatus, 'REFUNDED');
    await db.update(payments).set({ status: 'REFUNDED' }).where(eq(payments.id, payment.id));
    await db
      .update(charges)
      .set({ status: 'REFUNDED', updatedAt: new Date() })
      .where(eq(charges.id, charge.id));
  } else if (eventType === 'PAYMENT_OVERDUE') {
    if (isChargeStatus(charge.status) && charge.status === 'OPEN') {
      transitionCharge('OPEN', 'OVERDUE');
      await db
        .update(charges)
        .set({ status: 'OVERDUE', updatedAt: new Date() })
        .where(eq(charges.id, charge.id));
      await db
        .update(leases)
        .set({ status: 'DELINQUENT', updatedAt: new Date() })
        .where(eq(leases.id, charge.leaseId));
    }
  } else {
    if (payment.status === 'PENDING') {
      transitionPayment('PENDING', 'FAILED');
      await db.update(payments).set({ status: 'FAILED' }).where(eq(payments.id, payment.id));
    }
  }
  void amountCents;
  void provider;
}

/** Gera charges do mês corrente para leases ACTIVE/DELINQUENT (idempotente por UNIQUE lease+period). */
export async function processPaymentSchedulerJob(db: AppDb, job: PaymentJob): Promise<void> {
  const periodStart =
    typeof job.payload['periodStart'] === 'string'
      ? job.payload['periodStart']
      : new Date().toISOString().slice(0, 8) + '01';
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
  // Abre charges vencidas (SCHEDULED → OPEN quando due_date <= hoje).
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

/** Reconciliação: compara saldo do provider com o local (independe de webhook). */
export async function processReconcileJob(
  db: AppDb,
  job: PaymentJob,
  provider: IPaymentProvider | null,
): Promise<void> {
  const periodStart =
    typeof job.payload['periodStart'] === 'string' ? job.payload['periodStart'] : '';
  const providerCharges = provider ? providerChargesOf(provider) : [];
  const providerTotal = providerCharges.reduce((sum, item) => sum + item.amountCents, 0);
  const localCharges = await db
    .select()
    .from(charges)
    .where(and(eq(charges.orgId, job.orgId), eq(charges.status, 'PAID')));
  const localTotal = localCharges.reduce((sum, charge) => sum + charge.amountCents, 0);
  const matched = providerTotal === localTotal;
  await db.insert(reconciliations).values({
    orgId: job.orgId,
    provider: 'FAKE',
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
    payload: { matched, providerTotal, localTotal },
  });
}

function providerChargesOf(provider: IPaymentProvider): Array<{ amountCents: number }> {
  const fake = provider as { getProviderCharges?: () => Array<{ amountCents: number }> };
  return fake.getProviderCharges?.() ?? [];
}
