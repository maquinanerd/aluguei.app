import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT_CENTS,
  MAX_SALE_AMOUNT_CENTS,
  paymentWebhookEventSchema,
  positiveAmountCentsSchema,
  prepareCampaignRequestSchema,
  saleAmountCentsSchema,
  updateBudgetRequestSchema,
} from './index.js';

/**
 * Teto dos centavos no contrato (pendência da trilha G do G3, P2-12). Os casos de rota estão em
 * tests/integration/src/teto-centavos.test.ts; aqui ficam os que não têm rota simples de exercitar.
 */
describe('teto dos centavos no contrato', () => {
  it('orçamento de campanha da Meta acima do teto é recusado; no teto, aceito', () => {
    expect(MAX_AMOUNT_CENTS).toBe(100_000_000);
    for (const schema of [updateBudgetRequestSchema, prepareCampaignRequestSchema]) {
      const shape = schema as unknown as {
        shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
      };
      for (const field of ['dailyBudgetCents', 'lifetimeBudgetCents']) {
        const fieldSchema = shape.shape[field];
        expect(fieldSchema, field).toBeDefined();
        expect(fieldSchema?.safeParse(MAX_AMOUNT_CENTS + 1).success, field).toBe(false);
        expect(fieldSchema?.safeParse(MAX_AMOUNT_CENTS).success, field).toBe(true);
      }
    }
  });

  it('valor do webhook de pagamento cabe no int4 da coluna', () => {
    const event = {
      provider: 'FAKE',
      eventType: 'PAYMENT_CONFIRMED',
      providerEventId: 'evt-1',
      providerChargeId: 'ch-1',
    };
    expect(
      paymentWebhookEventSchema.safeParse({ ...event, amountCents: 2_147_483_648 }).success,
    ).toBe(false);
    expect(
      paymentWebhookEventSchema.safeParse({ ...event, amountCents: 2_147_483_647 }).success,
    ).toBe(true);
  });
});

/**
 * Venda tem escala própria (Onda 5). O teto de aluguel — R$ 1.000.000,00 —
 * recusaria um apartamento de R$ 1,4 milhão, que é preço comum: com ele, a
 * frente de venda não sairia do lugar. Continua havendo teto, porque a coluna
 * `integer` do banco estoura em R$ 21.474.836,47 e isso viraria 500 em vez de
 * 400.
 */
describe('teto dos centavos de venda', () => {
  it('aceita preço de venda que o teto de aluguel recusaria', () => {
    const preco = 139_000_000; // R$ 1.390.000,00
    expect(() => saleAmountCentsSchema.parse(preco)).not.toThrow();
    expect(() => positiveAmountCentsSchema.parse(preco)).toThrow();
  });

  it('recusa acima do teto de venda e no limite aceita', () => {
    expect(() => saleAmountCentsSchema.parse(MAX_SALE_AMOUNT_CENTS)).not.toThrow();
    expect(() => saleAmountCentsSchema.parse(MAX_SALE_AMOUNT_CENTS + 1)).toThrow(
      /R\$ 20\.000\.000,00/,
    );
  });

  it('o teto de venda cabe no int4 da coluna', () => {
    expect(MAX_SALE_AMOUNT_CENTS).toBeLessThan(2_147_483_647);
  });
});
