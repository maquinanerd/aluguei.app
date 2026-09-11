import { and, eq, inArray } from 'drizzle-orm';
import type { AppDb, DbExecutor } from '@aluguei/db';
import { charges, leases, payments, payouts, splitAllocations, splitRules } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  isChargeStatus,
  isPaymentStatus,
  splitPayment,
  transitionCharge,
  transitionLease,
  transitionPayment,
} from '@aluguei/domain';
import type { ChargeStatus, PaymentStatus } from '@aluguei/domain';
import { writeAudit } from '../plugins/audit.js';
import { balancesByAccount, postLedgerTransaction } from '../ledger.js';
import type { LedgerLeg } from '../ledger.js';

/**
 * Liquidação financeira — auditoria 2026-09-10 (P0-01, P0-02, P0-03).
 * Regras que este módulo garante:
 *  - todo efeito de um pagamento acontece numa única transação, com a cobrança
 *    travada (FOR UPDATE) e compare-and-set de status: eventos repetidos ou
 *    concorrentes aplicam o efeito uma vez só;
 *  - dinheiro recebido nunca desaparece: se a cobrança não aceita mais
 *    liquidação, o valor entra como recebimento não aplicado;
 *  - estorno só é REGISTRADO aqui; quem executa é o backoffice chamando o
 *    provider. Nenhum webhook executa estorno.
 * Ordem de travas em todos os fluxos: cobrança → pagamento (evita deadlock).
 */

type ChargeRow = typeof charges.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

/** Comissão padrão quando a locação não tem regra de split (10% do aluguel). */
export const DEFAULT_AGENCY_SHARE_BPS = 1000;

/** Status de cobrança que ainda aceitam liquidação. */
export const PAYABLE_CHARGE_STATUSES = ['SCHEDULED', 'OPEN', 'OVERDUE'] as const;

export type ConfirmationOutcome = 'SETTLED' | 'UNAPPLIED' | 'ALREADY_APPLIED' | 'NOT_FOUND';
export type RefundOutcome = 'REFUNDED' | 'ALREADY_REFUNDED' | 'NOT_REFUNDABLE' | 'NOT_FOUND';

function chargeStatusOf(charge: ChargeRow): ChargeStatus {
  if (!isChargeStatus(charge.status)) {
    throw new Error(`status de cobrança inválido: ${charge.status}`);
  }
  return charge.status;
}

function paymentStatusOf(payment: PaymentRow): PaymentStatus {
  if (!isPaymentStatus(payment.status)) {
    throw new Error(`status de pagamento inválido: ${payment.status}`);
  }
  return payment.status;
}

export async function splitRuleFor(
  db: DbExecutor,
  leaseId: string,
): Promise<{ agencyShareBps: number; landlordPartyId: string | null }> {
  const [rule] = await db.select().from(splitRules).where(eq(splitRules.leaseId, leaseId)).limit(1);
  return {
    agencyShareBps: rule?.agencyShareBps ?? DEFAULT_AGENCY_SHARE_BPS,
    landlordPartyId: rule?.landlordPartyId ?? null,
  };
}

/** Pernas do reconhecimento de uma cobrança: a receber = comissão + devido ao proprietário. */
export function chargeIssuanceLegs(
  amountCents: number,
  rentCents: number,
  agencyShareBps: number,
): LedgerLeg[] {
  const allocations = splitPayment({ rentCents, amountCents, agencyShareBps });
  const commission =
    allocations.find((allocation) => allocation.role === 'AGENCY')?.amountCents ?? 0;
  return [
    { code: 'AR_RECEIVABLE', amountCents },
    { code: 'AGENCY_FEE_REVENUE', amountCents: -commission },
    { code: 'LANDLORD_PAYABLE', amountCents: -(amountCents - commission) },
  ];
}

/** Reconhece a cobrança (uma vez só — cobranças do scheduler são reconhecidas na liquidação). */
export async function postChargeIssuance(
  db: DbExecutor,
  charge: ChargeRow,
  agencyShareBps: number,
): Promise<void> {
  await postLedgerTransaction(db, {
    orgId: charge.orgId,
    businessKey: `CHARGE:${charge.id}`,
    referenceType: 'CHARGE',
    referenceId: charge.id,
    legs: chargeIssuanceLegs(charge.amountCents, charge.rentCents, agencyShareBps),
  });
}

