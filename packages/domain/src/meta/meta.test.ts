import { describe, expect, it } from 'vitest';
import {
  containsPii,
  validateAdMaterial,
  validateBudget,
  validateHousingTargeting,
  createPausedCampaign,
  publishCampaign,
  transitionAdProfile,
  transitionCampaign,
} from '../index.js';
import type { MetaFlowProvider } from '../meta/campaignFlow.js';
import { DomainError } from '../errors.js';

describe('meta/housing', () => {
  it('rejeita targeting por gênero em HOUSING', () => {
    const result = validateHousingTargeting({ genders: [1] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('gênero');
  });

  it('rejeita idade máxima (discriminatória em moradia)', () => {
    const result = validateHousingTargeting({ ageMax: 35 });
    expect(result.valid).toBe(false);
  });

  it('rejeita audiências customizadas', () => {
    const result = validateHousingTargeting({ customAudiences: ['abc'] });
    expect(result.valid).toBe(false);
  });

  it('rejeita geo fora da área permitida da org', () => {
    const result = validateHousingTargeting({ geos: [{ key: 'COUNTRY:BR' }] }, [
      { key: 'COUNTRY:PT' },
    ]);
    expect(result.valid).toBe(false);
  });

  it('aceita targeting compatível (geo permitida, sem restrições)', () => {
    const result = validateHousingTargeting({ geos: [{ key: 'COUNTRY:BR' }] }, [
      { key: 'COUNTRY:BR' },
    ]);
    expect(result.valid).toBe(true);
  });
});

describe('meta/adMaterial', () => {
  const base = {
    propertyId: 'p1',
    propertyStatus: 'ACTIVE',
    listingStatus: 'PUBLISHED',
    landingUrl: 'https://aluguei.app/imovels/p1',
    mediaSelection: ['m1'],
    mediaRows: [{ id: 'm1', propertyId: 'p1', kind: 'PHOTO', isPublic: true }],
    copyPrimary: 'Apartamento 2 quartos próximo ao metrô',
  };

  it('aceita material válido', () => {
    expect(validateAdMaterial(base).valid).toBe(true);
  });

  it('rejeita listing não publicável', () => {
    const result = validateAdMaterial({ ...base, listingStatus: 'DRAFT' });
    expect(result.valid).toBe(false);
  });

  it('rejeita mídia privada/não foto (vistoria excluída por construção)', () => {
    const result = validateAdMaterial({
      ...base,
      mediaRows: [{ id: 'm1', propertyId: 'p1', kind: 'PHOTO', isPublic: false }],
    });
    expect(result.valid).toBe(false);
    const doc = validateAdMaterial({
      ...base,
      mediaRows: [{ id: 'm1', propertyId: 'p1', kind: 'DOCUMENT', isPublic: true }],
    });
    expect(doc.valid).toBe(false);
  });

  it('rejeita copy com PII (CPF)', () => {
    expect(containsPii('Falar com João 529.982.247-25', [])).toBe(true);
  });

  it('rejeita copy com nome completo do proprietário', () => {
    const result = validateAdMaterial({
      ...base,
      copyPrimary: 'Fale com Maria da Silva para agendar visita',
      ownerName: 'Maria da Silva',
    });
    expect(result.valid).toBe(false);
  });
});

describe('meta/budget', () => {
  const limits = { maxDailyBudgetCents: 10_000_00, maxLifetimeBudgetCents: 100_000_00 };

  it('exige XOR daily/lifetime', () => {
    expect(validateBudget({ limits }).valid).toBe(false);
    expect(
      validateBudget({ dailyBudgetCents: 1_000, lifetimeBudgetCents: 2_000, limits }).valid,
    ).toBe(false);
  });

  it('aceita daily dentro do limite', () => {
    const result = validateBudget({ dailyBudgetCents: 5_000_00, limits });
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('DAILY');
    expect(result.effectiveBudgetCents).toBe(5_000_00);
  });

  it('rejeita acima do limite da org', () => {
    expect(validateBudget({ dailyBudgetCents: 99_000_00, limits }).valid).toBe(false);
  });
});

describe('meta/stateMachine', () => {
  it('AdProfile: PREPARED → CREATED → PUBLISHED → PAUSED', () => {
    expect(transitionAdProfile('PREPARED', 'CREATED')).toBe('CREATED');
    expect(transitionAdProfile('CREATED', 'PUBLISHED')).toBe('PUBLISHED');
    expect(transitionAdProfile('PUBLISHED', 'PAUSED')).toBe('PAUSED');
  });

  it('nunca cria ACTIVE direto de DRAFT/PREPARED (ações de runtime)', () => {
    expect(transitionCampaign('CREATED_PAUSED', 'ACTIVE')).toBe('ACTIVE');
    expect(() => transitionCampaign('PAUSED', 'CREATED_PAUSED')).toThrow(DomainError);
  });
});

describe('meta/campaignFlow', () => {
  function fakeProvider(): MetaFlowProvider & { statuses: Record<string, string> } {
    const statuses: Record<string, string> = {};
    let n = 0;
    return {
      statuses,
      createCampaign() {
        return Promise.resolve({ providerCampaignId: `cmp-${String(++n)}` });
      },
      createAdSet() {
        return Promise.resolve({ providerAdsetId: `as-${String(++n)}` });
      },
      createCreative() {
        return Promise.resolve({ providerCreativeId: `cr-${String(++n)}` });
      },
      createAd() {
        return Promise.resolve({ providerAdId: `ad-${String(++n)}` });
      },
      setCampaignStatus(id, status) {
        statuses[id] = status;
        return Promise.resolve();
      },
      updateCampaignBudget() {
        return Promise.resolve();
      },
      updateSchedule() {
        return Promise.resolve();
      },
      updateCreative() {
        return Promise.resolve();
      },
      archiveCampaign() {
        return Promise.resolve();
      },
      getInsights() {
        return Promise.resolve({ impressions: 100, spendCents: 1_000 });
      },
    };
  }

  it('cria árvore PAUSADA e publica apenas por ação explícita', async () => {
    const provider = fakeProvider();
    const result = await createPausedCampaign(provider, {
      campaign: {
        name: 'C1',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 1_000,
      },
      adset: { name: 'A1', targeting: { geos: [] }, budgetCents: 1_000 },
      creative: {
        name: 'CR1',
        mediaRefs: ['m1'],
        copyPrimary: 'Copy',
        landingUrl: 'https://x',
        mediaHash: 'h1',
      },
    });
    expect(result.providerCampaignId).toBeTruthy();
    expect(result.providerAdId).toBeTruthy();
    expect(provider.statuses[result.providerCampaignId ?? '']).toBeUndefined(); // nenhum ACTIVE

    await publishCampaign(provider, result.providerCampaignId ?? '');
    expect(provider.statuses[result.providerCampaignId ?? '']).toBe('ACTIVE');
  });
});
