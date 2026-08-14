import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  applicationTransitionIssues,
  canTransitionRentalApplication,
  isRentalApplicationStatus,
  transitionRentalApplication,
} from './application.js';
import { decideApplication } from './screening.js';
import {
  CONTRACT_STATUSES,
  canTransitionContract,
  isContractStatus,
  sha256Hex,
} from '../contract/contract.js';
import { renderTemplate } from '../contract/template.js';

describe('rental application state machine', () => {
  const ok = {
    hasConsent: true,
    hasRequiredData: true,
    hasDecisionReason: true,
    hasContract: true,
  };

  it('aceita transições válidas', () => {
    expect(canTransitionRentalApplication('DRAFT', 'SUBMITTED', ok)).toBe(true);
    expect(canTransitionRentalApplication('SUBMITTED', 'SCREENING', ok)).toBe(true);
    expect(canTransitionRentalApplication('SCREENING', 'APPROVED', ok)).toBe(true);
    expect(canTransitionRentalApplication('SCREENING', 'MANUAL_REVIEW', ok)).toBe(true);
    expect(canTransitionRentalApplication('MANUAL_REVIEW', 'APPROVED', ok)).toBe(true);
    expect(canTransitionRentalApplication('APPROVED', 'CONTRACTING', ok)).toBe(true);
  });

  it('SUBMITTED exige consentimento', () => {
    expect(canTransitionRentalApplication('DRAFT', 'SUBMITTED', { ...ok, hasConsent: false })).toBe(
      false,
    );
    const issues = applicationTransitionIssues('DRAFT', 'SUBMITTED', { ...ok, hasConsent: false });
    expect(issues.some((i) => i.includes('Consentimento'))).toBe(true);
  });

  it('decisão manual exige motivo', () => {
    expect(
      canTransitionRentalApplication('MANUAL_REVIEW', 'REJECTED', {
        ...ok,
        hasDecisionReason: false,
      }),
    ).toBe(false);
  });

  it('lança DomainError em transição inválida', () => {
    expect(() => transitionRentalApplication('DRAFT', 'APPROVED', ok)).toThrow(DomainError);
  });
});

describe('decideApplication (regras determinísticas)', () => {
  it('red flag HIGH → REJECT', () => {
    const result = decideApplication({
      score: 900,
      redFlags: [{ id: 'NEGATIVACAO', severity: 'HIGH' }],
    });
    expect(result.decision).toBe('REJECT');
    expect(result.rules[0]?.ruleId).toBe('red_flag_high');
  });

  it('score alto sem flags → APPROVE', () => {
    const result = decideApplication({ score: 750, redFlags: [] });
    expect(result.decision).toBe('APPROVE');
    expect(result.rules.some((r) => r.ruleId === 'score_above_threshold' && r.applied)).toBe(true);
  });

  it('inconclusivo → REVIEW', () => {
    const result = decideApplication({ score: 450, redFlags: [{ id: 'X', severity: 'LOW' }] });
    expect(result.decision).toBe('REVIEW');
  });

  it('threshold customizado', () => {
    expect(decideApplication({ score: 650, redFlags: [], approveScoreMin: 600 }).decision).toBe(
      'APPROVE',
    );
  });
});

describe('contract state machine + template', () => {
  it('transições válidas', () => {
    expect(
      canTransitionContract('DRAFT', 'GENERATED', {
        hasContentAndHash: true,
        hasEnvelope: false,
        allPartiesSigned: false,
      }),
    ).toBe(true);
    expect(
      canTransitionContract('GENERATED', 'SENT_FOR_SIGNATURE', {
        hasContentAndHash: true,
        hasEnvelope: true,
        allPartiesSigned: false,
      }),
    ).toBe(true);
    expect(
      canTransitionContract('SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', {
        hasContentAndHash: true,
        hasEnvelope: true,
        allPartiesSigned: false,
      }),
    ).toBe(true);
    expect(
      canTransitionContract('PARTIALLY_SIGNED', 'SIGNED', {
        hasContentAndHash: true,
        hasEnvelope: true,
        allPartiesSigned: true,
      }),
    ).toBe(true);
    expect(canTransitionContract('GENERATED', 'VOID')).toBe(true);
  });

  it('SIGNED exige todas as partes assinadas', () => {
    expect(
      canTransitionContract('PARTIALLY_SIGNED', 'SIGNED', {
        hasContentAndHash: true,
        hasEnvelope: true,
        allPartiesSigned: false,
      }),
    ).toBe(false);
  });

  it('renderTemplate preenche e falha em variável ausente', () => {
    const rendered = renderTemplate('Locatário: {{tenantName}}', { tenantName: 'Ana' });
    expect(rendered).toBe('Locatário: Ana');
    expect(() => renderTemplate('X {{missing}}', {})).toThrow(DomainError);
    expect(() => renderTemplate('X', { unused: 1 })).toThrow(DomainError);
  });

  it('sha256Hex gera hash determinístico', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
  });

  it('statuses válidos', () => {
    expect(isContractStatus('SIGNED')).toBe(true);
    expect(isRentalApplicationStatus('APPROVED')).toBe(true);
    expect(CONTRACT_STATUSES.length).toBeGreaterThan(0);
  });
});
