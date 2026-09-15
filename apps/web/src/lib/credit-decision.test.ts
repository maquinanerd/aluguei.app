import { describe, expect, it } from 'vitest';
import {
  buildDecisionPayload,
  creditActions,
  DECISION_REASON_MAX_LENGTH,
  decisionSourceLabel,
} from './credit-decision';

/**
 * Tela de crédito diante das regras da trilha A do G2 (P1-06, ADR G2A-2): o
 * screening só é pedido em SUBMITTED; aprovar ou rejeitar só em MANUAL_REVIEW,
 * por uma pessoa, com motivo digitado — o texto fixo "Aprovado pela equipe"
 * derrotava a auditoria. A API responde 409 fora dessas situações e 400 sem
 * motivo; a tela não pode oferecer a ação.
 */
describe('creditActions — o que a tela oferece em cada status', () => {
  it('SUBMITTED: só pedir screening', () => {
    expect(creditActions('SUBMITTED')).toEqual({ canRequestScreening: true, decisions: [] });
  });

  it('MANUAL_REVIEW: aprovar ou rejeitar, sem novo screening', () => {
    expect(creditActions('MANUAL_REVIEW')).toEqual({
      canRequestScreening: false,
      decisions: ['APPROVED', 'REJECTED'],
    });
  });

  it.each(['DRAFT', 'SCREENING', 'APPROVED', 'REJECTED', 'CONTRACTING'])(
    '%s: nenhuma ação de crédito',
    (status) => {
      expect(creditActions(status)).toEqual({ canRequestScreening: false, decisions: [] });
    },
  );
});

describe('buildDecisionPayload — motivo digitado pela pessoa', () => {
  it('aprovação leva o motivo digitado, sem espaços nas pontas', () => {
    expect(buildDecisionPayload('APPROVED', '  Renda comprovada de 3x o aluguel  ')).toEqual({
      ok: true,
      body: { status: 'APPROVED', decisionReason: 'Renda comprovada de 3x o aluguel' },
    });
  });

  it('rejeição leva o status REJECTED e o motivo', () => {
    expect(buildDecisionPayload('REJECTED', 'Restrição ativa no CPF')).toEqual({
      ok: true,
      body: { status: 'REJECTED', decisionReason: 'Restrição ativa no CPF' },
    });
  });

  it.each(['', '   '])('motivo vazio (%j) não gera pedido', (reason) => {
    const result = buildDecisionPayload('APPROVED', reason);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('motivo');
    }
  });

  it('motivo acima do limite da API é recusado; no limite é aceito', () => {
    const tooLong = buildDecisionPayload('REJECTED', 'x'.repeat(DECISION_REASON_MAX_LENGTH + 1));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.message).toContain(String(DECISION_REASON_MAX_LENGTH));
    }
    expect(buildDecisionPayload('APPROVED', 'x'.repeat(DECISION_REASON_MAX_LENGTH)).ok).toBe(true);
    expect(DECISION_REASON_MAX_LENGTH).toBe(2000);
  });
});

describe('decisionSourceLabel — origem da decisão', () => {
  it.each([
    ['MANUAL', 'Manual (equipe)'],
    ['AUTOMATIC', 'Automática (regras do screening)'],
    [null, '—'],
  ] as const)('%s → %s', (source, text) => {
    expect(decisionSourceLabel(source)).toBe(text);
  });
});
