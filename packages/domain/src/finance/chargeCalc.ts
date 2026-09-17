import { DomainError } from '../errors.js';
import { daysBetween, nextBusinessDay } from './calendar.js';
import { add, sub } from './money.js';

export interface ChargeBreakdown {
  rentCents: number;
  condoFeeCents: number;
  lateFeeCents: number;
  interestCents: number;
  taxesCents: number;
  discountCents: number;
  amountCents: number;
}

/** Multa padrão: 2% (auditoria 2026-09-10, P1-07). */
export const DEFAULT_LATE_FEE_BPS = 200;
/** Teto da multa configurável por locação: 10%. */
export const MAX_LATE_FEE_BPS = 1_000;
/** Juros de mora padrão: 1% ao mês, pro rata die. */
export const DEFAULT_INTEREST_MONTHLY_BPS = 100;
/** Teto dos juros de mora configuráveis: 1% ao mês. */
export const MAX_INTEREST_MONTHLY_BPS = 100;
/** Mês comercial usado no pro rata die. */
const DAYS_PER_MONTH = 30;

export interface LateChargeTerms {
  lateFeeBps: number;
  interestMonthlyBps: number;
}

export interface ChargeCalcInput {
  rentCents: number;
  condoFeeCents?: number;
  taxesCents?: number;
  discountCents?: number;
  /** Multa em basis points (padrão 200 = 2%). */
  lateFeeBps?: number;
  /** Juros de mora ao mês em basis points, pro rata die (padrão 100 = 1% a.m.). */
  interestMonthlyBps?: number;
  dueDate: string; // data civil do vencimento
  paidOn: string; // data civil do pagamento em São Paulo (injetada — determinístico)
}

export function assertLateChargeTerms(terms: LateChargeTerms): void {
  const { lateFeeBps, interestMonthlyBps } = terms;
  if (!Number.isInteger(lateFeeBps) || lateFeeBps < 0 || lateFeeBps > MAX_LATE_FEE_BPS) {
    throw new DomainError('INVALID_INPUT', 'A multa por atraso deve ficar entre 0% e 10%', {
      lateFeeBps,
    });
  }
  if (
    !Number.isInteger(interestMonthlyBps) ||
    interestMonthlyBps < 0 ||
    interestMonthlyBps > MAX_INTEREST_MONTHLY_BPS
  ) {
    throw new DomainError('INVALID_INPUT', 'Os juros de mora devem ficar entre 0% e 1% ao mês', {
      interestMonthlyBps,
    });
  }
}

/** Vencimento no dia `dueDay` (1 a 28) do mês do período. */
export function chargeDueDate(periodStart: string, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    throw new DomainError('INVALID_INPUT', 'O dia de vencimento deve ficar entre 1 e 28', {
      dueDay,
    });
  }
  return `${periodStart.slice(0, 8)}${String(dueDay).padStart(2, '0')}`;
}

/** Vencida só depois do dia útil seguinte ao vencimento (fim de semana e feriado dão carência). */
export function isChargeOverdue(dueDate: string, today: string): boolean {
  return today > nextBusinessDay(dueDate);
}

/**
 * Calcula a cobrança na data do pagamento (auditoria 2026-09-10, P1-07). Em atraso — depois do dia
 * útil seguinte ao vencimento —, multa e juros incidem sobre o valor em atraso (aluguel, condomínio
 * e tributos da cobrança). Os juros são mensais pro rata die, contados desde o vencimento. O desconto
 * abate no fim; o valor nunca fica negativo.
 */
export function calculateChargeBreakdown(input: ChargeCalcInput): ChargeBreakdown {
  const { rentCents, dueDate, paidOn } = input;
  const condoFeeCents = input.condoFeeCents ?? 0;
  const taxesCents = input.taxesCents ?? 0;
  const discountCents = input.discountCents ?? 0;
  const terms: LateChargeTerms = {
    lateFeeBps: input.lateFeeBps ?? DEFAULT_LATE_FEE_BPS,
    interestMonthlyBps: input.interestMonthlyBps ?? DEFAULT_INTEREST_MONTHLY_BPS,
  };
  assertLateChargeTerms(terms);

  const base = add(add(rentCents, condoFeeCents), taxesCents);
  const late = isChargeOverdue(dueDate, paidOn);
  const overdueDays = late ? daysBetween(dueDate, paidOn) : 0;
  // BigInt: base × bps × dias não passa por float nem estoura inteiro seguro.
  const lateFeeCents = late ? Number((BigInt(base) * BigInt(terms.lateFeeBps)) / 10_000n) : 0;
  const interestCents = late
    ? Number(
        (BigInt(base) * BigInt(terms.interestMonthlyBps) * BigInt(overdueDays)) /
          BigInt(10_000 * DAYS_PER_MONTH),
      )
    : 0;

  const gross = add(add(base, lateFeeCents), interestCents);
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
