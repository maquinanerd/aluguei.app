import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { add, mulBpsFloor, negate, splitAmount, sub } from './money.js';
import { calculateChargeBreakdown } from './chargeCalc.js';
import { splitPayment } from './split.js';
import {
  canTransitionCharge,
  canTransitionLease,
  canTransitionPayment,
  transitionCharge,
} from './stateMachines.js';

describe('money (centavos)', () => {
  it('opera em centavos inteiros', () => {
    expect(add(1000, 500)).toBe(1500);
    expect(sub(1000, 500)).toBe(500);
    expect(negate(500)).toBe(-500);
    expect(mulBpsFloor(100_000, 1000)).toBe(10_000); // 10% de R$1000
    expect(mulBpsFloor(100_000, 200)).toBe(2_000); // 2%
  });

  it('distribui com maior resto sem sobrar centavo', () => {
    const parts = splitAmount(100_001, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_001);
    expect(parts).toEqual([33_334, 33_334, 33_333]);
  });

  it('lança em overflow', () => {
    expect(() => add(Number.MAX_SAFE_INTEGER, 1)).toThrow(DomainError);
  });
});

describe('chargeCalc', () => {
  it('R$1000 aluguel: multa 2% + juros 1%/dia × 5 dias', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      dueDate: '2026-08-10',
      paidOn: '2026-08-15',
    });
    expect(breakdown.lateFeeCents).toBe(2_000);
    expect(breakdown.interestCents).toBe(5_000);
    expect(breakdown.amountCents).toBe(107_000);
  });

  it('sem atraso não cobra multa/juros', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      dueDate: '2026-08-10',
      paidOn: '2026-08-05',
    });
    expect(breakdown.lateFeeCents).toBe(0);
    expect(breakdown.interestCents).toBe(0);
    expect(breakdown.amountCents).toBe(100_000);
  });

  it('desconto abate', () => {
    const breakdown = calculateChargeBreakdown({
      rentCents: 100_000,
      discountCents: 10_000,
      dueDate: '2026-08-10',
      paidOn: '2026-08-10',
    });
    expect(breakdown.amountCents).toBe(90_000);
  });
});

describe('split determinístico', () => {
  it('R$1000 com comissão 10%: agency 10000c, landlord 90000c', () => {
    const allocations = splitPayment({
      rentCents: 100_000,
      amountCents: 100_000,
      agencyShareBps: 1000,
    });
    const sum = allocations.reduce((acc, a) => acc + a.amountCents, 0);
    expect(sum).toBe(100_000);
    expect(allocations.find((a) => a.role === 'AGENCY')?.amountCents).toBe(10_000);
    expect(allocations.find((a) => a.role === 'LANDLORD')?.amountCents).toBe(90_000);
  });

  it('comissão nunca excede o valor pago', () => {
    const allocations = splitPayment({
      rentCents: 100_000,
      amountCents: 5_000,
      agencyShareBps: 1000,
    });
    expect(allocations.find((a) => a.role === 'AGENCY')?.amountCents).toBe(5_000);
    expect(allocations.find((a) => a.role === 'LANDLORD')?.amountCents).toBe(0);
  });
});

describe('máquinas de estado financeiras', () => {
  it('charge: SCHEDULED→OPEN→PAID→REFUNDED', () => {
    expect(canTransitionCharge('SCHEDULED', 'OPEN')).toBe(true);
    expect(canTransitionCharge('OPEN', 'PAID')).toBe(true);
    expect(canTransitionCharge('PAID', 'REFUNDED')).toBe(true);
    expect(canTransitionCharge('PAID', 'CANCELLED')).toBe(false);
  });

  it('lease: PENDING→ACTIVE→DELINQUENT→ACTIVE→TERMINATING→ENDED', () => {
    expect(canTransitionLease('PENDING', 'ACTIVE')).toBe(true);
    expect(canTransitionLease('ACTIVE', 'DELINQUENT')).toBe(true);
    expect(canTransitionLease('DELINQUENT', 'ACTIVE')).toBe(true);
    expect(canTransitionLease('ACTIVE', 'TERMINATING')).toBe(true);
    expect(canTransitionLease('TERMINATING', 'ENDED')).toBe(true);
  });

  it('payment: PENDING→CONFIRMED→REFUNDED', () => {
    expect(canTransitionPayment('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransitionPayment('CONFIRMED', 'REFUNDED')).toBe(true);
    expect(canTransitionPayment('FAILED', 'CONFIRMED')).toBe(false);
  });

  it('transição inválida lança', () => {
    expect(() => transitionCharge('PAID', 'CANCELLED')).toThrow(DomainError);
  });
});
