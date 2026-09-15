import { describe, expect, it } from 'vitest';
import { decideApplication, describeScreeningDecision } from './screening.js';

describe('describeScreeningDecision (P1-06: motivo auditável da decisão automática)', () => {
  it('aprovação cita provider, decisão e a regra que decidiu', () => {
    const decision = decideApplication({ score: 750, redFlags: [] });
    const reason = describeScreeningDecision('FAKE', decision);
    expect(reason).toContain('FAKE');
    expect(reason).toContain('APPROVE');
    expect(reason).toContain('score_above_threshold');
    expect(reason).toContain('score 750 >= 700');
    // Regras não aplicadas não viram motivo.
    expect(reason).not.toContain('red_flag_high');
  });

  it('rejeição cita a red flag que decidiu', () => {
    const decision = decideApplication({
      score: 900,
      redFlags: [{ id: 'NEGATIVACAO_ALTA', severity: 'HIGH' }],
    });
    const reason = describeScreeningDecision('SERASA', decision);
    expect(reason).toContain('REJECT');
    expect(reason).toContain('red_flag_high');
    expect(reason).toContain('NEGATIVACAO_ALTA');
  });
});
