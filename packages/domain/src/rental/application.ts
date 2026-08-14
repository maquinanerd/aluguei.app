import { DomainError } from '../errors.js';

export const RENTAL_APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'SCREENING',
  'MANUAL_REVIEW',
  'APPROVED',
  'REJECTED',
  'CONTRACTING',
] as const;
export type RentalApplicationStatus = (typeof RENTAL_APPLICATION_STATUSES)[number];

export interface ApplicationTransitionContext {
  hasConsent: boolean;
  hasRequiredData: boolean;
  hasDecisionReason: boolean;
  hasContract: boolean;
}

const TRANSITIONS: Record<RentalApplicationStatus, readonly RentalApplicationStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['SCREENING'],
  SCREENING: ['APPROVED', 'REJECTED', 'MANUAL_REVIEW'],
  MANUAL_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['CONTRACTING'],
  REJECTED: [],
  CONTRACTING: [],
};

export function isRentalApplicationStatus(value: string): value is RentalApplicationStatus {
  return (RENTAL_APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionRentalApplication(
  from: RentalApplicationStatus,
  to: RentalApplicationStatus,
  ctx?: ApplicationTransitionContext,
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  if (!TRANSITIONS[from].includes(to)) {
    return false;
  }
  if (to === 'SUBMITTED' && ctx) {
    return ctx.hasConsent && ctx.hasRequiredData;
  }
  if (to === 'MANUAL_REVIEW' && ctx) {
    return true; // decisão automática inconclusiva
  }
  if ((to === 'APPROVED' || to === 'REJECTED') && ctx && from === 'MANUAL_REVIEW') {
    return ctx.hasDecisionReason;
  }
  if (to === 'CONTRACTING' && ctx) {
    return ctx.hasContract;
  }
  return true;
}

export function applicationTransitionIssues(
  from: RentalApplicationStatus,
  to: RentalApplicationStatus,
  ctx: ApplicationTransitionContext,
): string[] {
  const issues: string[] = [];
  if (!TRANSITIONS[from].includes(to) && from !== to) {
    issues.push(`Transição inválida: ${from} → ${to}`);
    return issues;
  }
  if (to === 'SUBMITTED') {
    if (!ctx.hasConsent) {
      issues.push('Consentimento LGPD ausente');
    }
    if (!ctx.hasRequiredData) {
      issues.push('Dados obrigatórios incompletos');
    }
  }
  if (
    (to === 'APPROVED' || to === 'REJECTED') &&
    from === 'MANUAL_REVIEW' &&
    !ctx.hasDecisionReason
  ) {
    issues.push('Decisão manual exige motivo');
  }
  if (to === 'CONTRACTING' && !ctx.hasContract) {
    issues.push('Contrato não criado');
  }
  return issues;
}

export function transitionRentalApplication(
  from: RentalApplicationStatus,
  to: RentalApplicationStatus,
  ctx?: ApplicationTransitionContext,
): RentalApplicationStatus {
  if (!canTransitionRentalApplication(from, to, ctx)) {
    const issues = ctx
      ? applicationTransitionIssues(from, to, ctx)
      : [`Transição inválida: ${from} → ${to}`];
    throw new DomainError(
      'INVALID_TRANSITION',
      `Transição inválida: ${from} → ${to} (${issues.join('; ')})`,
      {
        from,
        to,
        issues,
      },
    );
  }
  return to;
}
