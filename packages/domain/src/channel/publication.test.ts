import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  canTransitionChannelPublication,
  isChannelPublicationStatus,
  isChannelType,
  transitionChannelPublication,
} from './publication.js';

describe('channel publication transitions', () => {
  it('aceita transições válidas', () => {
    expect(canTransitionChannelPublication('PENDING', 'PUBLISHING')).toBe(true);
    expect(canTransitionChannelPublication('PUBLISHING', 'PUBLISHED')).toBe(true);
    expect(canTransitionChannelPublication('PUBLISHED', 'UPDATE_PENDING')).toBe(true);
    expect(canTransitionChannelPublication('UPDATE_PENDING', 'PUBLISHING')).toBe(true);
    expect(canTransitionChannelPublication('PUBLISHED', 'REMOVING')).toBe(true);
    expect(canTransitionChannelPublication('REMOVING', 'REMOVED')).toBe(true);
    expect(canTransitionChannelPublication('REMOVED', 'PENDING')).toBe(true);
    expect(canTransitionChannelPublication('FAILED', 'PENDING')).toBe(true);
    expect(canTransitionChannelPublication('RECONCILING', 'PUBLISHED')).toBe(true);
  });

  it('rejeita transições inválidas', () => {
    expect(canTransitionChannelPublication('PENDING', 'PUBLISHED')).toBe(false);
    expect(canTransitionChannelPublication('PUBLISHED', 'PUBLISHING')).toBe(false);
    expect(canTransitionChannelPublication('REMOVED', 'PUBLISHED')).toBe(false);
    expect(canTransitionChannelPublication('PUBLISHING', 'REMOVING')).toBe(false);
  });

  it('transição idempotente é válida', () => {
    expect(canTransitionChannelPublication('PUBLISHED', 'PUBLISHED')).toBe(true);
  });

  it('transitionChannelPublication lança DomainError em transição inválida', () => {
    expect(() => transitionChannelPublication('PENDING', 'PUBLISHED')).toThrow(DomainError);
  });

  it('valida enums', () => {
    expect(isChannelType('fake')).toBe(true);
    expect(isChannelType('portal-inventado')).toBe(false);
    expect(isChannelPublicationStatus('PUBLISHED')).toBe(true);
    expect(isChannelPublicationStatus('GARBAGE')).toBe(false);
  });
});
