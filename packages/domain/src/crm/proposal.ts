import { DomainError } from '../errors.js';

/**
 * Ciclo de vida da proposta (auditoria 2026-09-10, P2-02: a proposta nascia DRAFT e nunca saía
 * dali, e `validUntil` não tinha efeito nenhum).
 */
export const PROPOSAL_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};

export interface ProposalTransitionContext {
  /** Data civil AAAA-MM-DD do último dia de validade — obrigatória para enviar. */
  validUntil?: string | null;
  /** Motivo — obrigatório para recusar. */
  reason?: string | null;
}

export function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

/** Só o rascunho aceita mudança de valor e de condições. */
export function proposalEditable(status: ProposalStatus): boolean {
  return status === 'DRAFT';
}

export function canTransitionProposal(
  from: ProposalStatus,
  to: ProposalStatus,
  ctx: ProposalTransitionContext = {},
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  if (!TRANSITIONS[from].includes(to)) {
    return false;
  }
  if (to === 'SENT' && (ctx.validUntil ?? '').trim() === '') {
    return false; // proposta enviada sem validade nunca expira
  }
  if (to === 'REJECTED' && (ctx.reason ?? '').trim() === '') {
    return false; // recusa exige motivo
  }
  return true;
}

export function transitionProposal(
  from: ProposalStatus,
  to: ProposalStatus,
  ctx: ProposalTransitionContext = {},
): ProposalStatus {
  if (!canTransitionProposal(from, to, ctx)) {
    let why = `transição inválida: ${from} → ${to}`;
    if (TRANSITIONS[from].includes(to)) {
      if (to === 'SENT') {
        why = 'envio exige data de validade';
      }
      if (to === 'REJECTED') {
        why = 'recusa exige motivo';
      }
    }
    throw new DomainError('INVALID_TRANSITION', `Proposta: ${why}`, { from, to });
  }
  return to;
}

/**
 * Proposta vencida: a validade é o último dia em que ela vale, então só expira a partir do dia
 * seguinte. Comparação de data civil como texto (AAAA-MM-DD ordena), sem `new Date` e sem fuso.
 */
export function isProposalExpired(validUntil: string | null, today: string): boolean {
  if (validUntil === null || validUntil === '') {
    return false;
  }
  return today > validUntil;
}
