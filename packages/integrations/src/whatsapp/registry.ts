import { FakeWhatsAppMessenger } from './fake.js';
import { MetaWhatsAppAdapter } from './meta.js';
import type { WhatsAppMessenger } from './types.js';

export interface WhatsAppRegistryOptions {
  mode?: string; // dry_run | live
  accessToken?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  messenger?: WhatsAppMessenger;
}
/**
 * Seleciona o messenger WhatsApp: override injetado > live (credenciais) > dry_run explícito →
 * fake. Live sem credencial, modo ausente ou desconhecido → null (auditoria 2026-09-10, P1-12:
 * o fake respondia fora de `live`). O padrão de desenvolvimento (`dry_run`) é decidido por quem
 * chama (`resolveMetaMode`), nunca aqui.
 */
export function getWhatsAppMessenger(opts: WhatsAppRegistryOptions = {}): WhatsAppMessenger | null {
  if (opts.messenger) {
    return opts.messenger;
  }
  if (opts.mode === 'live' && opts.accessToken && opts.phoneNumberId) {
    return new MetaWhatsAppAdapter({
      accessToken: opts.accessToken,
      phoneNumberId: opts.phoneNumberId,
      verifyToken: opts.verifyToken ?? '',
    });
  }
  if (opts.mode === 'dry_run') {
    return new FakeWhatsAppMessenger(opts.verifyToken ?? 'fake-verify-token');
  }
  return null;
}
