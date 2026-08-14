import fp from 'fastify-plugin';
import { getAiProvider } from '@aluguei/integrations';
import type { AiProvider, AiRegistryOptions } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    ai: AiProvider;
  }
}

export interface AiPluginOptions {
  provider?: string;
  openAiKey?: string;
  geminiKey?: string;
  ai?: AiProvider;
}

/** Registra `app.ai` (mock por padrão; gancho para LLM real sem chave → mock). */
export const aiPlugin = fp<AiPluginOptions>((app, opts) => {
  const registryOptions: AiRegistryOptions = {};
  if (opts.ai) {
    registryOptions.ai = opts.ai;
  }
  if (opts.provider) {
    registryOptions.provider = opts.provider;
  }
  if (opts.openAiKey) {
    registryOptions.openAiKey = opts.openAiKey;
  }
  if (opts.geminiKey) {
    registryOptions.geminiKey = opts.geminiKey;
  }
  app.decorate('ai', getAiProvider(registryOptions));
});
