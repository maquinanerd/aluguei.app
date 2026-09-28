import { DomainError } from '../errors.js';

/**
 * Teto de um valor em centavos digitado ou calculado para uma linha: R$ 1.000.000,00. As colunas
 * `*_cents` por linha são `integer` (int4, até R$ 21.474.836,47) e a cobrança soma aluguel,
 * condomínio e impostos com multa e juros; com cada parcela no teto, a soma fica muito abaixo do
 * int4. O contrato da API (`MAX_AMOUNT_CENTS` em @aluguei/contracts) e o campo de dinheiro do
 * painel usam o mesmo número (testes em tests/integration e apps/web).
 */
export const MAX_AMOUNT_CENTS = 100_000_000;

/**
 * Teto dos valores de **venda** (ADR-094 revisado na Onda 5): R$ 20.000.000,00.
 *
 * O teto de R$ 1.000.000,00 foi calibrado para aluguel, encargo e cobrança,
 * onde um valor maior é quase sempre dígito a mais. Preço de imóvel é outra
 * escala: um apartamento de R$ 1,4 milhão é comum, e recusá-lo tornaria a
 * frente de venda inutilizável. Continua havendo teto — acima dele é erro de
 * digitação, e a coluna `integer` do banco estoura em R$ 21.474.836,47, o que
 * viraria 500 em vez de 400.
 */
export const MAX_SALE_AMOUNT_CENTS = 2_000_000_000;

/** Valor dentro do teto, ou erro de entrada (400) com o campo e o teto. */
export function assertAmountWithinCeiling(cents: number, field: string): void {
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) {
    throw new DomainError('INVALID_INPUT', 'Valor acima do máximo de R$ 1.000.000,00', {
      field,
      maxCents: MAX_AMOUNT_CENTS,
    });
  }
}

/** Mesma regra, na escala de venda. */
export function assertSaleAmountWithinCeiling(cents: number, field: string): void {
  if (!Number.isSafeInteger(cents) || cents > MAX_SALE_AMOUNT_CENTS) {
    throw new DomainError('INVALID_INPUT', 'Valor acima do máximo de R$ 20.000.000,00', {
      field,
      maxCents: MAX_SALE_AMOUNT_CENTS,
    });
  }
}

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
