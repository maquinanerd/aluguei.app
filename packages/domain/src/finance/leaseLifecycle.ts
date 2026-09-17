import { DomainError } from '../errors.js';
import { monthStartOf } from './calendar.js';
import { canTransitionLease, isLeaseStatus } from './stateMachines.js';
import type { LeaseStatus } from './stateMachines.js';

/**
 * Ciclo de vida da locação e repasse por coproprietário (auditoria 2026-09-10, P1-08 e P1-20).
 * Datas são strings `YYYY-MM-DD`.
 */

/** Status cobrados pelo scheduler — lista explícita (antes: comparação alfabética de status). */
export const BILLABLE_LEASE_STATUSES = ['ACTIVE', 'DELINQUENT', 'TERMINATING'] as const;

export interface LeasePeriodInfo {
  status: string;
  startDate: string;
  endDate: string | null;
}

/** O período (primeiro dia do mês) é cobrado se o status é cobrável e o mês cruza a vigência. */
export function shouldBillPeriod(lease: LeasePeriodInfo, periodStart: string): boolean {
  if (!(BILLABLE_LEASE_STATUSES as readonly string[]).includes(lease.status)) {
    return false;
  }
  const period = monthStartOf(periodStart);
  if (period < monthStartOf(lease.startDate)) {
    return false;
  }
  return lease.endDate === null || period <= monthStartOf(lease.endDate);
}

/** Transições para encerrar: TERMINATING já; ENDED também, se a data de fim já passou. */
export function planLeaseEnd(input: {
  status: string;
  endDate: string;
  today: string;
}): LeaseStatus[] {
  const { status, endDate, today } = input;
  if (!isLeaseStatus(status)) {
    throw new DomainError('INVALID_INPUT', `Status de locação desconhecido: ${status}`);
  }
  const plan: LeaseStatus[] = [];
  if (status !== 'TERMINATING') {
    if (!canTransitionLease(status, 'TERMINATING')) {
      throw new DomainError('INVALID_TRANSITION', 'Esta locação não pode ser encerrada', {
        from: status,
        to: 'TERMINATING',
      });
    }
    plan.push('TERMINATING');
  }
  if (endDate < today) {
    plan.push('ENDED');
  }
  return plan;
}

/** Locação em encerramento cuja data de fim já passou vira ENDED (varredura diária). */
export function shouldFinalizeLeaseEnd(
  lease: { status: string; endDate: string | null },
  today: string,
): boolean {
  return lease.status === 'TERMINATING' && lease.endDate !== null && lease.endDate < today;
}

export function assertRenewal(input: {
  status: string;
  startDate: string;
  endDate: string | null;
  newEndDate: string;
}): void {
  if (input.status !== 'ACTIVE' && input.status !== 'DELINQUENT') {
    throw new DomainError('INVALID_TRANSITION', 'Só locação ativa pode ser renovada', {
      status: input.status,
    });
  }
  const floor = input.endDate ?? input.startDate;
  if (input.newEndDate <= floor) {
    throw new DomainError(
      'INVALID_INPUT',
      'A nova data de término precisa ser depois do término atual',
      { endDate: input.endDate, newEndDate: input.newEndDate },
    );
  }
}

/** Aluguel reajustado por índice (basis points, pode ser negativo), arredondado ao centavo. */
export function readjustedRent(rentCents: number, adjustmentBps: number): number {
  if (!Number.isInteger(adjustmentBps) || adjustmentBps <= -10_000 || adjustmentBps > 10_000) {
    throw new DomainError('INVALID_INPUT', 'Índice de reajuste fora do intervalo aceito', {
      adjustmentBps,
    });
  }
  const scaled = BigInt(rentCents) * BigInt(10_000 + adjustmentBps);
  return Number((scaled + 5_000n) / 10_000n);
}

export interface RentChange {
  effectiveFrom: string; // primeiro dia do mês em que o novo aluguel vale
  previousRentCents: number;
  newRentCents: number;
}

/**
 * Aluguel do período pelo histórico: a última mudança em vigor no período; antes da primeira
 * mudança, o aluguel anterior a ela; sem histórico, o aluguel atual da locação.
 */
export function rentForPeriod(
  currentRentCents: number,
  changes: readonly RentChange[],
  periodStart: string,
): number {
  if (changes.length === 0) {
    return currentRentCents;
  }
  const sorted = [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const period = monthStartOf(periodStart);
  let rent = sorted[0]?.previousRentCents ?? currentRentCents;
  for (const change of sorted) {
    if (change.effectiveFrom <= period) {
      rent = change.newRentCents;
    }
  }
  return rent;
}

export interface OwnerShareInput {
  partyId: string;
  ownershipSharePct: number | null;
}

export interface LandlordShare {
  partyId: string;
  shareBps: number;
}

/** Cadastro do imóvel: as participações registradas não passam de 100%. */
export function assertOwnershipTotal(pcts: ReadonlyArray<number | null>): void {
  const total = pcts.reduce<number>((sum, pct) => sum + (pct ?? 0), 0);
  if (total > 100) {
    throw new DomainError(
      'CONFLICT',
      `As participações dos proprietários somariam ${String(total)}%, acima de 100%`,
      { totalPct: total },
    );
  }
}

/**
 * Participações do repasse na criação da locação: proprietário único recebe 100%; coproprietários
 * precisam ter participação registrada e somar exatamente 100%.
 */
export function landlordSharesFromOwners(owners: readonly OwnerShareInput[]): LandlordShare[] {
  if (owners.length === 0) {
    return [];
  }
  const [only] = owners;
  if (
    owners.length === 1 &&
    only &&
    (only.ownershipSharePct === null || only.ownershipSharePct === 100)
  ) {
    return [{ partyId: only.partyId, shareBps: 10_000 }];
  }
  if (owners.some((owner) => owner.ownershipSharePct === null)) {
    throw new DomainError(
      'CONFLICT',
      'Registre a participação de cada proprietário do imóvel antes de criar a locação',
    );
  }
  const total = owners.reduce((sum, owner) => sum + (owner.ownershipSharePct ?? 0), 0);
  if (total !== 100) {
    throw new DomainError(
      'CONFLICT',
      `As participações dos proprietários somam ${String(total)}%; precisam somar 100%`,
      { totalPct: total },
    );
  }
  return owners.map((owner) => ({
    partyId: owner.partyId,
    shareBps: (owner.ownershipSharePct ?? 0) * 100,
  }));
}
