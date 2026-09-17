import { describe, expect, it } from 'vitest';
import {
  CREDIT_CONSENT_REQUIRED_MESSAGE,
  activeCreditConsent,
  planApplicationConsent,
} from './rental-application';
import type { PartyConsent } from './rental-application';

/**
 * Nova candidatura pela tela (auditoria 2026-09-10, P1-17): a API só leva a
 * candidatura para análise com o consentimento LGPD de análise de crédito ativo.
 * A tela não inventa esse consentimento — registra só quando a pessoa autorizou e
 * não tenta registrar de novo o que já está ativo (a API responde 409).
 */
const granted: PartyConsent = {
  id: 'c1',
  partyId: 'p1',
  purpose: 'CREDIT_SCREENING',
  grantedAt: '2026-09-01T12:00:00.000Z',
  revokedAt: null,
};

describe('nova candidatura — autorização LGPD da análise de crédito', () => {
  it('sem autorização registrada e sem a caixa marcada: não cria nada e explica o motivo', () => {
    expect(planApplicationConsent({ hasActiveConsent: false, authorized: false })).toEqual({
      ok: false,
      message: CREDIT_CONSENT_REQUIRED_MESSAGE,
    });
    expect(CREDIT_CONSENT_REQUIRED_MESSAGE).toContain(
      'A análise de crédito exige a autorização da pessoa (LGPD)',
    );
  });

  it('autorização marcada agora: registra o consentimento antes da candidatura', () => {
    expect(planApplicationConsent({ hasActiveConsent: false, authorized: true })).toEqual({
      ok: true,
      grantConsent: true,
    });
  });

  it('autorização já registrada: não registra de novo', () => {
    expect(planApplicationConsent({ hasActiveConsent: true, authorized: false })).toEqual({
      ok: true,
      grantConsent: false,
    });
    expect(planApplicationConsent({ hasActiveConsent: true, authorized: true })).toEqual({
      ok: true,
      grantConsent: false,
    });
  });

  it('só vale o consentimento de análise de crédito que não foi revogado', () => {
    expect(activeCreditConsent([granted])).toEqual(granted);
    expect(activeCreditConsent([{ ...granted, revokedAt: '2026-09-02T00:00:00.000Z' }])).toBeNull();
    expect(activeCreditConsent([{ ...granted, purpose: 'MARKETING' }])).toBeNull();
    expect(activeCreditConsent([])).toBeNull();
  });
});
