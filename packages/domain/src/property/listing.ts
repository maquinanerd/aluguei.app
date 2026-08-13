import { DomainError } from '../errors.js';

export const LISTING_STATUSES = ['DRAFT', 'READY', 'PUBLISHED', 'PAUSED', 'ARCHIVED'] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Transições válidas do Listing (estados de negócio em texto, validados no domínio). */
const TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  DRAFT: ['READY', 'ARCHIVED'],
  READY: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'READY', 'ARCHIVED'],
  ARCHIVED: [],
};

export function isListingStatus(value: string): value is ListingStatus {
  return (LISTING_STATUSES as readonly string[]).includes(value);
}

export function canTransitionListing(from: ListingStatus, to: ListingStatus): boolean {
  if (from === to) {
    return true; // idempotente
  }
  return TRANSITIONS[from].includes(to);
}

/** Valida e aplica transição; lança DomainError(INVALID_TRANSITION) se inválida. */
export function transitionListing(from: ListingStatus, to: ListingStatus): ListingStatus {
  if (!canTransitionListing(from, to)) {
    throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}`, {
      from,
      to,
    });
  }
  return to;
}
