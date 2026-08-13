import { DomainError } from '../errors.js';

export const CHANNEL_TYPES = ['fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_PUBLICATION_STATUSES = [
  'PENDING',
  'PUBLISHING',
  'PUBLISHED',
  'UPDATE_PENDING',
  'REMOVING',
  'REMOVED',
  'FAILED',
  'RECONCILING',
] as const;
export type ChannelPublicationStatus = (typeof CHANNEL_PUBLICATION_STATUSES)[number];

export const CHANNEL_JOB_TYPES = [
  'PUBLISH',
  'UPDATE',
  'REMOVE',
  'RECONCILE',
  'IMPORT_LEADS',
] as const;
export type ChannelJobType = (typeof CHANNEL_JOB_TYPES)[number];

export const CHANNEL_JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'] as const;
export type ChannelJobStatus = (typeof CHANNEL_JOB_STATUSES)[number];

/** Transições válidas do estado de publicação por canal. */
const TRANSITIONS: Record<ChannelPublicationStatus, readonly ChannelPublicationStatus[]> = {
  PENDING: ['PUBLISHING', 'FAILED', 'REMOVED'],
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: ['UPDATE_PENDING', 'REMOVING', 'RECONCILING'],
  UPDATE_PENDING: ['PUBLISHING', 'FAILED'],
  REMOVING: ['REMOVED', 'FAILED'],
  REMOVED: ['PENDING'],
  RECONCILING: ['PUBLISHED', 'REMOVED', 'FAILED'],
  FAILED: ['PENDING', 'REMOVING'],
};

export function isChannelType(value: string): value is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(value);
}

export function isChannelPublicationStatus(value: string): value is ChannelPublicationStatus {
  return (CHANNEL_PUBLICATION_STATUSES as readonly string[]).includes(value);
}

export function isChannelJobType(value: string): value is ChannelJobType {
  return (CHANNEL_JOB_TYPES as readonly string[]).includes(value);
}

export function isChannelJobStatus(value: string): value is ChannelJobStatus {
  return (CHANNEL_JOB_STATUSES as readonly string[]).includes(value);
}

export function canTransitionChannelPublication(
  from: ChannelPublicationStatus,
  to: ChannelPublicationStatus,
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  return TRANSITIONS[from].includes(to);
}

/** Valida e aplica transição; lança DomainError(INVALID_TRANSITION) se inválida. */
export function transitionChannelPublication(
  from: ChannelPublicationStatus,
  to: ChannelPublicationStatus,
): ChannelPublicationStatus {
  if (!canTransitionChannelPublication(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}
