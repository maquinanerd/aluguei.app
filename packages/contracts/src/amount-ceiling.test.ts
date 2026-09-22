import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT_CENTS,
  paymentWebhookEventSchema,
  prepareCampaignRequestSchema,
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
