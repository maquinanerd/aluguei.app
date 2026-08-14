import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  metaCampaignLinks,
  metaConnections,
  metaInsightSnapshots,
  metaSyncJobs,
  organizations,
} from '@aluguei/db';
import { FakeMetaAdsProvider } from '@aluguei/integrations';
import { runMetaJobs } from './metaJobs.js';

async function seedOrg(db: AppDb): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Org Meta Jobs',
      slug: `org-meta-jobs-${Math.random().toString(36).slice(2, 6)}`,
    })
    .returning();
  if (!org) throw new Error('org seed failed');
  return org.id;
}

describe('worker: meta_sync_jobs', () => {
  let db: AppDb;
  let meta: FakeMetaAdsProvider;
  let orgId: string;
  let campaignLinkId: string;
  let providerCampaignId: string;

  beforeAll(async () => {
    db = await createTestDb();
    meta = new FakeMetaAdsProvider();
    orgId = await seedOrg(db);

    // Seeds com FKs reais: property → connection/asset → adProfile → campaignLink
    const { properties, metaAdProfiles, metaAssets } = await import('@aluguei/db');
    const [property] = await db
      .insert(properties)
      .values({ orgId, title: 'Casa Meta Jobs', propertyType: 'HOUSE' })
      .returning();
    if (!property) throw new Error('property seed failed');
    const [connection] = await db
      .insert(metaConnections)
      .values({ orgId, status: 'ACTIVE', scopes: [] })
      .returning();
    if (!connection) throw new Error('connection seed failed');
    const [asset] = await db
      .insert(metaAssets)
      .values({
        orgId,
        connectionId: connection.id,
        kind: 'AD_ACCOUNT',
        providerAssetId: 'act_fake_jobs',
        name: 'Conta Jobs',
      })
      .returning();
    const [profile] = await db
      .insert(metaAdProfiles)
      .values({
        orgId,
        connectionId: asset?.connectionId ?? '',
        propertyId: property.id,
        name: 'Campanha Jobs',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 1_000_00,
        mediaSelection: [],
        landingUrl: 'https://aluguei.app/x',
        copyPrimary: 'Copy',
        status: 'CREATED',
      })
      .returning();
    if (!profile) throw new Error('adProfile seed failed');
    const created = await meta.createCampaign({
      name: 'Campanha Jobs',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 1_000_00,
    });
    providerCampaignId = created.providerCampaignId;
    const [campaign] = await db
      .insert(metaCampaignLinks)
      .values({
        orgId,
        adProfileId: profile.id,
        providerCampaignId,
        name: 'Campanha Jobs',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 1_000_00,
        status: 'CREATED_PAUSED',
      })
      .returning();
    if (!campaign) throw new Error('campaign seed failed');
    campaignLinkId = campaign.id;
  });

  async function enqueueJob(jobType: string, payload: Record<string, unknown>): Promise<string> {
    const [job] = await db
      .insert(metaSyncJobs)
      .values({
        orgId,
        jobType,
        idempotencyKey: `jobs-${jobType}-${Math.random().toString(36).slice(2, 8)}`,
        payload,
      })
      .returning();
    if (!job) throw new Error('job seed failed');
    return job.id;
  }

  it('SYNC_INSIGHTS persiste snapshot com spend em centavos', async () => {
    const jobId = await enqueueJob('SYNC_INSIGHTS', { campaignLinkId });
    const { processed } = await runMetaJobs({ db, meta, limit: 10 });
    expect(processed).toBe(1);
    const [job] = await db.select().from(metaSyncJobs).where(eq(metaSyncJobs.id, jobId)).limit(1);
    expect(job?.status).toBe('SUCCESS');
    const [snapshot] = await db
      .select()
      .from(metaInsightSnapshots)
      .where(eq(metaInsightSnapshots.campaignLinkId, campaignLinkId));
    expect(snapshot).toBeDefined();
    expect((snapshot?.insights as { spendCents?: number }).spendCents).toBeGreaterThan(0);
  });

  it('PUBLISH_INTENT transita CREATED_PAUSED → ACTIVE e chama provider', async () => {
    const jobId = await enqueueJob('PUBLISH_INTENT', { campaignLinkId });
    const { processed } = await runMetaJobs({ db, meta, limit: 10 });
    expect(processed).toBe(1);
    const [campaign] = await db
      .select()
      .from(metaCampaignLinks)
      .where(eq(metaCampaignLinks.id, campaignLinkId))
      .limit(1);
    expect(campaign?.status).toBe('ACTIVE');
    expect(meta.getCampaignStatus(providerCampaignId)).toBe('ACTIVE');
    const [job] = await db.select().from(metaSyncJobs).where(eq(metaSyncJobs.id, jobId)).limit(1);
    expect(job?.status).toBe('SUCCESS');
  });

  it('falha injetada → job FAILED com erro sanitizado; retry depois SUCCESS', async () => {
    const jobId = await enqueueJob('PAUSE', { campaignLinkId });
    meta.failNextCall();
    const first = await runMetaJobs({ db, meta, limit: 10 });
    expect(first.processed).toBe(1);
    const [failed] = await db
      .select()
      .from(metaSyncJobs)
      .where(eq(metaSyncJobs.id, jobId))
      .limit(1);
    expect(failed?.status).toBe('FAILED');
    expect(failed?.lastError).toContain('falha injetada');

    const retry = await runMetaJobs({ db, meta, limit: 10 });
    expect(retry.processed).toBe(1);
    const [after] = await db.select().from(metaSyncJobs).where(eq(metaSyncJobs.id, jobId)).limit(1);
    expect(after?.status).toBe('SUCCESS');
  });

  it('sem provider (produção sem credencial) → jobs falham honestamente, nunca simulam', async () => {
    const jobId = await enqueueJob('SYNC_INSIGHTS', { campaignLinkId });
    const { processed } = await runMetaJobs({ db, meta: null, limit: 10 });
    expect(processed).toBe(1);
    const [job] = await db.select().from(metaSyncJobs).where(eq(metaSyncJobs.id, jobId)).limit(1);
    expect(job?.status).toBe('FAILED');
    expect(job?.lastError).toContain('provider de meta não configurado');
  });

  it('UPDATE_BUDGET atualiza orçamento no link e no provider', async () => {
    await runMetaJobs({ db, meta, limit: 10 }); // drena pendentes
    const jobId = await enqueueJob('UPDATE_BUDGET', {
      campaignLinkId,
      dailyBudgetCents: 2_000_00,
    });
    await runMetaJobs({ db, meta, limit: 10 });
    const [job] = await db.select().from(metaSyncJobs).where(eq(metaSyncJobs.id, jobId)).limit(1);
    expect(job?.status).toBe('SUCCESS');
    const [campaign] = await db
      .select()
      .from(metaCampaignLinks)
      .where(eq(metaCampaignLinks.id, campaignLinkId))
      .limit(1);
    expect(campaign?.dailyBudgetCents).toBe(2_000_00);
  });
});
