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
 * Seleciona o messenger WhatsApp: override injetado > live (credenciais) >
 * produção sem credenciais → null (nunca simula envio em prod) > dev/test → fake.
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
  if (opts.mode === 'live') {
    return null; // produção sem credencial: nunca enviar por canal fake
  }
  return new FakeWhatsAppMessenger(opts.verifyToken ?? 'fake-verify-token');
}
