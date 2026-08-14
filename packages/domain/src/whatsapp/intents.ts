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

const INTENT_RULES: Array<{ kind: IntentKind; pattern: RegExp }> = [
  {
    kind: 'VISIT_REQUEST',
    pattern:
      /\b(visitar|visita|agendar|agenda|quero conhecer|conhecer o imóvel|posso ver|quero ver|marcar)\b/i,
  },
  {
    kind: 'PRICE_QUERY',
    pattern: /\b(preço|preco|aluguel|valor|quanto custa|quanto é|quanto e|condições|condicoes)\b/i,
  },
  { kind: 'AVAILABILITY', pattern: /\b(disponível|disponivel|disponibilidade|livre|ocupado)\b/i },
];

const BUDGET_RULES: Array<{ min: number | null; max: number | null; pattern: RegExp }> = [
  { min: 0, max: 100_000, pattern: /ate\s*(?:r\$\s*)?([\d.,]+)\s*(mil|k)?/i },
  {
    min: 100_000,
    max: 150_000,
    pattern: /entre\s*(?:r\$\s*)?([\d.,]+)\s*(mil|k)?\s*e\s*(?:r\$\s*)?([\d.,]+)\s*(mil|k)?/i,
  },
  { min: null, max: null, pattern: /r\$\s*([\d.,]+)\s*(mil|k)?/i },
];

const DATE_RULES: Array<(text: string, today: Date) => string | null> = [
  (text) => {
    const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (!match) {
      return null;
    }
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] ? Number(match[3]) : undefined;
    const date = new Date(year ?? 2000, month - 1, day);
    if (year === undefined) {
      date.setFullYear(new Date().getFullYear());
    }
    return date.toISOString().slice(0, 10);
  },
  (text, today) => {
    if (/\bhoje\b/i.test(text)) {
      return today.toISOString().slice(0, 10);
    }
    return null;
  },
  (text, today) => {
    if (/\bamanhã\b|\bamanha\b/i.test(text)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow.toISOString().slice(0, 10);
    }
    return null;
  },
];

function parseBudgetValue(raw: string, hasMil: boolean): number | null {
  const digits = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(digits)) {
    return null;
  }
  const value = hasMil ? digits * 1000 : digits;
  if (value > 10_000) {
    return Math.round(value * 100); // valor em reais → centavos
  }
  return Math.round(value * 100); // já em reais → centavos
}

/**
 * Extração determinística por regras (mock de IA): intenção, orçamento e data.
 * Nunca acessa rede; `extractedBy: 'RULE'`.
 */
export function extractIntentByRule(text: string, today = new Date()): IntentExtraction {
  const clean = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const result: IntentExtraction = {
    intent: 'OTHER',
    propertyCode: null,
    budgetMinCents: null,
    budgetMaxCents: null,
    moveInDate: null,
    confidence: 1,
    extractedBy: 'RULE',
  };

  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(clean)) {
      result.intent = rule.kind;
      break;
    }
  }

  for (const budget of BUDGET_RULES) {
    const match = clean.match(budget.pattern);
    if (match) {
      if (budget.pattern.source.includes('entre')) {
        const min = parseBudgetValue(match[1] ?? '', Boolean(match[2]));
        const max = parseBudgetValue(match[3] ?? '', Boolean(match[4]));
        result.budgetMinCents = min;
        result.budgetMaxCents = max;
      } else if (budget.pattern.source.includes('até')) {
        result.budgetMaxCents = parseBudgetValue(match[1] ?? '', Boolean(match[2]));
      } else {
        result.budgetMaxCents = parseBudgetValue(match[1] ?? '', Boolean(match[2]));
      }
      break;
    }
  }

  for (const dateRule of DATE_RULES) {
    const parsed = dateRule(clean, today);
    if (parsed) {
      result.moveInDate = parsed;
      break;
    }
  }

  return result;
}
