import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { canTransition, isFunnelStatus, transitionLead } from './funnel.js';

describe('funnel transitions', () => {
  it('aceita transições válidas', () => {
    expect(canTransition('NEW', 'QUALIFYING')).toBe(true);
    expect(canTransition('QUALIFYING', 'QUALIFIED')).toBe(true);
    expect(canTransition('QUALIFIED', 'VISIT')).toBe(true);
    expect(canTransition('VISIT', 'PROPOSAL')).toBe(true);
    expect(canTransition('PROPOSAL', 'APPLICATION')).toBe(true);
    expect(canTransition('APPLICATION', 'WON')).toBe(true);
  });

  it('rejeita transições inválidas', () => {
    expect(canTransition('NEW', 'WON')).toBe(false);
    expect(canTransition('QUALIFYING', 'VISIT')).toBe(false);
    expect(canTransition('WON', 'LOST')).toBe(false);
  });

  it('LOST exige motivo', () => {
    expect(canTransition('NEW', 'LOST')).toBe(false);
    expect(canTransition('NEW', 'LOST', { reason: 'encontrou outro imóvel' })).toBe(true);
  });

  it('transição idempotente é válida', () => {
    expect(canTransition('QUALIFIED', 'QUALIFIED')).toBe(true);
  });

  it('transitionLead lança DomainError em transição inválida', () => {
    expect(() => transitionLead('NEW', 'WON')).toThrow(DomainError);
    expect(() => transitionLead('NEW', 'WON')).toThrow(/INVALID_TRANSITION|Transição/);
  });

  it('isFunnelStatus valida valores', () => {
    expect(isFunnelStatus('NEW')).toBe(true);
    expect(isFunnelStatus('GARBAGE')).toBe(false);
  });
});
