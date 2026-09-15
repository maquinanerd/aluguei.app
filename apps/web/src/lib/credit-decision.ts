/**
 * CONTROLE NEGATIVO (versionado só no commit de RED): as decisões que a tela de
 * crédito (screening/[id]/screening-detail-client.tsx) toma hoje — botão de
 * screening e "Aprovar" em qualquer status, motivo fixo "Aprovado pela equipe",
 * sem rejeitar e sem mostrar a origem da decisão. Substituído pela
 * implementação no commit de correção.
 */
export type CreditDecision = 'APPROVED' | 'REJECTED';

export interface CreditActions {
  canRequestScreening: boolean;
  decisions: readonly CreditDecision[];
}

export const DECISION_REASON_MAX_LENGTH = 2000;

export function creditActions(_status: string): CreditActions {
  return { canRequestScreening: true, decisions: ['APPROVED'] };
}

export type DecisionPayloadResult =
  | { ok: true; body: { status: CreditDecision; decisionReason: string } }
  | { ok: false; message: string };

export function buildDecisionPayload(
  _decision: CreditDecision,
  _reason: string,
): DecisionPayloadResult {
  return { ok: true, body: { status: 'APPROVED', decisionReason: 'Aprovado pela equipe' } };
}

export function decisionSourceLabel(_source: string | null): string {
  return '—';
}