/** Estorna contabilmente o que foi reconhecido para uma cobrança cancelada. */
export async function postChargeCancellation(db: DbExecutor, charge: ChargeRow): Promise<void> {
  const recognized = await balancesByAccount(
    db,
    charge.orgId,
    ['CHARGE', 'CHARGE_ADJUST'],
    charge.id,
  );
  await postLedgerTransaction(db, {
    orgId: charge.orgId,
    businessKey: `CHARGE_CANCEL:${charge.id}`,
    referenceType: 'CHARGE_CANCEL',
    referenceId: charge.id,
    legs: [...recognized].map(([code, amountCents]) => ({ code, amountCents: -amountCents })),
  });
}

/** Pagamento pelo id do provider (o webhook não decide org nem cobrança pelo payload). */
export async function findPaymentByProviderId(
  db: DbExecutor,
  provider: string,
  providerPaymentId: string,
  orgId?: string,
): Promise<PaymentRow | null> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.provider, provider),
        eq(payments.providerPaymentId, providerPaymentId),
        orgId ? eq(payments.orgId, orgId) : undefined,
      ),
    )
    .limit(1);
  return payment ?? null;
}

async function lockChargeAndPayment(
  tx: DbExecutor,
  orgId: string,
  paymentId: string,
): Promise<{ charge: ChargeRow; payment: PaymentRow } | null> {
  const [reference] = await tx
    .select({ chargeId: payments.chargeId })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId)))
    .limit(1);
  if (!reference) {
    return null;
  }
  const [charge] = await tx
    .select()
    .from(charges)
    .where(eq(charges.id, reference.chargeId))
    .for('update');
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .for('update');
  return charge && payment ? { charge, payment } : null;
}

async function settleCharge(tx: DbExecutor, charge: ChargeRow, payment: PaymentRow): Promise<void> {
  const { agencyShareBps, landlordPartyId } = await splitRuleFor(tx, charge.leaseId);
  const received = payment.amountCents;

  await postChargeIssuance(tx, charge, agencyShareBps);
  await postLedgerTransaction(tx, {
    orgId: charge.orgId,
    businessKey: `PAYMENT:${payment.id}`,
    referenceType: 'PAYMENT',
    referenceId: payment.id,
    legs: [
      { code: 'CASH', amountCents: received },
      { code: 'AR_RECEIVABLE', amountCents: -received },
    ],
  });

  // Valor pago ≠ valor reconhecido (multa/juros recalculados na iniciação):
  // o a receber zera e a diferença vai para o repasse, como no split.
  const recognized = await balancesByAccount(
    tx,
    charge.orgId,
    ['CHARGE', 'CHARGE_ADJUST'],
    charge.id,
  );
  const difference = received - (recognized.get('AR_RECEIVABLE') ?? 0);
  if (difference !== 0) {
    await postLedgerTransaction(tx, {
      orgId: charge.orgId,
      businessKey: `CHARGE_ADJUST:${charge.id}:${payment.id}`,
      referenceType: 'CHARGE_ADJUST',
      referenceId: charge.id,
      legs: [
        { code: 'AR_RECEIVABLE', amountCents: difference },
        { code: 'LANDLORD_PAYABLE', amountCents: -difference },
      ],
    });
  }

  const allocations = splitPayment({
    rentCents: charge.rentCents,
    amountCents: received,
    agencyShareBps,
  });
  await tx.insert(splitAllocations).values(
    allocations.map((allocation) => ({
      orgId: charge.orgId,
      paymentId: payment.id,
      partyId: allocation.role === 'LANDLORD' ? landlordPartyId : null,
      role: allocation.role,
      amountCents: allocation.amountCents,
      status: 'PENDING',
    })),
  );

  const landlordShare =
    allocations.find((allocation) => allocation.role === 'LANDLORD')?.amountCents ?? 0;
  if (landlordShare > 0 && landlordPartyId) {
    await tx.insert(payouts).values({
      orgId: charge.orgId,
      paymentId: payment.id,
      partyId: landlordPartyId,
      amountCents: landlordShare,
      status: 'PENDING',
    });
    await postLedgerTransaction(tx, {
      orgId: charge.orgId,
      businessKey: `PAYOUT:${payment.id}:${landlordPartyId}`,
      referenceType: 'PAYOUT',
      referenceId: payment.id,
      legs: [
        { code: 'LANDLORD_PAYABLE', amountCents: landlordShare },
        { code: 'CASH', amountCents: -landlordShare },
      ],
    });
  }

  await writeAudit(tx, {
    orgId: charge.orgId,
    action: AUDIT_ACTIONS.PAYMENT_CONFIRMED,
    entityType: 'CHARGE',
    entityId: charge.id,
    payload: { paymentId: payment.id, amountCents: received },
  });
}

