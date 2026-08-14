import { mulBpsFloor, splitAmount } from './money.js';

export interface SplitAllocation {
  role: 'LANDLORD' | 'AGENCY';
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
