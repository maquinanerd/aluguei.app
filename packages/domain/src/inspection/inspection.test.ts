import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  canTransitionInspection,
  inspectionCompletionIssues,
  isInspectionStatus,
  transitionInspection,
} from './stateMachine.js';
import { computeInspectionDifferences } from './compare.js';

describe('inspection state machine', () => {
  it('aceita transições válidas', () => {
    expect(canTransitionInspection('DRAFT', 'CAPTURING')).toBe(true);
    expect(canTransitionInspection('CAPTURING', 'PROCESSING')).toBe(true);
    expect(
      canTransitionInspection('PROCESSING', 'REVIEW', {
        pendingTranscripts: 0,
        pendingSuggestions: 0,
        draftObservations: 0,
      }),
    ).toBe(true);
    expect(
      canTransitionInspection('REVIEW', 'COMPLETED', {
        pendingTranscripts: 0,
        pendingSuggestions: 0,
        draftObservations: 0,
      }),
    ).toBe(true);
    expect(canTransitionInspection('REVIEW', 'CAPTURING')).toBe(true);
    expect(canTransitionInspection('COMPLETED', 'SIGNED')).toBe(true);
  });

  it('rejeita transições inválidas', () => {
    expect(canTransitionInspection('DRAFT', 'REVIEW')).toBe(false);
    expect(canTransitionInspection('SIGNED', 'DRAFT')).toBe(false);
    expect(canTransitionInspection('CAPTURING', 'COMPLETED')).toBe(false);
  });

  it('guards: PROCESSING→REVIEW exige nada de transcript PENDING (sugestões PENDING são esperadas na revisão)', () => {
    expect(
      canTransitionInspection('PROCESSING', 'REVIEW', {
        pendingTranscripts: 1,
        pendingSuggestions: 0,
        draftObservations: 0,
      }),
    ).toBe(false);
    expect(
      canTransitionInspection('PROCESSING', 'REVIEW', {
        pendingTranscripts: 0,
        pendingSuggestions: 3,
        draftObservations: 0,
      }),
    ).toBe(true);
  });

  it('guards: REVIEW→COMPLETED exige sugestões resolvidas e sem rascunho', () => {
    expect(
      canTransitionInspection('REVIEW', 'COMPLETED', {
        pendingTranscripts: 0,
        pendingSuggestions: 1,
        draftObservations: 0,
      }),
    ).toBe(false);
    expect(
      canTransitionInspection('REVIEW', 'COMPLETED', {
        pendingTranscripts: 0,
        pendingSuggestions: 0,
        draftObservations: 1,
      }),
    ).toBe(false);
  });

  it('completionIssues lista motivos', () => {
    const issues = inspectionCompletionIssues('REVIEW', 'COMPLETED', {
      pendingTranscripts: 0,
      pendingSuggestions: 2,
      draftObservations: 1,
    });
    expect(issues.length).toBe(2);
  });

  it('transitionInspection lança DomainError', () => {
    expect(() => transitionInspection('DRAFT', 'REVIEW')).toThrow(DomainError);
  });

  it('isInspectionStatus valida', () => {
    expect(isInspectionStatus('REVIEW')).toBe(true);
    expect(isInspectionStatus('GARBAGE')).toBe(false);
  });
});

describe('computeInspectionDifferences', () => {
  const checkin = [
    {
      roomId: 'r1',
      roomName: 'Quarto',
      category: 'CONDITION',
      severity: 'LOW',
      description: 'Piso com riscos',
    },
    {
      roomId: 'r2',
      roomName: 'Cozinha',
      category: 'CLEANLINESS',
      severity: 'LOW',
      description: 'Superfície com resíduos',
    },
  ];
  const checkout = [
    {
      roomId: 'r1',
      roomName: 'Quarto',
      category: 'CONDITION',
      severity: 'LOW',
      description: 'Piso com riscos',
    },
    {
      roomId: 'r1',
      roomName: 'Quarto',
      category: 'DAMAGE',
      severity: 'MEDIUM',
      description: 'Mancha na parede',
    },
  ];

  it('classifica UNCHANGED, NEW e RESOLVED', () => {
    const result = computeInspectionDifferences(checkin, checkout);
    const kinds = result.map((d) => d.kind);
    expect(kinds).toContain('UNCHANGED');
    expect(kinds).toContain('NEW');
    expect(kinds).toContain('RESOLVED');
  });

  it('classifica CHANGED quando severidade diverge', () => {
    const result = computeInspectionDifferences(
      [{ roomId: 'r1', roomName: 'Q', category: 'DAMAGE', severity: 'LOW', description: 'Mancha' }],
      [
        {
          roomId: 'r1',
          roomName: 'Q',
          category: 'DAMAGE',
          severity: 'HIGH',
          description: 'Mancha',
        },
      ],
    );
    expect(result[0]?.kind).toBe('CHANGED');
  });
});
