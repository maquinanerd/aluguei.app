import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { extractIntentByRule } from '../whatsapp/intents.js';
import { readjustedRent } from './leaseLifecycle.js';
import * as money from './money.js';

/**
 * Teto dos valores em centavos (pendência da trilha G do G3, P2-12): R$ 1.000.000,00 por valor.
 * Com aluguel, condomínio e impostos no teto, a cobrança somada com multa e juros fica muito
 * abaixo do int4 da coluna.
 */
describe('teto dos centavos no domínio', () => {
  it('é R$ 1.000.000,00', () => {
    expect(money.MAX_AMOUNT_CENTS).toBe(100_000_000);
  });

  it('reajuste que passa do teto é recusado; no teto, aceito', () => {
    expect(readjustedRent(50_000_000, 10_000)).toBe(100_000_000);
    let error: unknown;
    try {
      readjustedRent(100_000_000, 1);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INVALID_INPUT');
  });

  it('orçamento acima do teto numa mensagem não vira valor; a intenção continua', () => {
    const huge = extractIntentByRule('quero um apartamento, pago até R$ 50.000.000 de aluguel');
    expect(huge.intent).toBe('PRICE_QUERY');
    expect(huge.budgetMaxCents).toBeNull();
    const between = extractIntentByRule('valor entre 2 mil e 900.000.000');
    expect(between.budgetMinCents).toBe(200_000);
    expect(between.budgetMaxCents).toBeNull();
    expect(extractIntentByRule('aluguel até R$ 3 mil').budgetMaxCents).toBe(300_000);
  });
});
