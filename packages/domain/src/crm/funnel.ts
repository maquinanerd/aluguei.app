import { DomainError } from '../errors.js';

export const FUNNEL_STATUSES = [
  'NEW',
  'QUALIFYING',
  'QUALIFIED',
  'VISIT',
  'PROPOSAL',
  'APPLICATION',
  'WON',
  'LOST',
] as const;

export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];

/** Transições válidas do funil (status de negócio em texto, validado no domínio). */
const TRANSITIONS: Record<FunnelStatus, readonly FunnelStatus[]> = {
  NEW: ['QUALIFYING', 'LOST'],
  QUALIFYING: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['VISIT', 'LOST'],
  VISIT: ['PROPOSAL', 'QUALIFIED', 'LOST'],
  PROPOSAL: ['APPLICATION', 'LOST'],
  APPLICATION: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

export interface FunnelTransitionContext {
  reason?: string | null;
}

export function isFunnelStatus(value: string): value is FunnelStatus {
  return (FUNNEL_STATUSES as readonly string[]).includes(value);
}

export function canTransition(
  from: FunnelStatus,
  to: FunnelStatus,
  ctx: FunnelTransitionContext = {},
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  if (!TRANSITIONS[from].includes(to)) {
    return false;
  }
  if (to === 'LOST' && !ctx.reason) {
    return false; // LOST exige motivo
  }
  return true;
}

/** Valida e aplica transição; lança DomainError(INVALID_TRANSITION) se inválida. */
export function transitionLead(
  from: FunnelStatus,
  to: FunnelStatus,
  ctx: FunnelTransitionContext = {},
): FunnelStatus {
  if (!canTransition(from, to, ctx)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}
