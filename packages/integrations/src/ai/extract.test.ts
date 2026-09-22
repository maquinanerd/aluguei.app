import { describe, expect, it } from 'vitest';
import { intentFromAiJson } from './extract.js';

/**
 * Orçamento acima do teto dos centavos (R$ 1.000.000,00, pendência da trilha G do G3) na resposta
 * do LLM estourava o INSERT da intenção e derrubava o job da mensagem. Fora do schema, a extração
 * da IA é descartada e o gateway usa as regras, que também não aceitam o valor.
 */
describe('extração de intenção pela IA: teto do orçamento', () => {
  it('orçamento acima do teto → fora do schema (o chamador cai nas regras)', () => {
    expect(
      intentFromAiJson(
        '{"intent": "PRICE_QUERY", "budgetMaxCents": 5000000000, "confidence": 0.9}',
      ),
    ).toBeNull();
    expect(
      intentFromAiJson('{"intent": "PRICE_QUERY", "budgetMinCents": 100000001, "confidence": 0.9}'),
    ).toBeNull();
  });

  it('no teto, o orçamento é aceito', () => {
    expect(
      intentFromAiJson('{"intent": "PRICE_QUERY", "budgetMaxCents": 100000000, "confidence": 0.9}')
        ?.budgetMaxCents,
    ).toBe(100_000_000);
  });
});
