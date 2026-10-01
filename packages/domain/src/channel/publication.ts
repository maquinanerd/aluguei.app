import { DomainError } from '../errors.js';

/**
 * Canais de distribuição. `grupoolx` é o feed VRSync do Grupo OLX (ADR-107): um arquivo só para ZAP,
 * Viva Real e OLX, conforme o plano da imobiliária. `canalpro`, `vivareal` e `zap` continuam no
 * vocabulário só para não invalidar linha antiga (substituídos por `grupoolx`); `olx` fica
 * reservado para a API própria da OLX, que é outra integração.
 */
export const CHANNEL_TYPES = [
  'fake',
  'canalpro',
  'vivareal',
  'zap',
  'olx',
  'imovelweb',
  'grupoolx',
] as const;
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
  // Modo FEED (ADR-107): ciclo próprio em `feed.ts`. Entrar no XML não é estar publicado.
  'BLOCKED',
  'ELIGIBLE',
  'AWAITING_IMPORT',
  'IMPORTED',
  'IMPORTED_WITH_WARNINGS',
  'IMPORT_ERROR',
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

/**
 * Transições válidas do estado de publicação por canal no modo PUSH. Os estados do modo FEED não
 * entram aqui: o ciclo deles é calculado por `nextFeedStatus` (`feed.ts`).
 */
const TRANSITIONS: Record<ChannelPublicationStatus, readonly ChannelPublicationStatus[]> = {
  PENDING: ['PUBLISHING', 'FAILED', 'REMOVED'],
  PUBLISHING: ['PUBLISHED', 'FAILED'],
  PUBLISHED: ['UPDATE_PENDING', 'REMOVING', 'RECONCILING'],
  UPDATE_PENDING: ['PUBLISHING', 'FAILED'],
  REMOVING: ['REMOVED', 'FAILED'],
  REMOVED: ['PENDING'],
  RECONCILING: ['PUBLISHED', 'REMOVED', 'FAILED'],
  FAILED: ['PENDING', 'REMOVING'],
  BLOCKED: [],
  ELIGIBLE: [],
  AWAITING_IMPORT: [],
  IMPORTED: [],
  IMPORTED_WITH_WARNINGS: [],
  IMPORT_ERROR: [],
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
