import fp from 'fastify-plugin';
import { getWhatsAppMessenger, getWhatsAppNumberVerifier } from '@aluguei/integrations';
import type {
  WhatsAppMessenger,
  WhatsAppNumberVerifier,
  WhatsAppNumberVerifierOptions,
  WhatsAppRegistryOptions,
} from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    whatsapp: WhatsAppMessenger | null;
    /** Prova de posse do número com o token da conexão (P1-18); null sem modo configurado. */
    whatsappVerifier: WhatsAppNumberVerifier | null;
  }
}

export interface WhatsAppPluginOptions {
  mode?: string;
  accessToken?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  messenger?: WhatsAppMessenger;
  verifier?: WhatsAppNumberVerifier;
}

/**
 * Registra `app.whatsapp` (Meta live com credenciais; fake em dev/test; null em prod sem creds) e
 * `app.whatsappVerifier` (Graph API em live, FAKE em dry_run, null sem modo).
 */
export const whatsappPlugin = fp<WhatsAppPluginOptions>((app, opts) => {
  const registryOptions: WhatsAppRegistryOptions = {};
  if (opts.messenger) {
    registryOptions.messenger = opts.messenger;
  }
  if (opts.mode) {
    registryOptions.mode = opts.mode;
  }
  if (opts.accessToken) {
    registryOptions.accessToken = opts.accessToken;
  }
  if (opts.phoneNumberId) {
    registryOptions.phoneNumberId = opts.phoneNumberId;
  }
  if (opts.verifyToken) {
    registryOptions.verifyToken = opts.verifyToken;
  }
  app.decorate('whatsapp', getWhatsAppMessenger(registryOptions));

  const verifierOptions: WhatsAppNumberVerifierOptions = {};
  if (opts.verifier) {
    verifierOptions.verifier = opts.verifier;
  }
  if (opts.mode) {
    verifierOptions.mode = opts.mode;
  }
  app.decorate('whatsappVerifier', getWhatsAppNumberVerifier(verifierOptions));
});
