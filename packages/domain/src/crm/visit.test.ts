import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  canTransitionVisit,
  isVisitStatus,
  transitionVisit,
  VISIT_STATUSES,
  visitReschedulable,
} from './visit.js';

/**
 * Auditoria 2026-09-10, P2-02: a visita nascia SCHEDULED e nunca mudava — não havia confirmar,
 * reagendar, cancelar, não comparecimento nem realizada.
 */
describe('ciclo de vida da visita', () => {
  it('conhece os cinco status', () => {
    expect([...VISIT_STATUSES]).toEqual([
      'SCHEDULED',
      'CONFIRMED',
      'DONE',
      'CANCELLED',
      'NO_SHOW',
    ]);
    expect(isVisitStatus('CONFIRMED')).toBe(true);
    expect(isVisitStatus('RESCHEDULED')).toBe(false);
  });

  it('agendada confirma, cancela, realiza ou vira não comparecimento', () => {
    expect(transitionVisit('SCHEDULED', 'CONFIRMED')).toBe('CONFIRMED');
    expect(transitionVisit('SCHEDULED', 'DONE')).toBe('DONE');
    expect(transitionVisit('SCHEDULED', 'NO_SHOW')).toBe('NO_SHOW');
    expect(transitionVisit('SCHEDULED', 'CANCELLED', { reason: 'interessado desistiu' })).toBe(
      'CANCELLED',
    );
  });

  it('confirmada realiza, cancela ou vira não comparecimento', () => {
    expect(transitionVisit('CONFIRMED', 'DONE')).toBe('DONE');
    expect(transitionVisit('CONFIRMED', 'NO_SHOW')).toBe('NO_SHOW');
    expect(transitionVisit('CONFIRMED', 'CANCELLED', { reason: 'imóvel alugado' })).toBe(
      'CANCELLED',
    );
  });

  it('cancelamento exige motivo', () => {
    expect(canTransitionVisit('SCHEDULED', 'CANCELLED')).toBe(false);
    expect(canTransitionVisit('SCHEDULED', 'CANCELLED', { reason: '  ' })).toBe(false);
    expect(canTransitionVisit('SCHEDULED', 'CANCELLED', { reason: 'chuva' })).toBe(true);
    let error: unknown;
    try {
      transitionVisit('CONFIRMED', 'CANCELLED');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INVALID_TRANSITION');
  });

  it('status final não volta atrás', () => {
    for (const from of ['DONE', 'CANCELLED', 'NO_SHOW'] as const) {
      for (const to of ['SCHEDULED', 'CONFIRMED', 'DONE'] as const) {
        if (from === to) {
          continue;
        }
        expect(canTransitionVisit(from, to, { reason: 'qualquer' }), `${from} → ${to}`).toBe(false);
      }
    }
    expect(() => transitionVisit('CANCELLED', 'CONFIRMED')).toThrow(DomainError);
  });

  it('transição para o mesmo status é idempotente', () => {
    for (const status of VISIT_STATUSES) {
      expect(transitionVisit(status, status, { reason: 'idem' }), status).toBe(status);
    }
  });

  it('reagendar só vale para agendada e confirmada, e volta para agendada', () => {
    expect(visitReschedulable('SCHEDULED')).toBe(true);
    expect(visitReschedulable('CONFIRMED')).toBe(true);
    for (const status of ['DONE', 'CANCELLED', 'NO_SHOW'] as const) {
      expect(visitReschedulable(status), status).toBe(false);
    }
    expect(transitionVisit('CONFIRMED', 'SCHEDULED')).toBe('SCHEDULED');
  });
});
