/** Contrato do provider Meta Marketing API (sem tokens nos retornos). */

export interface MetaCampaignInput {
  name: string;
  objective: string;
  specialAdCategories: string[];
  dailyBudgetCents?: number | null;
  lifetimeBudgetCents?: number | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface MetaAdSetInput {
  name: string;
  targeting: Record<string, unknown>;
  budgetCents: number;
  startAt?: string | null;
  endAt?: string | null;
}

export interface MetaCreativeInput {
  name: string;
  mediaRefs: string[];
  copyPrimary: string;
  landingUrl: string;
  mediaHash: string;
}

export interface MetaAssetInfo {
  kind: 'AD_ACCOUNT' | 'PAGE' | 'INSTAGRAM_ACCOUNT' | 'BUSINESS';
  providerAssetId: string;
  name: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface MetaConnectionTestResult {
  ok: boolean;
  providerUserId?: string;
  scopes?: string[];
  error?: string;
}

export interface MetaInsights {
  impressions?: number;
  reach?: number;
  spendCents?: number;
  clicks?: number;
  linkClicks?: number;
  ctr?: number;
  cpcCents?: number;
  cpmCents?: number;
  frequency?: number;
  leads?: number;
  costPerLeadCents?: number;
}

/**
 * Adapter Meta Marketing API. O token fica no backend (nunca no LLM);
 * tools recebem apenas IDs locais.
 */
export interface IMetaAdsProvider {
  testConnection(): Promise<MetaConnectionTestResult>;
  listAssets(): Promise<MetaAssetInfo[]>;
  createCampaign(input: MetaCampaignInput): Promise<{ providerCampaignId: string }>;
  createAdSet(
    providerCampaignId: string,
    input: MetaAdSetInput,
  ): Promise<{ providerAdsetId: string }>;
  createCreative(input: MetaCreativeInput): Promise<{ providerCreativeId: string }>;
  createAd(providerAdsetId: string, providerCreativeId: string): Promise<{ providerAdId: string }>;
  setCampaignStatus(providerCampaignId: string, status: 'PAUSED' | 'ACTIVE'): Promise<void>;
  updateCampaignBudget(
    providerCampaignId: string,
    budget: { dailyBudgetCents?: number | null; lifetimeBudgetCents?: number | null },
  ): Promise<void>;
  updateSchedule(
    providerCampaignId: string,
    schedule: { startAt?: string | null; endAt?: string | null },
  ): Promise<void>;
  updateCreative(
    providerCreativeId: string,
    input: Pick<MetaCreativeInput, 'mediaRefs' | 'copyPrimary' | 'landingUrl'>,
  ): Promise<void>;
  archiveCampaign(providerCampaignId: string): Promise<void>;
  getInsights(
    providerCampaignId: string,
    range: { dateStart: string; dateEnd: string },
  ): Promise<Record<string, unknown>>;
}