async function recordUnappliedReceipt(
  tx: DbExecutor,
  charge: ChargeRow,
  payment: PaymentRow,
): Promise<void> {
  await postLedgerTransaction(tx, {
    orgId: charge.orgId,
    businessKey: `PAYMENT:${payment.id}`,
    referenceType: 'PAYMENT',
    referenceId: payment.id,
    description: `Recebimento não aplicado (cobrança ${charge.status})`,
    legs: [
      { code: 'CASH', amountCents: payment.amountCents },
      { code: 'UNAPPLIED_RECEIPTS', amountCents: -payment.amountCents },
    ],
  });
  await writeAudit(tx, {
    orgId: charge.orgId,
    action: AUDIT_ACTIONS.PAYMENT_UNAPPLIED,
    entityType: 'CHARGE',
    entityId: charge.id,
    payload: {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      chargeStatus: charge.status,
    },
  });
}

/** Registra um pagamento JÁ confirmado no provider. Idempotente e atômico. */
export async function applyProviderConfirmation(
  db: AppDb,
  orgId: string,
  paymentId: string,
  paidAt: Date,
): Promise<ConfirmationOutcome> {
  return db.transaction(async (tx) => {
    const locked = await lockChargeAndPayment(tx, orgId, paymentId);
    if (!locked) {
      return 'NOT_FOUND';
    }
    const { charge, payment } = locked;
    const paymentStatus = paymentStatusOf(payment);
    if (paymentStatus === 'CONFIRMED' || paymentStatus === 'REFUNDED') {
      return 'ALREADY_APPLIED';
    }
    transitionPayment(paymentStatus, 'CONFIRMED');
    const [confirmed] = await tx
      .update(payments)
      .set({ status: 'CONFIRMED', paidAt, updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, paymentStatus)))
      .returning();
    if (!confirmed) {
      return 'ALREADY_APPLIED';
    }

    const chargeStatus = chargeStatusOf(charge);
    if ((PAYABLE_CHARGE_STATUSES as readonly string[]).includes(chargeStatus)) {
      transitionCharge(chargeStatus, 'PAID');
      const [paid] = await tx
        .update(charges)
        .set({ status: 'PAID', paidAt, paidPaymentId: confirmed.id, updatedAt: new Date() })
        .where(
          and(eq(charges.id, charge.id), inArray(charges.status, [...PAYABLE_CHARGE_STATUSES])),
        )
        .returning();
      if (paid) {
        await settleCharge(tx, paid, confirmed);
        return 'SETTLED';
      }
    }
    await recordUnappliedReceipt(tx, charge, confirmed);
    return 'UNAPPLIED';
  });
}

