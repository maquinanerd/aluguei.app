import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  assertLateChargeTerms,
  calculateChargeBreakdown,
  chargeDueDate,
  DEFAULT_INTEREST_MONTHLY_BPS,
  DEFAULT_LATE_FEE_BPS,
  isChargeOverdue,
} from './chargeCalc.js';

/**
 * Multa e juros de mora (auditoria 2026-09-10, P1-07). Antes: juros de 1% AO DIA, sem teto, com
 * multa e juros constantes — 100 dias de atraso custavam 100% do aluguel. Agora: juros de 1% ao
 * mês pro rata die e multa de 2% como padrão, configuráveis por locação dentro de limites, sobre o
 * valor em atraso (aluguel e encargos), contando a partir do vencimento, com carência até o dia
 * útil seguinte quando o vencimento cai em fim de semana ou feriado.
 */
describe('multa e juros de mora', () => {
  it('padrões: multa de 2% e juros de 1% ao mês', () => {
    expect(DEFAULT_LATE_FEE_BPS).toBe(200);
    expect(DEFAULT_INTEREST_MONTHLY_BPS).toBe(100);
  });

  it('100 dias de atraso custam juros de cerca de 3,33%, não 100% do aluguel', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      dueDate: '2026-03-10',
      paidOn: '2026-06-18',
    });
    expect(breakdown.lateFeeCents).toBe(2_000);
    expect(breakdown.interestCents).toBe(3_333);
    expect(breakdown.amountCents).toBe(105_333);
  });

  it('encargos incidem sobre aluguel e condomínio da cobrança', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      condoFeeCents: 30_000,
      dueDate: '2026-10-10',
      paidOn: '2026-10-14',
    });
    // Base 130.000; multa 2% = 2.600; juros 1% a.m. × 4 dias / 30 = 173,33 → 173.
    expect(breakdown).toMatchObject({
      lateFeeCents: 2_600,
      interestCents: 173,
      amountCents: 132_773,
    });
  });

  it('vencimento no sábado, com domingo e feriado na segunda: pagar na terça não tem encargo', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      condoFeeCents: 30_000,
      dueDate: '2026-10-10',
      paidOn: '2026-10-13',
    });
    expect(breakdown).toMatchObject({ lateFeeCents: 0, interestCents: 0, amountCents: 130_000 });
  });

  it('taxas configuradas na locação: multa de 10% e juros de 0,5% ao mês', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      lateFeeBps: 1_000,
      interestMonthlyBps: 50,
      dueDate: '2026-08-10',
      paidOn: '2026-08-25',
    });
    expect(breakdown).toMatchObject({
      lateFeeCents: 10_000,
      interestCents: 250,
      amountCents: 110_250,
    });
  });

  it('pagar até o vencimento não tem encargo e o desconto continua abatendo', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      discountCents: 5_000,
      dueDate: '2026-08-10',
      paidOn: '2026-08-10',
    });
    expect(breakdown).toMatchObject({ lateFeeCents: 0, interestCents: 0, amountCents: 95_000 });
  });

  it('limites: multa até 10% e juros até 1% ao mês, nunca negativos', () => {
    expect(() => {
      assertLateChargeTerms({ lateFeeBps: 1_000, interestMonthlyBps: 100 });
    }).not.toThrow();
    for (const terms of [
      { lateFeeBps: 1_001, interestMonthlyBps: 100 },
      { lateFeeBps: 200, interestMonthlyBps: 101 },
      { lateFeeBps: -1, interestMonthlyBps: 100 },
      { lateFeeBps: 200, interestMonthlyBps: -1 },
      { lateFeeBps: 2.5, interestMonthlyBps: 100 },
    ]) {
      expect(() => {
        assertLateChargeTerms(terms);
      }).toThrow(DomainError);
    }
  });
});

describe('vencimento da cobrança', () => {
  it('dia de vencimento da locação dentro do mês do período', () => {
    expect(chargeDueDate('2026-10-01', 10)).toBe('2026-10-10');
    expect(chargeDueDate('2026-02-01', 28)).toBe('2026-02-28');
  });

  it('dia de vencimento fora de 1 a 28 é recusado', () => {
    expect(() => chargeDueDate('2026-02-01', 29)).toThrow(DomainError);
    expect(() => chargeDueDate('2026-02-01', 0)).toThrow(DomainError);
  });

  it('só está vencida depois do dia útil seguinte ao vencimento', () => {
    expect(isChargeOverdue('2026-10-10', '2026-10-13')).toBe(false);
    expect(isChargeOverdue('2026-10-10', '2026-10-14')).toBe(true);
    expect(isChargeOverdue('2026-08-10', '2026-08-10')).toBe(false);
    expect(isChargeOverdue('2026-08-10', '2026-08-11')).toBe(true);
  });
});
