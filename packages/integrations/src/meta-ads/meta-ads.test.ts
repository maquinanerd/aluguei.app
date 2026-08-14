import { describe, expect, it } from 'vitest';
import { decryptSecret, digestInput, encryptSecret } from '@aluguei/config';
import { FakeMetaAdsProvider, getMetaAdsProvider } from '../index.js';

const ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex (teste)

describe('meta-ads/fake', () => {
  it('IDs determinísticos e árvore PAUSADA', async () => {
    const provider = new FakeMetaAdsProvider();
    const campaign = await provider.createCampaign({
      name: 'C1',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 1_000,
    });
    const campaign2 = await provider.createCampaign({
      name: 'C1',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 1_000,
    });
    expect(campaign.providerCampaignId).toBe(campaign2.providerCampaignId);
    expect(provider.getCampaignStatus(campaign.providerCampaignId)).toBe('PAUSED');
  });

  it('getInsights retorna spend em centavos e métricas sintéticas', async () => {
    const provider = new FakeMetaAdsProvider();
    const insights = await provider.getInsights('cmp-1', {
      dateStart: '2026-08-01',
      dateEnd: '2026-08-14',
    });
    expect(insights.spendCents).toBeGreaterThan(0);
    expect(insights.impressions).toBeGreaterThan(0);
    expect(Number.isInteger(insights.spendCents)).toBe(true);
  });

  it('failNext injeta falha', () => {
    const provider = new FakeMetaAdsProvider();
    provider.failNextCall();
    expect(() => provider.testConnection()).toThrow('falha injetada');
  });
});

describe('meta-ads/registry', () => {
  it('dev/test sem opções → fake', () => {
    expect(getMetaAdsProvider({ mode: 'dry_run' })).toBeInstanceOf(FakeMetaAdsProvider);
  });

  it('live sem credencial → null (nunca simula em prod)', () => {
    expect(getMetaAdsProvider({ mode: 'live' })).toBeNull();
  });

  it('override injetado tem precedência', () => {
    const fake = new FakeMetaAdsProvider();
    expect(getMetaAdsProvider({ mode: 'live', accessToken: 'x', fake })).toBe(fake);
  });
});

describe('config/secrets', () => {
  it('roundtrip AES-256-GCM', () => {
    const encrypted = encryptSecret('EAAG-token-super-secreto', ENCRYPTION_KEY);
    expect(encrypted.value).not.toContain('EAAG');
    expect(decryptSecret(encrypted, ENCRYPTION_KEY)).toBe('EAAG-token-super-secreto');
  });

  it('chave inválida lança', () => {
    expect(() => encryptSecret('x', 'curta')).toThrow('META_TOKEN_ENCRYPTION_KEY');
  });

  it('digest é não reversível e estável', () => {
    expect(digestInput('input')).toBe(digestInput('input'));
    expect(digestInput('input')).toHaveLength(64);
    expect(digestInput('input')).not.toContain('input');
  });
});
