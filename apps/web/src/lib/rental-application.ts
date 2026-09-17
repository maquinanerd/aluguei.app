/**
 * Nova candidatura pela tela (auditoria 2026-09-10, P1-17). A API só leva a
 * candidatura para análise com o consentimento LGPD de análise de crédito ativo;
 * a tela registra o consentimento apenas quando a pessoa autorizou e não repete o
 * que já está ativo (a API responde 409). Módulo puro.
 */

export const CREDIT_SCREENING_PURPOSE = 'CREDIT_SCREENING';

export const CREDIT_CONSENT_REQUIRED_MESSAGE =
  'A análise de crédito exige a autorização da pessoa (LGPD). Marque a autorização só se a pessoa concordou com a consulta.';

export interface PartyConsent {
  id: string;
  partyId: string;
  purpose: string;
  grantedAt: string;
  revokedAt: string | null;
}

export function activeCreditConsent(consents: readonly PartyConsent[]): PartyConsent | null {
  return (
    consents.find((c) => c.purpose === CREDIT_SCREENING_PURPOSE && c.revokedAt === null) ?? null
  );
}

export type ApplicationConsentPlan =
  { ok: true; grantConsent: boolean } | { ok: false; message: string };

export function planApplicationConsent(input: {
  hasActiveConsent: boolean;
  authorized: boolean;
}): ApplicationConsentPlan {
  if (input.hasActiveConsent) {
    return { ok: true, grantConsent: false };
  }
  if (!input.authorized) {
    return { ok: false, message: CREDIT_CONSENT_REQUIRED_MESSAGE };
  }
  return { ok: true, grantConsent: true };
}
