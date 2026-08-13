import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { canTransitionListing, isListingStatus, transitionListing } from './listing.js';

describe('listing transitions', () => {
  it('aceita transições válidas', () => {
    expect(canTransitionListing('DRAFT', 'READY')).toBe(true);
    expect(canTransitionListing('READY', 'PUBLISHED')).toBe(true);
    expect(canTransitionListing('PUBLISHED', 'PAUSED')).toBe(true);
    expect(canTransitionListing('PAUSED', 'PUBLISHED')).toBe(true);
    expect(canTransitionListing('PAUSED', 'READY')).toBe(true);
  });

  it('rejeita transições inválidas', () => {
    expect(canTransitionListing('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransitionListing('PUBLISHED', 'READY')).toBe(false);
    expect(canTransitionListing('ARCHIVED', 'DRAFT')).toBe(false);
    expect(canTransitionListing('READY', 'PAUSED')).toBe(false);
  });

  it('ARCHIVED é terminal', () => {
    for (const status of ['DRAFT', 'READY', 'PUBLISHED', 'PAUSED'] as const) {
      expect(canTransitionListing(status, 'ARCHIVED')).toBe(true);
    }
    expect(canTransitionListing('ARCHIVED', 'DRAFT')).toBe(false);
  });

  it('transição idempotente é válida', () => {
    expect(canTransitionListing('PUBLISHED', 'PUBLISHED')).toBe(true);
  });

  it('transitionListing lança DomainError em transição inválida', () => {
    expect(() => transitionListing('DRAFT', 'PUBLISHED')).toThrow(DomainError);
  });

  it('isListingStatus valida valores', () => {
    expect(isListingStatus('PUBLISHED')).toBe(true);
    expect(isListingStatus('GARBAGE')).toBe(false);
  });
});
