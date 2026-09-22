import { mulBpsFloor, splitAmount } from './money.js';

/** Papéis de uma alocação do split (CHECK `split_allocations_role_valid` no banco). */
export const SPLIT_ALLOCATION_ROLES = ['LANDLORD', 'AGENCY'] as const;
export type SplitAllocationRole = (typeof SPLIT_ALLOCATION_ROLES)[number];

export interface SplitAllocation {
  role: SplitAllocationRole;
  amountCents: number;
}

export interface SplitInput {
  rentCents: number;
  amountCents: number; // valor pago (pode incluir multa/juros/taxas)
  agencyShareBps: number; // default 1000 (10%) — comissão sobre o aluguel
}

/**
 * Split determinístico: comissão da agência = bps sobre o ALUGUEL;
 * landlord recebe o restante (inclui repasses de multa/juros/taxas) − desconto já
 * aplicado no amount. Soma das allocations = amountCents (invariante).
 */
export function splitPayment(input: SplitInput): SplitAllocation[] {
  const rawCommission = mulBpsFloor(input.rentCents, input.agencyShareBps);
  const commission = Math.min(rawCommission, input.amountCents);
  const landlord = input.amountCents - commission;
  return [
    { role: 'AGENCY', amountCents: commission },
    { role: 'LANDLORD', amountCents: landlord },
  ];
}

/** Split genérico N partes pelo método do maior resto (soma = total). */
export function splitAmong(totalCents: number, weights: number[]): number[] {
  return splitAmount(totalCents, weights);
}
