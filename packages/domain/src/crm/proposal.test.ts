import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  canTransitionProposal,
  isProposalExpired,
  isProposalStatus,
  PROPOSAL_STATUSES,
  proposalEditable,
  transitionProposal,
} from './proposal.js';

/**
 * Auditoria 2026-09-10, P2-02: a proposta nascia DRAFT e nunca saía dali — não havia enviar,
 * aceitar, recusar nem expirar, e `validUntil` não tinha efeito nenhum.
 */
describe('ciclo de vida da proposta', () => {
  it('conhece os cinco status', () => {
    expect([...PROPOSAL_STATUSES]).toEqual(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);
    expect(isProposalStatus('SENT')).toBe(true);
    expect(isProposalStatus('PENDING')).toBe(false);
  });

  it('rascunho envia; enviada aceita, recusa ou expira', () => {
    expect(transitionProposal('DRAFT', 'SENT', { validUntil: '2026-12-31' })).toBe('SENT');
    expect(transitionProposal('SENT', 'ACCEPTED')).toBe('ACCEPTED');
    expect(transitionProposal('SENT', 'REJECTED', { reason: 'valor alto' })).toBe('REJECTED');
    expect(transitionProposal('SENT', 'EXPIRED')).toBe('EXPIRED');
  });

  it('enviar exige validade', () => {
    expect(canTransitionProposal('DRAFT', 'SENT')).toBe(false);
    expect(canTransitionProposal('DRAFT', 'SENT', { validUntil: null })).toBe(false);
    expect(canTransitionProposal('DRAFT', 'SENT', { validUntil: '2026-12-31' })).toBe(true);
    let error: unknown;
    try {
      transitionProposal('DRAFT', 'SENT');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INVALID_TRANSITION');
  });

  it('recusa exige motivo', () => {
    expect(canTransitionProposal('SENT', 'REJECTED')).toBe(false);
    expect(canTransitionProposal('SENT', 'REJECTED', { reason: ' ' })).toBe(false);
    expect(canTransitionProposal('SENT', 'REJECTED', { reason: 'fora do orçamento' })).toBe(true);
  });

  it('rascunho não é aceito, recusado nem expirado sem ter sido enviado', () => {
    for (const to of ['ACCEPTED', 'REJECTED', 'EXPIRED'] as const) {
      expect(canTransitionProposal('DRAFT', to, { reason: 'x' }), to).toBe(false);
    }
  });

  it('status final não volta atrás', () => {
    for (const from of ['ACCEPTED', 'REJECTED', 'EXPIRED'] as const) {
      for (const to of ['DRAFT', 'SENT', 'ACCEPTED'] as const) {
        if (from === to) {
          continue;
        }
        expect(
          canTransitionProposal(from, to, { reason: 'x', validUntil: '2026-12-31' }),
          `${from} → ${to}`,
        ).toBe(false);
      }
    }
    expect(() => transitionProposal('EXPIRED', 'ACCEPTED')).toThrow(DomainError);
  });

  it('transição para o mesmo status é idempotente', () => {
    for (const status of PROPOSAL_STATUSES) {
      expect(
        transitionProposal(status, status, { reason: 'idem', validUntil: '2026-12-31' }),
        status,
      ).toBe(status);
    }
  });

  it('só o rascunho é editável', () => {
    expect(proposalEditable('DRAFT')).toBe(true);
    for (const status of ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const) {
      expect(proposalEditable(status), status).toBe(false);
    }
  });

  it('expira quando a validade já passou (data civil, sem fuso)', () => {
    // A validade é o último dia em que a proposta vale: o dia inteiro conta.
    expect(isProposalExpired('2026-09-17', '2026-09-17')).toBe(false);
    expect(isProposalExpired('2026-09-17', '2026-09-18')).toBe(true);
    expect(isProposalExpired('2026-09-17', '2026-09-16')).toBe(false);
    expect(isProposalExpired(null, '2026-09-18')).toBe(false);
  });
});
