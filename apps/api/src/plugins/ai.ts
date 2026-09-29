import fp from 'fastify-plugin';
import { getAiProvider, getAudioAiProvider } from '@aluguei/integrations';
import type {
  AiProvider,
  AiRegistryOptions,
  AudioAiProvider,
  AudioAiRegistryOptions,
} from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    ai: AiProvider;
    /** Transcritor de áudio, ou `null` quando a retenção zero não foi declarada. */
    audioAi: AudioAiProvider | null;
  }
}

export interface AiPluginOptions {
  provider?: string;
  openAiKey?: string;
  geminiKey?: string;
  ai?: AiProvider;
  /** `AI_AUDIO_RETENTION`; só `ZERO` liga o cadastro por áudio (ADR-104). */
  audioRetention?: string;
  audioProvider?: string;
  audio?: AudioAiProvider;
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

  // A trava do ADR-104 mora no registro: aqui só passamos o que foi declarado.
  const audioOptions: AudioAiRegistryOptions = {};
  if (opts.audio) {
    audioOptions.audio = opts.audio;
  }
  if (opts.audioRetention !== undefined) {
    audioOptions.retention = opts.audioRetention;
  }
  if (opts.audioProvider !== undefined) {
    audioOptions.provider = opts.audioProvider;
  }
  app.decorate('audioAi', getAudioAiProvider(audioOptions).provider);
});
