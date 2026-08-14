import { createHash } from 'node:crypto';
import type {
  IMetaAdsProvider,
  MetaAdSetInput,
  MetaAssetInfo,
  MetaCampaignInput,
  MetaConnectionTestResult,
  MetaCreativeInput,
} from './types.js';

function deterministicId(prefix: string, salt: string): string {
  return `${prefix}.fake.${createHash('sha256').update(salt).digest('hex').slice(0, 12)}`;
}

/**
 * Provider mock determinístico do Meta Ads (dev/test, META_MODE=dry_run).
 * IDs determinísticos por hash; insights sintéticos; falha injetável.
 */
export class FakeMetaAdsProvider implements IMetaAdsProvider {
  private readonly statuses = new Map<string, string>();
  private failNext = false;

  failNextCall(): void {
    this.failNext = true;
  }

  private maybeFail(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('FakeMetaAdsProvider: falha injetada');
    }
  }

  testConnection(): Promise<MetaConnectionTestResult> {
    this.maybeFail();
    return Promise.resolve({
      ok: true,
      providerUserId: 'fake-user-1',
      scopes: ['ads_management', 'ads_read'],
    });
  }

  listAssets(): Promise<MetaAssetInfo[]> {
    this.maybeFail();
    return Promise.resolve([
      {
        kind: 'AD_ACCOUNT',
        providerAssetId: 'act_fake_1',
        name: 'Conta Fake 1',
        status: 'ACTIVE',
        metadata: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
      },
      { kind: 'PAGE', providerAssetId: 'page_fake_1', name: 'Imobiliária Fake', status: 'ACTIVE' },
      {
        kind: 'INSTAGRAM_ACCOUNT',
        providerAssetId: 'ig_fake_1',
        name: '@imobiliariake',
        status: 'ACTIVE',
      },
      { kind: 'BUSINESS', providerAssetId: 'biz_fake_1', name: 'Business Fake', status: 'ACTIVE' },
    ]);
  }

  createCampaign(input: MetaCampaignInput): Promise<{ providerCampaignId: string }> {
    this.maybeFail();
    const id = deterministicId(
      'cmp',
      `${input.name}:${input.objective}:${String(input.dailyBudgetCents ?? input.lifetimeBudgetCents)}`,
    );
    this.statuses.set(id, 'PAUSED');
    return Promise.resolve({ providerCampaignId: id });
  }

  createAdSet(
    providerCampaignId: string,
    input: MetaAdSetInput,
  ): Promise<{ providerAdsetId: string }> {
    this.maybeFail();
    const id = deterministicId(
      'as',
      `${providerCampaignId}:${input.name}:${String(input.budgetCents)}`,
    );
    this.statuses.set(id, 'PAUSED');
    return Promise.resolve({ providerAdsetId: id });
  }

  createCreative(input: MetaCreativeInput): Promise<{ providerCreativeId: string }> {
    this.maybeFail();
    const id = deterministicId(
      'cr',
      `${input.name}:${input.mediaHash}:${input.copyPrimary.slice(0, 32)}`,
    );
    this.statuses.set(id, 'PAUSED');
    return Promise.resolve({ providerCreativeId: id });
  }

  createAd(providerAdsetId: string, providerCreativeId: string): Promise<{ providerAdId: string }> {
    this.maybeFail();
    const id = deterministicId('ad', `${providerAdsetId}:${providerCreativeId}`);
    this.statuses.set(id, 'PAUSED');
    return Promise.resolve({ providerAdId: id });
  }

  setCampaignStatus(providerCampaignId: string, status: 'PAUSED' | 'ACTIVE'): Promise<void> {
    this.maybeFail();
    this.statuses.set(providerCampaignId, status);
    return Promise.resolve();
  }

  updateCampaignBudget(
    providerCampaignId: string,
    _budget: { dailyBudgetCents?: number | null; lifetimeBudgetCents?: number | null },
  ): Promise<void> {
    this.maybeFail();
    this.statuses.set(
      providerCampaignId,
      `${this.statuses.get(providerCampaignId) ?? 'PAUSED'}:budget-updated`,
    );
    return Promise.resolve();
  }

  updateSchedule(
    providerCampaignId: string,
    _schedule: { startAt?: string | null; endAt?: string | null },
  ): Promise<void> {
    this.maybeFail();
    this.statuses.set(
      providerCampaignId,
      `${this.statuses.get(providerCampaignId) ?? 'PAUSED'}:schedule-updated`,
    );
    return Promise.resolve();
  }

  updateCreative(
    providerCreativeId: string,
    _input: Pick<MetaCreativeInput, 'mediaRefs' | 'copyPrimary' | 'landingUrl'>,
  ): Promise<void> {
    this.maybeFail();
    this.statuses.set(
      providerCreativeId,
      `${this.statuses.get(providerCreativeId) ?? 'PAUSED'}:creative-updated`,
    );
    return Promise.resolve();
  }

  archiveCampaign(providerCampaignId: string): Promise<void> {
    this.maybeFail();
    this.statuses.set(providerCampaignId, 'ARCHIVED');
    return Promise.resolve();
  }

  getInsights(
    providerCampaignId: string,
    range: { dateStart: string; dateEnd: string },
  ): Promise<Record<string, unknown>> {
    this.maybeFail();
    const seed = `${providerCampaignId}:${range.dateStart}:${range.dateEnd}`;
    const hash = createHash('sha256').update(seed).digest('hex');
    const spendCents = 1_000 + (parseInt(hash.slice(0, 4), 16) % 9_000); // R$10–R$100
    const impressions = 1_000 + (parseInt(hash.slice(4, 8), 16) % 50_000);
    const clicks = Math.floor(impressions / 100);
    return Promise.resolve({
      impressions,
      reach: Math.floor(impressions * 0.8),
      spendCents,
      clicks,
      linkClicks: Math.floor(clicks * 0.6),
      ctr: clicks / impressions,
      cpcCents: clicks > 0 ? Math.floor(spendCents / clicks) : 0,
      cpmCents: impressions > 0 ? Math.floor((spendCents * 1000) / impressions) : 0,
      frequency: 1.2,
      leads: Math.floor(clicks / 10),
      costPerLeadCents: Math.floor(spendCents / Math.max(1, Math.floor(clicks / 10))),
    });
  }

  getCampaignStatus(providerCampaignId: string): string | undefined {
    return this.statuses.get(providerCampaignId);
  }
}
