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
  assertContractContentWritable,
  canTransitionContract,
  canWriteContractContent,
  isContractStatus,
  sha256Hex,
} from '../contract/contract.js';
import { renderTemplate } from '../contract/template.js';

describe('rental application state machine', () => {
  const ok = {
    hasConsent: true,
    hasRequiredData: true,
    hasDecisionReason: true,
    hasDecidedBy: true,
    hasScreeningResult: true,
    hasContract: true,
  };
  const manual = { ...ok, source: 'MANUAL' as const };
  const screeningRequest = { ...ok, source: 'SCREENING_REQUEST' as const };
  const screeningResult = { ...ok, source: 'SCREENING_RESULT' as const };
  const contract = { ...ok, source: 'CONTRACT' as const };

  it('aceita cada transição válida pela origem certa', () => {
    expect(canTransitionRentalApplication('DRAFT', 'SUBMITTED', manual)).toBe(true);
    expect(canTransitionRentalApplication('SUBMITTED', 'SCREENING', screeningRequest)).toBe(true);
    expect(canTransitionRentalApplication('SCREENING', 'APPROVED', screeningResult)).toBe(true);
    expect(canTransitionRentalApplication('SCREENING', 'REJECTED', screeningResult)).toBe(true);
    expect(canTransitionRentalApplication('SCREENING', 'MANUAL_REVIEW', screeningResult)).toBe(
      true,
    );
    expect(canTransitionRentalApplication('MANUAL_REVIEW', 'APPROVED', manual)).toBe(true);
    expect(canTransitionRentalApplication('MANUAL_REVIEW', 'REJECTED', manual)).toBe(true);
    expect(canTransitionRentalApplication('APPROVED', 'CONTRACTING', contract)).toBe(true);
    // Contrato cancelado: a candidatura volta a aguardar contrato.
    expect(
      canTransitionRentalApplication('CONTRACTING', 'APPROVED', {
        ...contract,
        hasContract: false,
      }),
    ).toBe(true);
  });

  it('SUBMITTED exige consentimento', () => {
    expect(
      canTransitionRentalApplication('DRAFT', 'SUBMITTED', { ...manual, hasConsent: false }),
    ).toBe(false);
    const issues = applicationTransitionIssues('DRAFT', 'SUBMITTED', {
      ...manual,
      hasConsent: false,
    });
    expect(issues.some((i) => i.includes('Consentimento'))).toBe(true);
  });

  it('decisão manual exige motivo e responsável', () => {
    expect(
      canTransitionRentalApplication('MANUAL_REVIEW', 'REJECTED', {
        ...manual,
        hasDecisionReason: false,
      }),
    ).toBe(false);
    expect(
      canTransitionRentalApplication('MANUAL_REVIEW', 'APPROVED', {
        ...manual,
        hasDecidedBy: false,
      }),
    ).toBe(false);
  });

  it('P1-06: SCREENING só pelo pedido de screening', () => {
    expect(canTransitionRentalApplication('SUBMITTED', 'SCREENING', manual)).toBe(false);
    expect(
      applicationTransitionIssues('SUBMITTED', 'SCREENING', manual).join(' ').toLowerCase(),
    ).toContain('screening');
  });

  it('P1-06: com screening em andamento, só o resultado decide', () => {
    for (const to of ['APPROVED', 'REJECTED', 'MANUAL_REVIEW'] as const) {
      expect(canTransitionRentalApplication('SCREENING', to, manual)).toBe(false);
    }
    expect(
      canTransitionRentalApplication('SCREENING', 'APPROVED', {
        ...screeningResult,
        hasScreeningResult: false,
      }),
    ).toBe(false);
    expect(
      canTransitionRentalApplication('SCREENING', 'APPROVED', {
        ...screeningResult,
        hasDecisionReason: false,
      }),
    ).toBe(false);
    // O resultado não decide uma revisão manual: ali a decisão é humana.
    expect(canTransitionRentalApplication('MANUAL_REVIEW', 'APPROVED', screeningResult)).toBe(
      false,
    );
  });

  it('P1-06: CONTRACTING só pelo contrato criado', () => {
    expect(canTransitionRentalApplication('APPROVED', 'CONTRACTING', manual)).toBe(false);
    expect(
      canTransitionRentalApplication('APPROVED', 'CONTRACTING', {
        ...contract,
        hasContract: false,
      }),
    ).toBe(false);
    // Com contrato ativo a candidatura não volta para APPROVED.
    expect(canTransitionRentalApplication('CONTRACTING', 'APPROVED', contract)).toBe(false);
    expect(canTransitionRentalApplication('CONTRACTING', 'APPROVED', manual)).toBe(false);
  });

  it('lança DomainError em transição inválida', () => {
    expect(() => transitionRentalApplication('DRAFT', 'APPROVED', manual)).toThrow(DomainError);
    expect(() => transitionRentalApplication('SUBMITTED', 'SCREENING', manual)).toThrow(
      DomainError,
    );
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

  it('conteúdo só é gravável antes do envio para assinatura (P0-04)', () => {
    expect(canWriteContractContent('DRAFT')).toBe(true);
    expect(canWriteContractContent('GENERATED')).toBe(true);
    for (const status of ['SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'SIGNED', 'VOID'] as const) {
      expect(canWriteContractContent(status)).toBe(false);
      expect(() => {
        assertContractContentWritable(status);
      }).toThrow(DomainError);
    }
    // SIGNED e VOID são terminais: nem GENERATED nem DRAFT voltam a valer.
    expect(canTransitionContract('SIGNED', 'GENERATED')).toBe(false);
    expect(canTransitionContract('VOID', 'GENERATED')).toBe(false);
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
    // P2-08: variável oferecida e não usada deixou de ser erro (o template não é
    // obrigado a usar todas); placeholder desconhecido continua falhando acima.
    expect(renderTemplate('X {{a}}', { a: 1, unused: 2 })).toBe('X 1');
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
