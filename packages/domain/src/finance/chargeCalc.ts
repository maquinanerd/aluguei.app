import { add, mulBpsFloor, sub } from './money.js';

export interface ChargeBreakdown {
  rentCents: number;
  condoFeeCents: number;
  lateFeeCents: number;
  interestCents: number;
  taxesCents: number;
  discountCents: number;
  amountCents: number;
}

export interface ChargeCalcInput {
  rentCents: number;
  condoFeeCents?: number;
  taxesCents?: number;
  discountCents?: number;
  lateFeeBps?: number; // default 200 (2%)
  interestDailyBps?: number; // default 100 (1%/dia)
  dueDate: string; // ISO date
  paidOn: string; // ISO date (injetado — determinístico)
}

/** Dias inteiros de atraso em calendário UTC (nunca negativo). */
function daysOverdue(dueDate: string, paidOn: string): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  const paid = Date.parse(`${paidOn}T00:00:00.000Z`);
  const diffMs = paid - due;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

/**
 * Calcula o breakdown de uma cobrança no momento da iniciação do pagamento.
 * Multa/juros sobre o aluguel; desconto abate; valor nunca negativo.
 */
export function calculateChargeBreakdown(input: ChargeCalcInput): ChargeBreakdown {
  const { rentCents, dueDate, paidOn } = input;
  const condoFeeCents = input.condoFeeCents ?? 0;
  const taxesCents = input.taxesCents ?? 0;
  const discountCents = input.discountCents ?? 0;
  const lateFeeBps = input.lateFeeBps ?? 200;
  const interestDailyBps = input.interestDailyBps ?? 100;

  const overdueDays = daysOverdue(dueDate, paidOn);
  const lateFeeCents = overdueDays > 0 ? mulBpsFloor(rentCents, lateFeeBps) : 0;
  // Juros simples 1%/dia sobre o aluguel: rent × dailyBps × dias de atraso.
  const interestCents =
    overdueDays > 0 ? mulBpsFloor(rentCents, interestDailyBps * overdueDays) : 0;

  const gross = add(
    add(add(add(rentCents, condoFeeCents), lateFeeCents), interestCents),
    taxesCents,
  );
  const amountCents = Math.max(0, sub(gross, discountCents));

  return {
    rentCents,
    condoFeeCents,
    lateFeeCents,
    interestCents,
    taxesCents,
    discountCents,
    amountCents,
  };
}