/** Registra um estorno JÁ confirmado no provider (nunca executa estorno). */
export async function applyProviderRefund(
  db: AppDb,
  orgId: string,
  paymentId: string,
): Promise<RefundOutcome> {
  return db.transaction(async (tx) => {
    const locked = await lockChargeAndPayment(tx, orgId, paymentId);
    if (!locked) {
      return 'NOT_FOUND';
    }
    const { charge, payment } = locked;
    const paymentStatus = paymentStatusOf(payment);
    if (paymentStatus === 'REFUNDED') {
      return 'ALREADY_REFUNDED';
    }
    if (paymentStatus !== 'CONFIRMED') {
      return 'NOT_REFUNDABLE';
    }
    transitionPayment('CONFIRMED', 'REFUNDED');
    const [refunded] = await tx
      .update(payments)
      .set({ status: 'REFUNDED', refundedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, 'CONFIRMED')))
      .returning();
    if (!refunded) {
      return 'ALREADY_REFUNDED';
    }
    const received = refunded.amountCents;

    if (charge.paidPaymentId === refunded.id) {
      if (chargeStatusOf(charge) === 'PAID') {
        transitionCharge('PAID', 'REFUNDED');
        await tx
          .update(charges)
          .set({ status: 'REFUNDED', updatedAt: new Date() })
          .where(and(eq(charges.id, charge.id), eq(charges.status, 'PAID')));
      }
      const allocations = await tx
        .select()
        .from(splitAllocations)
        .where(eq(splitAllocations.paymentId, refunded.id));
      const commission = allocations
        .filter((allocation) => allocation.role === 'AGENCY')
        .reduce((sum, allocation) => sum + allocation.amountCents, 0);
      const landlordShare = received - commission;
      await tx
        .update(splitAllocations)
        .set({ status: 'CANCELLED' })
        .where(
          and(eq(splitAllocations.paymentId, refunded.id), eq(splitAllocations.status, 'PENDING')),
        );

      const [payout] = await tx
        .select()
        .from(payouts)
        .where(eq(payouts.paymentId, refunded.id))
        .for('update');
      let landlordLeg: LedgerLeg = { code: 'LANDLORD_PAYABLE', amountCents: landlordShare };
      if (payout?.status === 'PENDING') {
        await tx
          .update(payouts)
          .set({ status: 'CANCELLED', updatedAt: new Date() })
          .where(and(eq(payouts.id, payout.id), eq(payouts.status, 'PENDING')));
        await postLedgerTransaction(tx, {
          orgId: charge.orgId,
          businessKey: `PAYOUT_REVERSAL:${refunded.id}:${payout.partyId ?? 'sem-parte'}`,
          referenceType: 'PAYOUT_REVERSAL',
          referenceId: refunded.id,
          legs: [
            { code: 'LANDLORD_PAYABLE', amountCents: -payout.amountCents },
            { code: 'CASH', amountCents: payout.amountCents },
          ],
        });
      } else if (payout?.status === 'PAID') {
        // repasse já executado: o valor vira a recuperar do proprietário
        landlordLeg = { code: 'LANDLORD_CLAWBACK_RECEIVABLE', amountCents: landlordShare };
      }
      await postLedgerTransaction(tx, {
        orgId: charge.orgId,
        businessKey: `REFUND:${refunded.id}`,
        referenceType: 'REFUND',
        referenceId: refunded.id,
        legs: [
          { code: 'CASH', amountCents: -received },
          { code: 'AGENCY_FEE_REVENUE', amountCents: commission },
          landlordLeg,
        ],
      });
    } else {
      await postLedgerTransaction(tx, {
        orgId: charge.orgId,
        businessKey: `REFUND:${refunded.id}`,
        referenceType: 'REFUND',
        referenceId: refunded.id,
        description: 'Devolução de recebimento não aplicado',
        legs: [
          { code: 'CASH', amountCents: -received },
          { code: 'UNAPPLIED_RECEIPTS', amountCents: received },
        ],
      });
    }

    await writeAudit(tx, {
      orgId: charge.orgId,
      action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
      entityType: 'CHARGE',
      entityId: charge.id,
      payload: { paymentId: refunded.id, amountCents: received },
    });
    return 'REFUNDED';
  });
}

/** Marca a tentativa como falha (só quando o provider confirma a falha). */
export async function applyProviderFailure(
  db: AppDb,
  orgId: string,
  paymentId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const locked = await lockChargeAndPayment(tx, orgId, paymentId);
    if (!locked || paymentStatusOf(locked.payment) !== 'PENDING') {
      return false;
    }
    transitionPayment('PENDING', 'FAILED');
    const rows = await tx
      .update(payments)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'PENDING')))
      .returning({ id: payments.id });
    return rows.length === 1;
  });
}

/** Cobrança vencida: OPEN → OVERDUE e locação ACTIVE → DELINQUENT. */
export async function markChargeOverdue(
  db: AppDb,
  orgId: string,
  chargeId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [charge] = await tx
      .select()
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.orgId, orgId)))
      .for('update');
    if (!charge || chargeStatusOf(charge) !== 'OPEN') {
      return false;
    }
    transitionCharge('OPEN', 'OVERDUE');
    await tx
      .update(charges)
      .set({ status: 'OVERDUE', updatedAt: new Date() })
      .where(and(eq(charges.id, charge.id), eq(charges.status, 'OPEN')));
    transitionLease('ACTIVE', 'DELINQUENT');
    await tx
      .update(leases)
      .set({ status: 'DELINQUENT', updatedAt: new Date() })
      .where(and(eq(leases.id, charge.leaseId), eq(leases.status, 'ACTIVE')));
    return true;
  });
}
