import { DomainError } from '../errors.js';

/** Operações em centavos inteiros — nunca float. Todas com overflow check. */
export function add(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) {
    throw new DomainError('MONEY_OVERFLOW', 'Soma de centavos estourou');
  }
  return result;
}

export function sub(a: number, b: number): number {
  const result = a - b;
  if (!Number.isSafeInteger(result)) {
    throw new DomainError('MONEY_OVERFLOW', 'Subtração de centavos estourou');
  }
  return result;
}

export function negate(a: number): number {
  return -a;
}

/** Multiplica centavos por basis points e arredonda para baixo (sem float). */
export function mulBpsFloor(cents: number, bps: number): number {
  if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(bps)) {
    throw new DomainError('MONEY_OVERFLOW', 'Valores não são inteiros seguros');
  }
  return Math.floor((cents * bps) / 10_000);
}

/**
 * Distribui `totalCents` entre pesos proporcionais usando o método do maior resto —
 * garante que a soma das partes = total (nunca sobra 1 centavo).
 */
export function splitAmount(totalCents: number, weights: number[]): number[] {
  const weightSum = weights.reduce((acc, weight) => acc + weight, 0);
  if (weightSum <= 0) {
    throw new DomainError('INVALID_INPUT', 'Pesos do split devem ser positivos');
  }
  const base = weights.map((weight) => Math.floor((totalCents * weight) / weightSum));
  let remainder = totalCents - base.reduce((acc, part) => acc + part, 0);
  const remainders = weights.map((weight, index) => ({
    index,
    fractional: (totalCents * weight) % weightSum,
  }));
  remainders.sort((a, b) => b.fractional - a.fractional);
  for (const item of remainders) {
    if (remainder <= 0) {
      break;
    }
    const target = base[item.index];
    if (target !== undefined) {
      base[item.index] = target + 1;
      remainder -= 1;
    }
  }
  return base;
}
