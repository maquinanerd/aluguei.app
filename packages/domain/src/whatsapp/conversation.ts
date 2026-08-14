import { DomainError } from '../errors.js';

export const CONVERSATION_STATUSES = ['OPEN', 'ACTIVE', 'NEEDS_HUMAN', 'CLOSED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

const TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  OPEN: ['ACTIVE', 'NEEDS_HUMAN', 'CLOSED'],
  ACTIVE: ['NEEDS_HUMAN', 'CLOSED'],
  NEEDS_HUMAN: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export function isConversationStatus(value: string): value is ConversationStatus {
  return (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionConversation(
  from: ConversationStatus,
  to: ConversationStatus,
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  return TRANSITIONS[from].includes(to);
}

export function transitionConversation(
  from: ConversationStatus,
  to: ConversationStatus,
): ConversationStatus {
  if (!canTransitionConversation(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}
