/**
 * Entrada numérica em pt-BR (P0-07, auditoria 2026-09-10).
 *
 * "3.500" digitado no aluguel era gravado como R$ 3,50: o parsing anterior,
 * `parseFloat(v.replace(',', '.'))`, lia o ponto de milhar como separador
 * decimal. Regra única do painel: o ponto separa milhares, a vírgula separa as
 * casas decimais e o resultado é um inteiro na menor unidade (centavos, no caso
 * do dinheiro) — nunca ponto flutuante. Texto que só faria sentido em outro
 * formato ("3.50", "1234.56") é recusado com orientação, nunca adivinhado: um
 * valor digitado errado não pode virar um valor gravado diferente.
 */

/** Maior valor de uma coluna `integer` (int4), onde os centavos são gravados. */
export const MONEY_INPUT_MAX_CENTS = 2_147_483_647;

export type NumberInputErrorCode =
  | 'INVALID'
  | 'AMBIGUOUS'
  | 'TOO_MANY_DECIMALS'
  | 'NEGATIVE'
  | 'TOO_LARGE';

export interface NumberInputError {
  ok: false;
  code: NumberInputErrorCode;
  message: string;
}

export type DecimalParseResult = { ok: true; units: number | null } | NumberInputError;

export type MoneyParseResult = { ok: true; cents: number | null } | NumberInputError;

type UnitsResult = { ok: true; units: number | null } | { ok: false; code: NumberInputErrorCode };

const PLAIN_DIGITS = /^\d+$/;
/** Milhares agrupados: "3.500", "1.234.567" (o primeiro grupo não começa com zero). */
const GROUPED_THOUSANDS = /^[1-9]\d{0,2}(?:\.\d{3})+$/;
/** Um ponto seguido de casas que não formam milhar: "3.5", "1234.56", "0.500". */
const DOT_AS_DECIMAL = /^\d+\.\d+$/;
/** Acima de 15 algarismos o `Number` deixa de representar inteiros com exatidão. */
const MAX_SAFE_DIGITS = 15;
/** Espaço não separável (U+00A0), que `Intl.NumberFormat` põe depois de "R$". */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

function normalizeSpaces(raw: string): string {
  return raw.split(NO_BREAK_SPACE).join(' ').trim();
}

/** Núcleo comum: texto pt-BR → inteiro em unidades de 10^-fractionDigits. */
function parseUnits(text: string, fractionDigits: number): UnitsResult {
  if (text === '') {
    return { ok: true, units: null };
  }
  if (text.startsWith('-')) {
    return { ok: false, code: 'NEGATIVE' };
  }
  if (!/^[\d.,]+$/.test(text)) {
    return { ok: false, code: 'INVALID' };
  }
  const parts = text.split(',');
  if (parts.length > 2) {
    return { ok: false, code: 'INVALID' };
  }
  let integerPart = parts[0] ?? '';
  const fraction = parts[1] ?? '';
  if (parts.length === 2) {
    if (integerPart === '' && fraction === '') {
      return { ok: false, code: 'INVALID' };
    }
    if (fraction !== '' && !PLAIN_DIGITS.test(fraction)) {
      return { ok: false, code: 'INVALID' };
    }
    if (fraction.length > fractionDigits) {
      return { ok: false, code: 'TOO_MANY_DECIMALS' };
    }
    if (
      integerPart !== '' &&
      !PLAIN_DIGITS.test(integerPart) &&
      !GROUPED_THOUSANDS.test(integerPart)
    ) {
      return { ok: false, code: 'INVALID' };
    }
  } else if (!PLAIN_DIGITS.test(text) && !GROUPED_THOUSANDS.test(text)) {
    return { ok: false, code: DOT_AS_DECIMAL.test(text) ? 'AMBIGUOUS' : 'INVALID' };
  } else {
    integerPart = text;
  }
  const digits = integerPart.replace(/\./g, '').replace(/^0+(?=\d)/, '') || '0';
  if (digits.length > MAX_SAFE_DIGITS - fractionDigits) {
    return { ok: false, code: 'TOO_LARGE' };
  }
  const fractionUnits = fractionDigits === 0 ? 0 : Number(fraction.padEnd(fractionDigits, '0'));
  return { ok: true, units: Number(digits) * 10 ** fractionDigits + fractionUnits };
}

const MONEY_MESSAGES: Record<Exclude<NumberInputErrorCode, 'TOO_LARGE'>, string> = {
  INVALID: 'Valor inválido. Use o formato 3.500,00.',
  AMBIGUOUS: 'Use vírgula para os centavos, como em 3.500,50 — o ponto separa os milhares.',
  TOO_MANY_DECIMALS: 'Use no máximo 2 casas para os centavos.',
  NEGATIVE: 'O valor não pode ser negativo.',
};

/**
 * Dinheiro digitado → centavos inteiros. Aceita o prefixo "R$". Campo vazio é
 * `{ ok: true, cents: null }`.
 */
export function parseMoneyInput(
  raw: string,
  options: { maxCents?: number } = {},
): MoneyParseResult {
  const maxCents = options.maxCents ?? MONEY_INPUT_MAX_CENTS;
  const result = parseUnits(normalizeSpaces(raw).replace(/^R\$\s*/, ''), 2);
  if (result.ok && (result.units === null || result.units <= maxCents)) {
    return { ok: true, cents: result.units };
  }
  if (!result.ok && result.code !== 'TOO_LARGE') {
    return { ok: false, code: result.code, message: MONEY_MESSAGES[result.code] };
  }
  return {
    ok: false,
    code: 'TOO_LARGE',
    message: `O valor máximo é R$ ${formatCentsForInput(maxCents)}.`,
  };
}

function decimalMessage(code: NumberInputErrorCode, fractionDigits: number): string {
  switch (code) {
    case 'AMBIGUOUS':
      return 'Use vírgula para as casas decimais, como em 85,5 — o ponto separa os milhares.';
    case 'TOO_MANY_DECIMALS':
      return fractionDigits === 0
        ? 'Informe um número inteiro, sem casas decimais.'
        : `Use no máximo ${String(fractionDigits)} casas decimais.`;
    case 'NEGATIVE':
      return 'O número não pode ser negativo.';
    case 'TOO_LARGE':
      return 'Número grande demais.';
    case 'INVALID':
      return fractionDigits === 0
        ? 'Número inválido. Use só algarismos, como em 12.'
        : 'Número inválido. Use o formato 1.234,5.';
  }
}

/**
 * Número pt-BR digitado (área, contagens) → inteiro em unidades de
 * 10^-fractionDigits ("1.200" com 2 casas → 120000). Campo vazio é `units: null`.
 */
export function parseDecimalInput(
  raw: string,
  options: { fractionDigits: number },
): DecimalParseResult {
  const result = parseUnits(normalizeSpaces(raw), options.fractionDigits);
  if (result.ok) {
    return result;
  }
  return {
    ok: false,
    code: result.code,
    message: decimalMessage(result.code, options.fractionDigits),
  };
}

/** Centavos inteiros → texto do campo ("3.500,00"), sem símbolo da moeda. */
export function formatCentsForInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`centavos devem ser um inteiro não negativo: ${String(cents)}`);
  }
  const reais = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${reais},${String(cents % 100).padStart(2, '0')}`;
}
