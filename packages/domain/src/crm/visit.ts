import { DomainError } from '../errors.js';

/**
 * Ciclo de vida da visita (auditoria 2026-09-10, P2-02: a visita nascia SCHEDULED e nunca mudava).
 * Reagendar mantém a visita no fluxo: volta (ou fica) em SCHEDULED com a nova data.
 */
export const VISIT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

const TRANSITIONS: Record<VisitStatus, readonly VisitStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW'],
  // Reagendar uma visita confirmada tira a confirmação: o interessado confirma a nova data.
  CONFIRMED: ['SCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW'],
  DONE: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Status que ainda podem ser reagendados. */
const RESCHEDULABLE: readonly VisitStatus[] = ['SCHEDULED', 'CONFIRMED'];

export interface VisitTransitionContext {
  reason?: string | null;
}

export function isVisitStatus(value: string): value is VisitStatus {
  return (VISIT_STATUSES as readonly string[]).includes(value);
}

/** Visita que ainda aceita nova data (as finais não). */
export function visitReschedulable(status: VisitStatus): boolean {
  return RESCHEDULABLE.includes(status);
}

export function canTransitionVisit(
  from: VisitStatus,
  to: VisitStatus,
  ctx: VisitTransitionContext = {},
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  if (!TRANSITIONS[from].includes(to)) {
    return false;
  }
  if (to === 'CANCELLED' && (ctx.reason ?? '').trim() === '') {
    return false; // cancelamento exige motivo
  }
  return true;
}

export function transitionVisit(
  from: VisitStatus,
  to: VisitStatus,
  ctx: VisitTransitionContext = {},
): VisitStatus {
  if (!canTransitionVisit(from, to, ctx)) {
    const why =
      to === 'CANCELLED' && TRANSITIONS[from].includes(to)
        ? 'cancelamento exige motivo'
        : `transição inválida: ${from} → ${to}`;
    throw new DomainError('INVALID_TRANSITION', `Visita: ${why}`, { from, to });
  }
  return to;
}
