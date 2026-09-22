import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_CONNECTION_STATUSES,
  canReceiveWhatsAppWebhook,
  canVerifyWhatsAppConnection,
  decideWhatsAppClaim,
  isWhatsAppClaimExpired,
} from '@aluguei/domain';
import { createWhatsAppConnectionRequestSchema } from '@aluguei/contracts';
import {
  WHATSAPP_CONNECTION_STATUS_LABELS,
  claimExpired,
  connectWhatsAppErrors,
  whatsappConnectionActions,
} from './whatsapp-connection-rules';

/**
 * G3, trilha E2 (auditoria 2026-09-10, P1-18, segunda parte): a tela de integrações conectava o
 * WhatsApp com um botão "Conectar (teste)" que reivindicava o número `fake-phone-1` sem token e
 * sem prova de posse. A tela passa a pedir o número e o token da conta, e a oferecer a
 * verificação — sempre de acordo com o domínio.
 */
const ORG = '00000000-0000-4000-8000-00000000000a';
const NOW = new Date('2026-09-21T12:00:00.000Z');

describe('whatsappConnectionActions — o que a tela oferece', () => {
  it('sem conexão, só conectar (o domínio cria a reivindicação)', () => {
    expect(decideWhatsAppClaim(null, ORG, NOW).kind).toBe('CREATE');
    expect(whatsappConnectionActions(null)).toEqual({
      connect: true,
      verify: false,
      replaceToken: false,
      receivesMessages: false,
    });
  });

  it('cada status segue o domínio: verificar, trocar o token e receber mensagens', () => {
    for (const status of WHATSAPP_CONNECTION_STATUSES) {
      const actions = whatsappConnectionActions({ status });
      expect(actions.connect, `conectar ${status}`).toBe(false);
      expect(actions.verify, `verificar ${status}`).toBe(canVerifyWhatsAppConnection(status));
      expect(actions.replaceToken, `trocar token ${status}`).toBe(
        decideWhatsAppClaim({ orgId: ORG, status, claimExpiresAt: NOW }, ORG, NOW).kind ===
          'RENEW_OWN',
      );
      expect(actions.receivesMessages, `recebe ${status}`).toBe(canReceiveWhatsAppWebhook(status));
    }
  });

  it('todo status tem rótulo em português', () => {
    for (const status of WHATSAPP_CONNECTION_STATUSES) {
      expect(WHATSAPP_CONNECTION_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(WHATSAPP_CONNECTION_STATUS_LABELS.PENDING).toBe('Aguardando verificação');
    expect(WHATSAPP_CONNECTION_STATUS_LABELS.VERIFIED).toBe('Verificada');
  });
});

describe('claimExpired — prazo da reivindicação na tela', () => {
  it('igual ao domínio antes, no instante e depois do prazo', () => {
    for (const offset of [-1, 0, 1, 60_000, -60_000]) {
      const expiresAt = new Date(NOW.getTime() + offset);
      expect(
        claimExpired('PENDING', expiresAt.toISOString(), NOW),
        `offset ${String(offset)}`,
      ).toBe(
        isWhatsAppClaimExpired({ orgId: ORG, status: 'PENDING', claimExpiresAt: expiresAt }, NOW),
      );
    }
    expect(claimExpired('PENDING', null, NOW)).toBe(true);
    expect(claimExpired('VERIFIED', null, NOW)).toBe(false);
  });
});

describe('connectWhatsAppErrors — o formulário recusa o que a API recusa', () => {
  const cases = [
    { phoneNumberId: '1234567890', businessAccountId: '', accessToken: 'fake-wa-owner:1234567890' },
    { phoneNumberId: '', businessAccountId: '', accessToken: 'token-longo-o-bastante' },
    { phoneNumberId: 'fake-phone-1', businessAccountId: '', accessToken: 'token-longo-o-bastante' },
    { phoneNumberId: '123', businessAccountId: 'abc', accessToken: 'token-longo-o-bastante' },
    { phoneNumberId: '123', businessAccountId: '456', accessToken: '' },
    { phoneNumberId: '123', businessAccountId: '', accessToken: 'curto' },
    { phoneNumberId: ' 123 ', businessAccountId: ' 456 ', accessToken: '  token-com-espaco  ' },
  ];

  it('mesmo veredito do contrato da API em cada caso', () => {
    for (const input of cases) {
      const body: Record<string, string> = {
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
      };
      if (input.businessAccountId.trim() !== '') body.businessAccountId = input.businessAccountId;
      const api = createWhatsAppConnectionRequestSchema.safeParse(body).success;
      const errors = connectWhatsAppErrors(input);
      expect(Object.keys(errors).length === 0, JSON.stringify(input)).toBe(api);
    }
  });

  it('mensagens por campo', () => {
    expect(
      connectWhatsAppErrors({ phoneNumberId: '', businessAccountId: '', accessToken: '' }),
    ).toEqual({
      phoneNumberId: 'Informe o ID do número (só dígitos)',
      accessToken: 'Informe o token de acesso da conta',
    });
  });
});
