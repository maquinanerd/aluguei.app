import { describe, expect, it } from 'vitest';
import {
  formatCentsForInput,
  MONEY_INPUT_MAX_CENTS,
  parseDecimalInput,
  parseMoneyInput,
} from './money';

/**
 * P0-07 (auditoria 2026-09-10): "3.500" digitado no aluguel era gravado como
 * R$ 3,50 — `parseFloat(v.replace(',', '.'))` lê o ponto de milhar como
 * separador decimal. Regra pt-BR: ponto separa milhar, vírgula separa
 * centavos, o valor sai em centavos inteiros e a entrada que só faria sentido
 * em outro formato é recusada com mensagem — nunca adivinhada.
 */
describe('parseMoneyInput — pt-BR para centavos inteiros', () => {
  it.each([
    ['3.500', 350_000],
    ['3.500,00', 350_000],
    ['3.500,50', 350_050],
    ['3.500,5', 350_050],
    ['3500', 350_000],
    ['3500,99', 350_099],
    ['0,50', 50],
    ['0,05', 5],
    [',50', 50],
    ['3.500,', 350_000],
    ['1.234.567,89', 123_456_789],
    ['R$ 3.500,00', 350_000],
    ['R$3.500', 350_000],
    ['R$ 3.500,00', 350_000],
    ['  3.500  ', 350_000],
    ['0', 0],
    ['21.474.836,47', MONEY_INPUT_MAX_CENTS],
  ])('"%s" → %i centavos', (input, cents) => {
    expect(parseMoneyInput(input)).toEqual({ ok: true, cents });
  });

  it.each(['', '   ', 'R$', 'R$ '])('"%s" é campo vazio: sem valor e sem erro', (input) => {
    expect(parseMoneyInput(input)).toEqual({ ok: true, cents: null });
  });

  it.each(['3.5', '3.50', '35.00', '1234.56', '3500.00', '0.500'])(
    '"%s" usa ponto como decimal: ambíguo, recusado com orientação',
    (input) => {
      const result = parseMoneyInput(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('AMBIGUOUS');
        expect(result.message).toContain('vírgula');
      }
    },
  );

  it.each([
    ['3,555', 'TOO_MANY_DECIMALS'],
    ['3.500,505', 'TOO_MANY_DECIMALS'],
    ['-3.500', 'NEGATIVE'],
    ['- 10', 'NEGATIVE'],
    ['abc', 'INVALID'],
    [',', 'INVALID'],
    ['3,5,0', 'INVALID'],
    ['3,50.0', 'INVALID'],
    ['3.500.5', 'INVALID'],
    ['12.34,56', 'INVALID'],
    ['1e3', 'INVALID'],
    ['3 500', 'INVALID'],
    ['3.500,00 reais', 'INVALID'],
    ['21.474.836,48', 'TOO_LARGE'],
    ['99999999999999999999', 'TOO_LARGE'],
  ])('"%s" é recusado com código %s', (input, code) => {
    const result = parseMoneyInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('respeita um limite menor informado pelo campo', () => {
    expect(parseMoneyInput('100,00', { maxCents: 9_999 })).toMatchObject({
      ok: false,
      code: 'TOO_LARGE',
    });
    expect(parseMoneyInput('99,99', { maxCents: 9_999 })).toEqual({ ok: true, cents: 9_999 });
  });
});

/**
 * Mesmo defeito fora do dinheiro: a área do cadastro de imóvel usava o mesmo
 * `parseFloat(v.replace(',', '.'))` — "1.200" m² virava 1,2 m². Números pt-BR
 * seguem a mesma regra; o resultado sai em unidades inteiras da menor casa.
 */
describe('parseDecimalInput — números pt-BR (área, contagens)', () => {
  it.each([
    ['1.200', 2, 120_000],
    ['85,5', 2, 8_550],
    ['85,55', 2, 8_555],
    ['1.234,5', 2, 123_450],
    ['3', 0, 3],
    ['12', 0, 12],
  ])('"%s" com %i casas decimais → %i unidades', (input, fractionDigits, units) => {
    expect(parseDecimalInput(input, { fractionDigits })).toEqual({ ok: true, units });
  });

  it('campo vazio é ausência de valor', () => {
    expect(parseDecimalInput('   ', { fractionDigits: 2 })).toEqual({ ok: true, units: null });
  });

  it.each([
    ['85.5', 2, 'AMBIGUOUS'],
    ['2,5', 0, 'TOO_MANY_DECIMALS'],
    ['85,555', 2, 'TOO_MANY_DECIMALS'],
    ['R$ 10', 2, 'INVALID'],
    ['-1', 0, 'NEGATIVE'],
  ])('"%s" com %i casas decimais é recusado com código %s', (input, fractionDigits, code) => {
    const result = parseDecimalInput(input, { fractionDigits });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});

describe('formatCentsForInput — centavos para o texto do campo', () => {
  it.each([
    [350_000, '3.500,00'],
    [350_050, '3.500,50'],
    [5, '0,05'],
    [0, '0,00'],
    [123_456_789, '1.234.567,89'],
    [MONEY_INPUT_MAX_CENTS, '21.474.836,47'],
  ])('%i → "%s"', (cents, text) => {
    expect(formatCentsForInput(cents)).toBe(text);
  });

  it('ida e volta preserva o valor exato', () => {
    for (const cents of [1, 99, 100, 101, 99_999, 100_000, 350_050, 1_000_000_00]) {
      expect(parseMoneyInput(formatCentsForInput(cents))).toEqual({ ok: true, cents });
    }
  });

  it('recusa centavos negativos ou fracionários', () => {
    expect(() => formatCentsForInput(-1)).toThrow(RangeError);
    expect(() => formatCentsForInput(1.5)).toThrow(RangeError);
  });
});
