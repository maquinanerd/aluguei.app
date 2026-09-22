import { extractIntentByRule, MAX_AMOUNT_CENTS } from '@aluguei/domain';
import { z } from 'zod';
import type { IntentExtraction, IntentKind } from './types.js';

/**
 * Schema zod do JSON que os LLMs devem retornar na extração de intenção.
 * Orçamento SEMPRE em centavos inteiros; datas em YYYY-MM-DD; campos ausentes
 * viram null (nunca inventar). Falha de schema → fallback determinístico.
 */
export const intentJsonSchema = z.object({
  intent: z.enum(['VISIT_REQUEST', 'PRICE_QUERY', 'AVAILABILITY', 'OTHER']),
  propertyCode: z.string().nullable().optional(),
  // Acima do teto dos centavos não é orçamento de aluguel: fora do schema, o gateway usa as regras.
  budgetMinCents: z.number().int().nonnegative().max(MAX_AMOUNT_CENTS).nullable().optional(),
  budgetMaxCents: z.number().int().nonnegative().max(MAX_AMOUNT_CENTS).nullable().optional(),
  moveInDate: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type IntentJson = z.infer<typeof intentJsonSchema>;

/**
 * Prompt de sistema pt-BR da extração de intenção (WhatsApp). Instrui JSON
 * puro, conversão de reais→centavos, datas resolvíveis e nunca inventar.
 * Não contém PII (o texto do usuário vai no message user).
 */
export const INTENT_SYSTEM_PROMPT = [
  'Você é um assistente de extração de intenção de mensagens de interessados em imóveis para aluguel (pt-BR).',
  'Responda SOMENTE com um objeto JSON válido, sem texto extra e sem markdown, no formato:',
  '{ "intent": "...", "propertyCode": "...", "budgetMinCents": 0, "budgetMaxCents": 0, "moveInDate": "YYYY-MM-DD", "confidence": 0.0 }',
  'intent: um de "VISIT_REQUEST" (pedido de visita), "PRICE_QUERY" (pergunta de preço/aluguel/condições), "AVAILABILITY" (pergunta de disponibilidade) ou "OTHER".',
  'propertyCode: código do imóvel citado (ex.: "APT123"), ou null.',
  'budgetMinCents / budgetMaxCents: orçamento em CENTAVOS inteiros (R$ 3 mil → 300000; "até R$ 2.500" → 250000), ou null.',
  'moveInDate: data de mudança em YYYY-MM-DD resolvendo "hoje"/"amanhã" pela data de hoje informada, ou null se não houver data.',
  'confidence: número de 0 a 1 com sua confiança.',
  'Regras: NÃO invente valores ausentes na mensagem (use null). Não responda à mensagem, apenas extraia. Não inclua PII além do texto recebido.',
].join('\n');

/** Mensagem de usuário: contexto de data (para "hoje"/"amanhã") + texto bruto. */
export function buildIntentUserMessage(text: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Hoje é ${today}. Mensagem do interessado: ${text}`;
}

/**
 * Extrai o primeiro JSON (objeto ou array) de um texto. Tenta o texto limpo
 * integral primeiro (cobre arrays/objetos) e, se falhar, isola o primeiro
 * objeto `{...}` (tolera fences de markdown e ruído).
 */
export function extractJsonObject(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '');
  if (cleaned) {
    try {
      return JSON.parse(cleaned) as unknown;
    } catch {
      // tenta o recorte de objeto abaixo
    }
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/**
 * Converte o conteúdo textual do LLM em `IntentExtraction` (`extractedBy: 'AI'`).
 * JSON ausente/inválido ou fora do schema → null (o chamador faz fallback às regras).
 */
export function intentFromAiJson(raw: string): IntentExtraction | null {
  const json = extractJsonObject(raw);
  if (json === null) {
    return null;
  }
  const parsed = intentJsonSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  const data = parsed.data;
  return {
    intent: data.intent as IntentKind,
    propertyCode: data.propertyCode ?? null,
    budgetMinCents: data.budgetMinCents ?? null,
    budgetMaxCents: data.budgetMaxCents ?? null,
    moveInDate: data.moveInDate ?? null,
    confidence: data.confidence ?? 0.8,
    extractedBy: 'AI',
  };
}

/** Fallback determinístico (mesmas regras do mock) — nunca quebra o atendimento. */
export function fallbackIntentByRule(text: string): IntentExtraction {
  return extractIntentByRule(text);
}
