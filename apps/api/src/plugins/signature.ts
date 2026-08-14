import fp from 'fastify-plugin';
import { getSignatureProvider } from '@aluguei/integrations';
import type { ISignatureProvider } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    signature: ISignatureProvider | null;
  }
}

export interface SignaturePluginOptions {
  provider?: string;
  token?: string;
  signature?: ISignatureProvider;
}

/** Registra `app.signature` (FAKE em dev/test; null em prod sem token — nunca assinatura fake). */
export const signaturePlugin = fp<SignaturePluginOptions>((app, opts) => {
  const options: Parameters<typeof getSignatureProvider>[0] = {};
  if (opts.signature) {
    options.fake = opts.signature;
  }
  if (opts.provider) {
    options.provider = opts.provider;
  }
  if (opts.token) {
    options.token = opts.token;
  }
  app.decorate('signature', getSignatureProvider(options));
});
