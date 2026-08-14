import { describe, expect, it } from 'vitest';
import {
  createMetaConnectionRequestSchema,
  metaWebhookEventSchema,
  prepareCampaignRequestSchema,
  updateBudgetRequestSchema,
} from './meta.js';

describe('contracts/meta', () => {
  it('prepareCampaign exige mídia, landing https e idempotencyKey', () => {
    const base = {
      connectionId: '11111111-1111-4111-8111-111111111111',
      propertyId: '22222222-2222-4222-8222-222222222222',
      name: 'Campanha Aluguel',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudgetCents: 1_000_00,
      mediaSelection: ['33333333-3333-4333-8333-333333333333'],
      landingUrl: 'https://aluguei.app/imovels/x',
      copyPrimary: 'Apartamento no centro',
      idempotencyKey: 'prep-abc-123',
    };
    expect(prepareCampaignRequestSchema.safeParse(base).success).toBe(true);
    // strict: campo extra rejeitado
    expect(prepareCampaignRequestSchema.safeParse({ ...base, extra: true }).success).toBe(false);
    // landing http rejeitada
    expect(
      prepareCampaignRequestSchema.safeParse({ ...base, landingUrl: 'http://x.com' }).success,
    ).toBe(false);
  });

  it('updateBudget exige ao menos um orçamento', () => {
    expect(updateBudgetRequestSchema.safeParse({ idempotencyKey: 'k-12345678' }).success).toBe(
      false,
    );
    expect(
      updateBudgetRequestSchema.safeParse({
        dailyBudgetCents: 1_000,
        idempotencyKey: 'k-12345678',
      }).success,
    ).toBe(true);
  });

  it('webhook valida providerEventId e aceita payload opcional', () => {
    const base = { provider: 'FAKE', eventType: 'AD_ACCOUNT_UPDATE', providerEventId: 'evt-1' };
    expect(metaWebhookEventSchema.safeParse(base).success).toBe(true);
    expect(metaWebhookEventSchema.safeParse({ ...base, providerEventId: '' }).success).toBe(false);
  });

  it('createMetaConnection rejeita campos extras', () => {
    expect(
      createMetaConnectionRequestSchema.safeParse({ provider: 'FAKE', token: 'segredo' }).success,
    ).toBe(false);
  });
});
