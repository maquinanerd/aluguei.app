import { describe, expect, it } from 'vitest';
import { extractIntentByRule } from './intents.js';

describe('extractIntentByRule', () => {
  it('detecta VISIT_REQUEST', () => {
    const result = extractIntentByRule('quero agendar uma visita amanhã');
    expect(result.intent).toBe('VISIT_REQUEST');
    expect(result.moveInDate).toBeTruthy();
  });

  it('detecta PRICE_QUERY com orçamento', () => {
    const result = extractIntentByRule('qual o preço? até 3 mil');
    expect(result.intent).toBe('PRICE_QUERY');
    expect(result.budgetMaxCents).toBe(300000);
  });

  it('detecta AVAILABILITY', () => {
    const result = extractIntentByRule('o imóvel está disponível?');
    expect(result.intent).toBe('AVAILABILITY');
  });

  it('fallback para OTHER', () => {
    const result = extractIntentByRule('oi, tudo bem?');
    expect(result.intent).toBe('OTHER');
    expect(result.extractedBy).toBe('RULE');
  });

  it('extrai data dd/mm', () => {
    const result = extractIntentByRule('visita dia 15/08');
    expect(result.moveInDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
