import { DomainError } from '../errors.js';

export const CHARGE_STATUSES = [
  'SCHEDULED',
  'OPEN',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED',
] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

const TRANSITIONS: Record<ChargeStatus, readonly ChargeStatus[]> = {
  SCHEDULED: ['OPEN', 'CANCELLED'],
  OPEN: ['PAID', 'OVERDUE', 'CANCELLED'],
  OVERDUE: ['PAID', 'OPEN'],
  PAID: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export function isChargeStatus(value: string): value is ChargeStatus {
  return (CHARGE_STATUSES as readonly string[]).includes(value);
}

export function canTransitionCharge(from: ChargeStatus, to: ChargeStatus): boolean {
  if (from === to) {
    return true; // idempotente
  }
  return TRANSITIONS[from].includes(to);
}

export function transitionCharge(from: ChargeStatus, to: ChargeStatus): ChargeStatus {
  if (!canTransitionCharge(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}

export const LEASE_STATUSES = ['PENDING', 'ACTIVE', 'DELINQUENT', 'TERMINATING', 'ENDED'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

const LEASE_TRANSITIONS: Record<LeaseStatus, readonly LeaseStatus[]> = {
  PENDING: ['ACTIVE', 'TERMINATING'],
  ACTIVE: ['DELINQUENT', 'TERMINATING'],
  DELINQUENT: ['ACTIVE', 'TERMINATING'],
  TERMINATING: ['ENDED'],
  ENDED: [],
};

export function isLeaseStatus(value: string): value is LeaseStatus {
  return (LEASE_STATUSES as readonly string[]).includes(value);
}

export function canTransitionLease(from: LeaseStatus, to: LeaseStatus): boolean {
  if (from === to) {
    return true;
  }
  return LEASE_TRANSITIONS[from].includes(to);
}

export function transitionLease(from: LeaseStatus, to: LeaseStatus): LeaseStatus {
  if (!canTransitionLease(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}

export const PAYMENT_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['CONFIRMED', 'FAILED'],
  CONFIRMED: ['REFUNDED'],
  FAILED: [],
  REFUNDED: [],
};

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) {
    return true;
  }
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function transitionPayment(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  if (!canTransitionPayment(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}
