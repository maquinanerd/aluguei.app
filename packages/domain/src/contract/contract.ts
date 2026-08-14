import { createHash } from 'node:crypto';
import { DomainError } from '../errors.js';

export const CONTRACT_STATUSES = [
  'DRAFT',
  'GENERATED',
  'SENT_FOR_SIGNATURE',
  'PARTIALLY_SIGNED',
  'SIGNED',
  'VOID',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ContractTransitionContext {
  hasContentAndHash: boolean;
  hasEnvelope: boolean;
  allPartiesSigned: boolean;
}

const TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  DRAFT: ['GENERATED'],
  GENERATED: ['SENT_FOR_SIGNATURE', 'VOID'],
  SENT_FOR_SIGNATURE: ['PARTIALLY_SIGNED', 'VOID'],
  PARTIALLY_SIGNED: ['SIGNED', 'VOID'],
  SIGNED: [],
  VOID: [],
};

export function isContractStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionContract(
  from: ContractStatus,
  to: ContractStatus,
  ctx?: ContractTransitionContext,
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  if (!TRANSITIONS[from].includes(to)) {
    return false;
  }
  if (to === 'GENERATED' && ctx) {
    return ctx.hasContentAndHash;
  }
  if (to === 'SENT_FOR_SIGNATURE' && ctx) {
    return ctx.hasEnvelope;
  }
  if (to === 'SIGNED' && ctx) {
    return ctx.allPartiesSigned;
  }
  return true;
}

export function transitionContract(
  from: ContractStatus,
  to: ContractStatus,
  ctx?: ContractTransitionContext,
): ContractStatus {
  if (!canTransitionContract(from, to, ctx)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}

/** Hash sha256 hex do documento final (confere o conteúdo gerado). */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
