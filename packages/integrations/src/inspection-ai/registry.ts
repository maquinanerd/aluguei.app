import { MockInspectionAiProvider } from './mock.js';
import { OpenAiInspectionAiProvider } from './openai.js';
import type { InspectionAiProvider } from './types.js';

export interface InspectionAiRegistryOptions {
  /** Override injetado (testes/dev) — tem prioridade máxima. */
  ai?: InspectionAiProvider;
  /** `mock` (padrão) | `openai`. Fallback para process.env.AI_PROVIDER. */
  provider?: string;
  /** Chave OpenAI. Fallback para process.env.OPENAI_API_KEY. */
  openAiKey?: string;
  /**
   * Busca de bytes da mídia por storageKey — obrigatório para o provider real
   * (transcrição/sugestão exigem o arquivo). Sem storage plugado → mock.
   */
  fetchMedia?: (input: { storageKey: string }) => Promise<Blob>;
}

/**
 * Seleciona o provider de IA de vistoria: override injetado > openai (chave +
 * storage plugado) > mock (padrão). Sem chave ou sem `fetchMedia` nunca
 * chamamos LLM externo — comportamento atual preservado.
 */
export function getInspectionAiProvider(
  opts: InspectionAiRegistryOptions = {},
): InspectionAiProvider {
  if (opts.ai) {
    return opts.ai;
  }
  const provider = opts.provider ?? process.env.AI_PROVIDER ?? 'mock';
  const openAiKey = opts.openAiKey ?? process.env.OPENAI_API_KEY;
  if (provider === 'openai' && openAiKey && opts.fetchMedia) {
    return new OpenAiInspectionAiProvider({ apiKey: openAiKey, fetchMedia: opts.fetchMedia });
  }
  return new MockInspectionAiProvider();
}
