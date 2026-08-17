import { GeminiAiProvider } from './gemini.js';
import { MockAiProvider } from './mock.js';
import { OpenAiAiProvider } from './openai.js';
import type { AiProvider } from './types.js';

export interface AiRegistryOptions {
  /** `mock` (padrão) | `openai` | `gemini`. Fallback para process.env.AI_PROVIDER. */
  provider?: string;
  /** Chave OpenAI. Fallback para process.env.OPENAI_API_KEY. */
  openAiKey?: string;
  /** Chave Gemini. Fallback para process.env.GEMINI_API_KEY. */
  geminiKey?: string;
  /** Override injetado (testes/dev) — tem prioridade máxima. */
  ai?: AiProvider;
}

/**
 * Seleciona o provider de IA: override injetado > provider configurado com
 * chave (openai/gemini) > mock (padrão). Sem chave nunca chamamos LLM externo
 * — o comportamento atual (mock) é preservado. Chaves vêm de env
 * (AI_PROVIDER / OPENAI_API_KEY / GEMINI_API_KEY) ou das opções.
 */
export function getAiProvider(opts: AiRegistryOptions = {}): AiProvider {
  if (opts.ai) {
    return opts.ai;
  }
  const provider = opts.provider ?? process.env.AI_PROVIDER ?? 'mock';
  const openAiKey = opts.openAiKey ?? process.env.OPENAI_API_KEY;
  const geminiKey = opts.geminiKey ?? process.env.GEMINI_API_KEY;
  if (provider === 'openai' && openAiKey) {
    return new OpenAiAiProvider({ apiKey: openAiKey });
  }
  if (provider === 'gemini' && geminiKey) {
    return new GeminiAiProvider({ apiKey: geminiKey });
  }
  return new MockAiProvider();
}
