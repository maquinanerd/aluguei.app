import { MockAiProvider } from './mock.js';
import type { AiProvider } from './types.js';

export interface AiRegistryOptions {
  provider?: string;
  openAiKey?: string;
  geminiKey?: string;
  ai?: AiProvider;
}
/**
 * Seleciona o provider de IA: override injetado > mock (padrão).
 * Adapters OpenAI/Gemini reais ficam como gancho futuro — sem chave nunca
 * chamamos LLM externo (IMPLEMENTED_NOT_LIVE_VERIFIED quando implementado).
 */
export function getAiProvider(opts: AiRegistryOptions = {}): AiProvider {
  if (opts.ai) {
    return opts.ai;
  }
  const provider = opts.provider ?? 'mock';
  if (provider !== 'mock' && !opts.openAiKey && !opts.geminiKey) {
    return new MockAiProvider();
  }
  return new MockAiProvider();
}
