/**
 * Decisões da tela de crédito (screening/[id]) diante das regras da trilha A do
 * G2 (P1-06, ADR G2A-2): o screening só é pedido em SUBMITTED; aprovar ou
 * rejeitar só em MANUAL_REVIEW, por uma pessoa e com motivo digitado — o texto
 * fixo anterior derrotava a auditoria. A API responde 409 fora dessas situações
 * e 400 sem motivo; a tela não oferece a ação.
 */
export type CreditDecision = 'APPROVED' | 'REJECTED';

export interface CreditActions {
  canRequestScreening: boolean;
  decisions: readonly CreditDecision[];
}

/** Mesmo limite do contrato da API para `decisionReason`. */
export const DECISION_REASON_MAX_LENGTH = 2000;

export function creditActions(status: string): CreditActions {
  switch (status) {
    case 'SUBMITTED':
      return { canRequestScreening: true, decisions: [] };
    case 'MANUAL_REVIEW':
      return { canRequestScreening: false, decisions: ['APPROVED', 'REJECTED'] };
    default:
      return { canRequestScreening: false, decisions: [] };
  }
}

export type DecisionPayloadResult =
  | { ok: true; body: { status: CreditDecision; decisionReason: string } }
  | { ok: false; message: string };

export function buildDecisionPayload(
  decision: CreditDecision,
  reason: string,
): DecisionPayloadResult {
  const decisionReason = reason.trim();
  if (decisionReason === '') {
    return {
      ok: false,
      message: 'Informe o motivo da decisão: ele fica registrado na auditoria do crédito.',
    };
  }
  if (decisionReason.length > DECISION_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `O motivo pode ter no máximo ${String(DECISION_REASON_MAX_LENGTH)} caracteres.`,
    };
  }
  return { ok: true, body: { status: decision, decisionReason } };
}

const DECISION_SOURCE_LABELS: Readonly<Record<string, string>> = {
  MANUAL: 'Manual (equipe)',
  AUTOMATIC: 'Automática (regras do screening)',
};

export function decisionSourceLabel(source: string | null): string {
  return source === null ? '—' : (DECISION_SOURCE_LABELS[source] ?? source);
}
