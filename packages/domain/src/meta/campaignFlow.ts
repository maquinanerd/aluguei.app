/**
 * Orquestração pura do fluxo imóvel → anúncio (docs/META_MCP.md).
 *
 * Provider e persistência são injetados (interfaces mínimas) para manter o
 * domínio testável sem DB/SDK. A regra de negócio vive aqui; o MCP/API apenas
 * conecta entrada/saída.
 */

import { DomainError } from '../errors.js';

export interface FlowCampaignInput {
  name: string;
  objective: string;
  specialAdCategories: string[];
  dailyBudgetCents?: number | null;
  lifetimeBudgetCents?: number | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface FlowAdSetInput {
  name: string;
  targeting: Record<string, unknown>;
  budgetCents: number;
  startAt?: string | null;
  endAt?: string | null;
}

export interface FlowCreativeInput {
  name: string;
  mediaRefs: string[];
  copyPrimary: string;
  landingUrl: string;
  mediaHash: string;
}

/** Interface mínima do provider Meta (implementada pelo adapter/fake). */
export interface MetaFlowProvider {
  createCampaign(input: FlowCampaignInput): Promise<{ providerCampaignId: string }>;
  createAdSet(
    providerCampaignId: string,
    input: FlowAdSetInput,
  ): Promise<{ providerAdsetId: string }>;
  createCreative(input: FlowCreativeInput): Promise<{ providerCreativeId: string }>;
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
    input: Pick<FlowCreativeInput, 'mediaRefs' | 'copyPrimary' | 'landingUrl'>,
  ): Promise<void>;
  archiveCampaign(providerCampaignId: string): Promise<void>;
  getInsights(
    providerCampaignId: string,
    range: { dateStart: string; dateEnd: string },
  ): Promise<Record<string, unknown>>;
}

export interface FlowResult {
  providerCampaignId?: string;
  providerAdsetId?: string;
  providerCreativeId?: string;
  providerAdId?: string;
}

/** Cria a campanha PAUSADA (status CREATED_PAUSED) e toda a árvore. */
export async function createPausedCampaign(
  provider: MetaFlowProvider,
  input: {
    campaign: FlowCampaignInput;
    adset: FlowAdSetInput;
    creative: FlowCreativeInput;
  },
): Promise<FlowResult> {
  const campaign = await provider.createCampaign(input.campaign);
  const adset = await provider.createAdSet(campaign.providerCampaignId, input.adset);
  const creative = await provider.createCreative(input.creative);
  const ad = await provider.createAd(adset.providerAdsetId, creative.providerCreativeId);
  return {
    providerCampaignId: campaign.providerCampaignId,
    providerAdsetId: adset.providerAdsetId,
    providerCreativeId: creative.providerCreativeId,
    providerAdId: ad.providerAdId,
  };
}

/** Publica (runtime user action): CREATED_PAUSED → ACTIVE. */
export async function publishCampaign(
  provider: MetaFlowProvider,
  providerCampaignId: string,
): Promise<void> {
  await provider.setCampaignStatus(providerCampaignId, 'ACTIVE');
}

export async function pauseCampaign(
  provider: MetaFlowProvider,
  providerCampaignId: string,
): Promise<void> {
  await provider.setCampaignStatus(providerCampaignId, 'PAUSED');
}

export async function resumeCampaign(
  provider: MetaFlowProvider,
  providerCampaignId: string,
): Promise<void> {
  await provider.setCampaignStatus(providerCampaignId, 'ACTIVE');
}

export async function updateCampaignBudget(
  provider: MetaFlowProvider,
  providerCampaignId: string,
  budget: { dailyBudgetCents?: number | null; lifetimeBudgetCents?: number | null },
): Promise<void> {
  if (!budget.dailyBudgetCents && !budget.lifetimeBudgetCents) {
    throw new DomainError('INVALID_INPUT', 'Orçamento não informado');
  }
  await provider.updateCampaignBudget(providerCampaignId, budget);
}

export async function updateCampaignSchedule(
  provider: MetaFlowProvider,
  providerCampaignId: string,
  schedule: { startAt?: string | null; endAt?: string | null },
): Promise<void> {
  await provider.updateSchedule(providerCampaignId, schedule);
}

export async function updateCampaignCreative(
  provider: MetaFlowProvider,
  providerCreativeId: string,
  creative: Pick<FlowCreativeInput, 'mediaRefs' | 'copyPrimary' | 'landingUrl'>,
): Promise<void> {
  await provider.updateCreative(providerCreativeId, creative);
}

export async function archiveCampaign(
  provider: MetaFlowProvider,
  providerCampaignId: string,
): Promise<void> {
  await provider.archiveCampaign(providerCampaignId);
}

export async function syncCampaignInsights(
  provider: MetaFlowProvider,
  providerCampaignId: string,
  range: { dateStart: string; dateEnd: string },
): Promise<Record<string, unknown>> {
  return provider.getInsights(providerCampaignId, range);
}
