import fp from 'fastify-plugin';
import { getWhatsAppMessenger } from '@aluguei/integrations';
import type { WhatsAppMessenger, WhatsAppRegistryOptions } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    whatsapp: WhatsAppMessenger | null;
  }
}

export interface WhatsAppPluginOptions {
  mode?: string;
  accessToken?: string;
  phoneNumberId?: string;
  verifyToken?: string;
  messenger?: WhatsAppMessenger;
}

/** Registra `app.whatsapp` (Meta live com credenciais; fake em dev/test; null em prod sem creds). */
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
});
