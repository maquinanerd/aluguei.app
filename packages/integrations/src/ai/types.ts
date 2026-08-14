export type IntentKind = 'VISIT_REQUEST' | 'PRICE_QUERY' | 'AVAILABILITY' | 'OTHER';

export interface IntentExtraction {
  intent: IntentKind;
  propertyCode: string | null;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  moveInDate: string | null;
  confidence: number;
  extractedBy: 'AI' | 'RULE';
}

export interface AiProvider {
  /** Extrai intenção estruturada de um texto. Recebe apenas o texto (PII mínima). */
  extractIntent(input: { text: string }): Promise<IntentExtraction>;
}
