export type ScreeningDecision = 'APPROVE' | 'REVIEW' | 'REJECT';

export interface RedFlag {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  detail?: string;
}

export interface ScreeningDecisionInput {
  score: number | null;
  redFlags: RedFlag[];
  approveScoreMin?: number;
}

export interface RuleTrace {
  ruleId: string;
  applied: boolean;
  detail: string;
}

export interface ScreeningDecisionResult {
  decision: ScreeningDecision;
  rules: RuleTrace[];
}

const DEFAULT_APPROVE_SCORE_MIN = 700;

/**
 * Regras determinísticas de decisão de crédito — explicáveis e revisáveis.
 * Avalia em ordem (curto-circuito) e persiste todo o rastreio em `rules`.
 * IA NUNCA participa da decisão (apenas pode resumir achados em fases futuras).
 */
export function decideApplication(input: ScreeningDecisionInput): ScreeningDecisionResult {
  const approveScoreMin = input.approveScoreMin ?? DEFAULT_APPROVE_SCORE_MIN;
  const rules: RuleTrace[] = [];

  const highFlag = input.redFlags.find((flag) => flag.severity === 'HIGH');
  if (highFlag) {
    rules.push({ ruleId: 'red_flag_high', applied: true, detail: `flag: ${highFlag.id}` });
    return { decision: 'REJECT', rules };
  }
  rules.push({ ruleId: 'red_flag_high', applied: false, detail: 'sem flags HIGH' });

  if (input.score !== null && input.score >= approveScoreMin) {
    rules.push({
      ruleId: 'score_above_threshold',
      applied: true,
      detail: `score ${String(input.score)} >= ${String(approveScoreMin)}`,
    });
    return { decision: 'APPROVE', rules };
  }
  rules.push({
    ruleId: 'score_above_threshold',
    applied: false,
    detail: `score ${input.score === null ? 'n/a' : String(input.score)} < ${String(approveScoreMin)}`,
  });

  return { decision: 'REVIEW', rules };
}

/**
 * Motivo auditável de uma decisão automática (auditoria 2026-09-10, P1-06):
 * provider, decisão e as regras que efetivamente decidiram, com o detalhe de
 * cada uma. O rastreio completo (inclusive regras não aplicadas) fica em
 * `screening_results.decision_rules`.
 */
export function describeScreeningDecision(
  provider: string,
  result: ScreeningDecisionResult,
): string {
  const applied = result.rules.filter((rule) => rule.applied);
  const rules =
    applied.length > 0
      ? applied.map((rule) => `${rule.ruleId}: ${rule.detail}`).join('; ')
      : 'nenhuma regra conclusiva';
  return `Decisão automática (${provider}): ${result.decision} — ${rules}`;
}
