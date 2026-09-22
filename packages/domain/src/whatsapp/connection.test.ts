import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_CLAIM_TTL_MS,
  WHATSAPP_CONNECTION_STATUSES,
  canReceiveWhatsAppWebhook,
  canVerifyWhatsAppConnection,
  decideWhatsAppClaim,
  isWhatsAppClaimExpired,
  isWhatsAppConnectionStatus,
  whatsappClaimExpiresAt,
} from './connection.js';

/**
 * G3, trilha E2 (auditoria 2026-09-10, P1-18, segunda parte): qualquer organização com
 * `org:manage` reivindicava qualquer `phoneNumberId`, e quem reivindicava primeiro recebia o
 * webhook daquele número. A conexão passa a nascer PENDING, só recebe webhook depois de provar a
 * posse (VERIFIED), e a reivindicação pendente vencida só é tomada por quem provar a posse.
 */
const NOW = new Date('2026-09-21T12:00:00.000Z');
const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

describe('status da conexão do WhatsApp', () => {
  it('três status, e o antigo ACTIVE não existe mais', () => {
    expect(WHATSAPP_CONNECTION_STATUSES).toEqual(['PENDING', 'VERIFIED', 'DISABLED']);
    expect(isWhatsAppConnectionStatus('PENDING')).toBe(true);
    expect(isWhatsAppConnectionStatus('ACTIVE')).toBe(false);
  });

  it('só a conexão VERIFIED recebe webhook', () => {
    expect(canReceiveWhatsAppWebhook('VERIFIED')).toBe(true);
    expect(canReceiveWhatsAppWebhook('PENDING')).toBe(false);
    expect(canReceiveWhatsAppWebhook('DISABLED')).toBe(false);
    expect(canReceiveWhatsAppWebhook('ACTIVE')).toBe(false);
  });

  it('só a conexão PENDING é verificada', () => {
    expect(canVerifyWhatsAppConnection('PENDING')).toBe(true);
    expect(canVerifyWhatsAppConnection('VERIFIED')).toBe(false);
    expect(canVerifyWhatsAppConnection('DISABLED')).toBe(false);
  });
});

describe('prazo da reivindicação pendente', () => {
  it('vale 24 horas a partir do pedido', () => {
    expect(WHATSAPP_CLAIM_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(whatsappClaimExpiresAt(NOW).toISOString()).toBe('2026-09-22T12:00:00.000Z');
  });

  it('vence no instante do prazo; sem prazo gravado conta como vencida', () => {
    const at = (iso: string | null) => ({
      orgId: ORG_A,
      status: 'PENDING',
      claimExpiresAt: iso === null ? null : new Date(iso),
    });
    expect(isWhatsAppClaimExpired(at('2026-09-21T12:00:00.001Z'), NOW)).toBe(false);
    expect(isWhatsAppClaimExpired(at('2026-09-21T12:00:00.000Z'), NOW)).toBe(true);
    expect(isWhatsAppClaimExpired(at(null), NOW)).toBe(true);
  });

  it('conexão verificada nunca vence', () => {
    expect(
      isWhatsAppClaimExpired(
        { orgId: ORG_A, status: 'VERIFIED', claimExpiresAt: new Date('2020-01-01T00:00:00Z') },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('decideWhatsAppClaim — quem pode reivindicar o número', () => {
  const future = new Date(NOW.getTime() + 60_000);
  const past = new Date(NOW.getTime() - 60_000);

  it('número livre: cria a reivindicação', () => {
    expect(decideWhatsAppClaim(null, ORG_A, NOW)).toEqual({ kind: 'CREATE' });
  });

  it('a própria organização troca o token da reivindicação pendente (vencida ou não)', () => {
    for (const claimExpiresAt of [future, past]) {
      expect(
        decideWhatsAppClaim({ orgId: ORG_A, status: 'PENDING', claimExpiresAt }, ORG_A, NOW),
      ).toEqual({ kind: 'RENEW_OWN' });
    }
    expect(
      decideWhatsAppClaim({ orgId: ORG_A, status: 'DISABLED', claimExpiresAt: null }, ORG_A, NOW),
    ).toEqual({ kind: 'RENEW_OWN' });
  });

  it('número verificado: 409 para a própria organização e para as outras', () => {
    const verified = { orgId: ORG_A, status: 'VERIFIED', claimExpiresAt: null };
    expect(decideWhatsAppClaim(verified, ORG_A, NOW)).toEqual({
      kind: 'CONFLICT',
      reason: 'VERIFIED_HERE',
    });
    expect(decideWhatsAppClaim(verified, ORG_B, NOW)).toEqual({
      kind: 'CONFLICT',
      reason: 'VERIFIED_ELSEWHERE',
    });
  });

  it('reivindicação pendente de outra organização dentro do prazo: 409', () => {
    expect(
      decideWhatsAppClaim({ orgId: ORG_A, status: 'PENDING', claimExpiresAt: future }, ORG_B, NOW),
    ).toEqual({ kind: 'CONFLICT', reason: 'PENDING_ELSEWHERE' });
  });

  it('reivindicação pendente de outra organização vencida: pode ser tomada com prova de posse', () => {
    expect(
      decideWhatsAppClaim({ orgId: ORG_A, status: 'PENDING', claimExpiresAt: past }, ORG_B, NOW),
    ).toEqual({ kind: 'TAKE_OVER_EXPIRED' });
  });

  it('número desativado em outra organização: 409', () => {
    expect(
      decideWhatsAppClaim({ orgId: ORG_A, status: 'DISABLED', claimExpiresAt: null }, ORG_B, NOW),
    ).toEqual({ kind: 'CONFLICT', reason: 'DISABLED_ELSEWHERE' });
  });
});
