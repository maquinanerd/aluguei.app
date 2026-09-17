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

/**
 * Quem conduz a transição (auditoria 2026-09-10, P1-06). Cada destino tem uma
 * origem legítima: a análise começa pelo pedido de screening, o resultado do
 * provider decide a candidatura em análise, a revisão manual é decidida por uma
 * pessoa e a contratação acompanha o contrato.
 */
export type ApplicationTransitionSource =
  /** Usuário autenticado (PATCH /rental-applications/:id/status). */
  | 'MANUAL'
  /** POST /rental-applications/:id/screening. */
  | 'SCREENING_REQUEST'
  /** Worker, com o resultado do provider de crédito. */
  | 'SCREENING_RESULT'
  /** Criação ou cancelamento do contrato. */
  | 'CONTRACT';

/** Origem registrada de uma decisão de crédito (APPROVED/REJECTED). */
export const CREDIT_DECISION_SOURCES = ['MANUAL', 'AUTOMATIC'] as const;
export type CreditDecisionSource = (typeof CREDIT_DECISION_SOURCES)[number];

export interface ApplicationTransitionContext {
  source: ApplicationTransitionSource;
  hasConsent: boolean;
  hasRequiredData: boolean;
  hasDecisionReason: boolean;
  /** Pessoa responsável identificada (decisão manual). */
  hasDecidedBy: boolean;
  /** Existe resultado de screening gravado para a candidatura. */
  hasScreeningResult: boolean;
  /** Existe contrato não cancelado para a candidatura. */
  hasContract: boolean;
}

const TRANSITIONS: Record<RentalApplicationStatus, readonly RentalApplicationStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['SCREENING'],
  SCREENING: ['APPROVED', 'REJECTED', 'MANUAL_REVIEW'],
  MANUAL_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['CONTRACTING'],
  REJECTED: [],
  // Contrato cancelado: a candidatura volta a aguardar contrato.
  CONTRACTING: ['APPROVED'],
};

export function isRentalApplicationStatus(value: string): value is RentalApplicationStatus {
  return (RENTAL_APPLICATION_STATUSES as readonly string[]).includes(value);
}

/** Motivos que impedem a transição (vazio = permitida; mesmo status = idempotente). */
export function applicationTransitionIssues(
  from: RentalApplicationStatus,
  to: RentalApplicationStatus,
  ctx: ApplicationTransitionContext,
): string[] {
  if (from === to) {
    return [];
  }
  if (!TRANSITIONS[from].includes(to)) {
    return [`Transição inválida: ${from} → ${to}`];
  }
  const issues: string[] = [];
  const requireSource = (expected: ApplicationTransitionSource, message: string): void => {
    if (ctx.source !== expected) {
      issues.push(message);
    }
  };

  if (to === 'SUBMITTED') {
    requireSource('MANUAL', 'O envio da candidatura é feito pela equipe');
    if (!ctx.hasConsent) {
      issues.push('Consentimento LGPD ausente');
    }
    if (!ctx.hasRequiredData) {
      issues.push('Dados obrigatórios incompletos');
    }
  } else if (to === 'SCREENING') {
    requireSource('SCREENING_REQUEST', 'A análise de crédito só começa pelo pedido de screening');
    if (!ctx.hasConsent) {
      issues.push('Consentimento LGPD ausente');
    }
  } else if (from === 'SCREENING') {
    requireSource(
      'SCREENING_RESULT',
      'Com screening em andamento, só o resultado da análise decide a candidatura',
    );
    if (!ctx.hasScreeningResult) {
      issues.push('Resultado do screening ausente');
    }
    if (to !== 'MANUAL_REVIEW' && !ctx.hasDecisionReason) {
      issues.push('Decisão de crédito exige motivo');
    }
  } else if (from === 'MANUAL_REVIEW') {
    requireSource('MANUAL', 'A revisão manual é decidida por uma pessoa');
    if (!ctx.hasScreeningResult) {
      issues.push('Resultado do screening ausente');
    }
    if (!ctx.hasDecisionReason) {
      issues.push('Decisão manual exige motivo');
    }
    if (!ctx.hasDecidedBy) {
      issues.push('Decisão manual exige responsável');
    }
  } else if (to === 'CONTRACTING') {
    requireSource('CONTRACT', 'A contratação começa pela criação do contrato');
    if (!ctx.hasContract) {
      issues.push('Contrato não criado');
    }
  } else if (from === 'CONTRACTING') {
    requireSource('CONTRACT', 'A candidatura só volta a aprovada pelo cancelamento do contrato');
    if (ctx.hasContract) {
      issues.push('Candidatura com contrato ativo');
    }
  }
  return issues;
}

export function canTransitionRentalApplication(
  from: RentalApplicationStatus,
  to: RentalApplicationStatus,
  ctx: ApplicationTransitionContext,
): boolean {
  return applicationTransitionIssues(from, to, ctx).length === 0;
}

export function transitionRentalApplication(
  from: RentalApplicationStatus,
  to: RentalApplicationStatus,
  ctx: ApplicationTransitionContext,
): RentalApplicationStatus {
  const issues = applicationTransitionIssues(from, to, ctx);
  if (issues.length > 0) {
    const detail = TRANSITIONS[from].includes(to) ? ` (${issues.join('; ')})` : '';
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}${detail}`, {
      from,
      to,
      issues,
    });
  }
  return to;
}
