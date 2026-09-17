import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { charges, leases, payments } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  calculateChargeBreakdown,
  isChargeStatus,
  saoPauloDate,
  transitionCharge,
} from '@aluguei/domain';
import type { ChargeStatus } from '@aluguei/domain';
import type { CreateChargeResult, IPaymentProvider } from '@aluguei/integrations';
import { writeAudit } from '../plugins/audit.js';
import { PAYABLE_CHARGE_STATUSES } from './settlement.js';

type ChargeRow = typeof charges.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

export interface InitiatePaymentInput {
  orgId: string;
  chargeId: string;
  method: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'MANUAL';
  actorUserId?: string | null;
  /** O backoffice recalcula multa/juros no ato; o portal paga o valor da cobrança. */
  recalculate: boolean;
  via: 'backoffice' | 'portal';
}

export interface InitiatePaymentResult {
  reused: boolean;
  payment: PaymentRow;
  pixQrCode: string | null;
  boletoUrl: string | null;
  providerChargeId: string;
}

/** Tentativa sem id do provider criada há menos disso = iniciação em andamento. */
const IN_FLIGHT_MS = 60_000;

function assertPayable(charge: ChargeRow): ChargeStatus {
  if (!isChargeStatus(charge.status)) {
    throw new Error(`status de cobrança inválido: ${charge.status}`);
  }
  if (!(PAYABLE_CHARGE_STATUSES as readonly string[]).includes(charge.status)) {
    throw new DomainError('INVALID_TRANSITION', `Cobrança ${charge.status} não pode ser paga`);
  }
  return charge.status;
}

/**
 * Iniciação de pagamento idempotente (auditoria 2026-09-10, P0-03): no máximo
 * uma tentativa pendente por cobrança (UNIQUE parcial no banco), reaproveitando
 * o QR/boleto já emitido. Reemitir com outro valor/método só acontece se o
 * provider ainda não recebeu — a tentativa anterior é cancelada no provider e
 * localmente; se mesmo assim for paga, o webhook registra o dinheiro.
 * A chamada ao provider fica FORA da transação; o banco só é tocado antes
 * (reserva da tentativa) e depois (id do provider, QR/boleto).
 */
export async function initiatePayment(
  db: AppDb,
  provider: IPaymentProvider,
  input: InitiatePaymentInput,
): Promise<InitiatePaymentResult> {
  const [charge] = await db
    .select()
    .from(charges)
    .where(and(eq(charges.id, input.chargeId), eq(charges.orgId, input.orgId)))
    .limit(1);
  if (!charge) {
    throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
  }
  assertPayable(charge);

  // Multa e juros da locação, na data de São Paulo (auditoria 2026-09-10, P1-07).
  const [terms] = input.recalculate
    ? await db
        .select({ lateFeeBps: leases.lateFeeBps, interestMonthlyBps: leases.interestMonthlyBps })
        .from(leases)
        .where(and(eq(leases.id, charge.leaseId), eq(leases.orgId, charge.orgId)))
        .limit(1)
    : [];
  const breakdown = input.recalculate
    ? calculateChargeBreakdown({
        rentCents: charge.rentCents,
        condoFeeCents: charge.condoFeeCents,
        taxesCents: charge.taxesCents,
        discountCents: charge.discountCents,
        ...(terms
          ? { lateFeeBps: terms.lateFeeBps, interestMonthlyBps: terms.interestMonthlyBps }
          : {}),
        dueDate: charge.dueDate,
        paidOn: saoPauloDate(new Date()),
      })
    : null;
  const amountCents = breakdown?.amountCents ?? charge.amountCents;

  const [pending] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.chargeId, charge.id), eq(payments.status, 'PENDING')))
    .limit(1);

  if (pending?.providerPaymentId) {
    if (pending.amountCents === amountCents && pending.method === input.method) {
      return {
        reused: true,
        payment: pending,
        pixQrCode: pending.pixQrCode,
        boletoUrl: pending.boletoUrl,
        providerChargeId: pending.providerPaymentId,
      };
    }
    const previous = await provider.getChargeStatus(pending.providerPaymentId);
    if (previous === 'CONFIRMED' || previous === 'REFUNDED') {
      throw new DomainError(
        'CONFLICT',
        'A tentativa anterior já foi recebida no provider; aguarde a confirmação',
      );
    }
    await provider.cancelCharge(pending.providerPaymentId);
  } else if (pending && Date.now() - pending.createdAt.getTime() < IN_FLIGHT_MS) {
    throw new DomainError(
      'CONFLICT',
      'Já existe uma iniciação de pagamento em andamento para esta cobrança',
    );
  }

  const reserved = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(charges).where(eq(charges.id, charge.id)).for('update');
    if (!locked) {
      throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
    }
    const status = assertPayable(locked);
    if (pending) {
      await tx
        .update(payments)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(and(eq(payments.id, pending.id), eq(payments.status, 'PENDING')));
    }
    if (breakdown) {
      transitionCharge(status, 'OPEN');
      await tx
        .update(charges)
        .set({
          status: 'OPEN',
          amountCents: breakdown.amountCents,
          lateFeeCents: breakdown.lateFeeCents,
          interestCents: breakdown.interestCents,
          updatedAt: new Date(),
        })
        .where(eq(charges.id, locked.id));
    }
    const [payment] = await tx
      .insert(payments)
      .values({
        orgId: input.orgId,
        chargeId: locked.id,
        amountCents,
        method: input.method,
        status: 'PENDING',
        provider: provider.name,
      })
      .returning();
    if (!payment) {
      throw new Error('falha ao reservar a tentativa de pagamento');
    }
    return payment;
  });

  let providerCharge: CreateChargeResult;
  try {
    providerCharge = await provider.createCharge({
      amountCents,
      description: `Aluguel ${charge.periodStart}`,
      dueDate: charge.dueDate,
      externalReference: reserved.id,
    });
  } catch (err) {
    await db
      .update(payments)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(and(eq(payments.id, reserved.id), eq(payments.status, 'PENDING')));
    throw new DomainError(
      'PROVIDER_ERROR',
      `Falha ao emitir a cobrança no provider: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
    );
  }

  const payment = await db.transaction(async (tx) => {
    // Mesma ordem de travas de todo o fluxo financeiro — cobrança e depois
    // pagamento. Na ordem inversa, duas iniciações simultâneas fechavam ciclo
    // com a fase anterior e o PostgreSQL matava uma delas (deadlock 40P01).
    await tx
      .update(charges)
      .set({ providerChargeId: providerCharge.providerChargeId, updatedAt: new Date() })
      .where(eq(charges.id, charge.id));
    const [updated] = await tx
      .update(payments)
      .set({
        providerPaymentId: providerCharge.providerChargeId,
        pixQrCode: providerCharge.pixQrCode ?? null,
        boletoUrl: providerCharge.boletoUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, reserved.id))
      .returning();
    if (!updated) {
      throw new Error('falha ao registrar o id do provider na tentativa');
    }
    await writeAudit(tx, {
      orgId: input.orgId,
      actorUserId: input.actorUserId ?? null,
      action: AUDIT_ACTIONS.PAYMENT_INITIATED,
      entityType: 'CHARGE',
      entityId: charge.id,
      payload: {
        paymentId: updated.id,
        amountCents,
        via: input.via,
        replaced: pending?.id ?? null,
      },
    });
    return updated;
  });

  return {
    reused: false,
    payment,
    pixQrCode: providerCharge.pixQrCode ?? null,
    boletoUrl: providerCharge.boletoUrl ?? null,
    providerChargeId: providerCharge.providerChargeId,
  };
}
