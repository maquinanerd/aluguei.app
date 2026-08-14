import { extractIntentByRule } from '@aluguei/domain';
import type { AiProvider, IntentExtraction } from './types.js';

/**
 * Provider de IA mock: extração determinística por regras (regex) em pt-BR.
 * Sem rede; `extractedBy: 'RULE'`, confidence 1.0. Usado por padrão
 * (AI_PROVIDER=mock ou sem chave).
 */
export class MockAiProvider implements AiProvider {
  extractIntent(input: { text: string }): Promise<IntentExtraction> {
    return Promise.resolve(extractIntentByRule(input.text));
  }
}
