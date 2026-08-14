import { sql } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import {
  metaCampaignLinks,
  metaCreativeLinks,
  metaInsightSnapshots,
  metaOrgSettings,
  metaSyncJobs,
  metaWebhookEvents,
} from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, transitionCampaign, validateBudget } from '@aluguei/domain';
import type { IMetaAdsProvider, MetaInsights } from '@aluguei/integrations';
import { writeAudit } from '@aluguei/api/audit';
import { webhookInbox } from '@aluguei/db';

export interface RunMetaJobsOptions {
  db: AppDb;
  /** Provider Meta Ads (fake em dev/test; null em produção sem credencial). */
  meta: IMetaAdsProvider | null;
  limit?: number;
  log?: (msg: string) => void;
}

export interface MetaWebhookInboxJob {
  id: string;
  orgId: string;
  provider: string;
  payload: Record<string, unknown>;
}

/** Arquiva webhook META como PROCESSED (dedup já feito no recebimento). */
export async function processMetaWebhookJob(db: AppDb, job: MetaWebhookInboxJob): Promise<void> {
  const providerEventId =
    typeof job.payload['providerEventId'] === 'string' ? job.payload['providerEventId'] : '';
  if (!providerEventId) {
    throw new DomainError('INVALID_INPUT', 'webhook META sem providerEventId');
  }
  await db
    .update(metaWebhookEvents)
    .set({ status: 'PROCESSED' })
    .where(eq(metaWebhookEvents.providerEventId, providerEventId));
  await db
    .update(webhookInbox)
    .set({ status: 'SUCCESS', finishedAt: new Date() })
    .where(eq(webhookInbox.id, job.id));
}

interface ClaimedMetaJob {
  id: string;
  orgId: string;
  adProfileId: string | null;
  jobType: string;
  payload: Record<string, unknown> | null;
}

/** Claim atômico de meta_sync_jobs (SKIP LOCKED) + reaper de RUNNING preso. */
async function claimMetaJobs(db: AppDb, limit: number): Promise<ClaimedMetaJob[]> {
  await db.execute(sql`
    UPDATE meta_sync_jobs
    SET status = 'PENDING'
    WHERE status = 'RUNNING' AND started_at < now() - interval '5 minutes'
  `);
  const result = await db.execute(sql`
    UPDATE meta_sync_jobs
    SET status = 'RUNNING', started_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM meta_sync_jobs
      WHERE run_at <= now() AND (status = 'PENDING' OR (status = 'FAILED' AND attempts < 5))
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, ad_profile_id, job_type, payload
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    orgId: String(row.org_id),
    adProfileId: row.ad_profile_id === null ? null : (row.ad_profile_id as string),
    jobType: String(row.job_type),
    payload: row.payload ? (row.payload as Record<string, unknown>) : null,
  }));
}

function sanitizeError(message: string): string {
  // Nunca logar credenciais/URLs sensíveis nem fragmentos de token EAAG.
  return message
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .replace(/\bEAAG[0-9A-Za-z_-]{10,}/g, '[token]')
    .slice(0, 500);
}

async function markMetaJobSuccess(db: AppDb, jobId: string): Promise<void> {
  await db
    .update(metaSyncJobs)
    .set({ status: 'SUCCESS', finishedAt: new Date() })
    .where(and(eq(metaSyncJobs.id, jobId), eq(metaSyncJobs.status, 'RUNNING')));
}

async function markMetaJobFailed(db: AppDb, jobId: string, error: string): Promise<void> {
  await db
    .update(metaSyncJobs)
    .set({ status: 'FAILED', lastError: sanitizeError(error), finishedAt: new Date() })
    .where(and(eq(metaSyncJobs.id, jobId), eq(metaSyncJobs.status, 'RUNNING')));
}

function resolveText(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveNumber(payload: Record<string, unknown> | null, key: string): number | null {
  const value = payload?.[key];
  return typeof value === 'number' ? value : null;
}

/** Processa um job de meta_sync_jobs (intent enfileirado pela API/MCP). */
export async function processMetaJob(
  db: AppDb,
  job: ClaimedMetaJob,
  meta: IMetaAdsProvider,
): Promise<void> {
  const payload = job.payload ?? {};

  switch (job.jobType) {
    case 'SYNC_INSIGHTS': {
      const campaignLinkId = resolveText(payload, 'campaignLinkId');
      if (!campaignLinkId) {
        throw new DomainError('INVALID_INPUT', 'SYNC_INSIGHTS sem campaignLinkId');
      }
      const [campaignLink] = await db
        .select()
        .from(metaCampaignLinks)
        .where(
          and(eq(metaCampaignLinks.id, campaignLinkId), eq(metaCampaignLinks.orgId, job.orgId)),
        )
        .limit(1);
      if (!campaignLink) {
        return; // campanha não pertence à org — ignora (idempotente)
      }
      const today = new Date();
      const dateEnd = today.toISOString().slice(0, 10);
      const dateStart = new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
      const insights = (await meta.getInsights(campaignLink.providerCampaignId, {
        dateStart,
        dateEnd,
      })) as MetaInsights;
      await db
        .insert(metaInsightSnapshots)
        .values({
          orgId: job.orgId,
          adProfileId: job.adProfileId,
          campaignLinkId: campaignLink.id,
          dateStart,
          dateEnd,
          insights: insights as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [
            metaInsightSnapshots.campaignLinkId,
            metaInsightSnapshots.dateStart,
            metaInsightSnapshots.dateEnd,
          ],
          set: { insights: insights as unknown as Record<string, unknown>, syncedAt: new Date() },
        });
      await writeAudit(db, {
        orgId: job.orgId,
        action: AUDIT_ACTIONS.META_INSIGHTS_SYNCED,
        entityType: 'META_CAMPAIGN',
        entityId: campaignLink.id,
        payload: { spendCents: insights.spendCents },
      });
      return;
    }

    case 'PUBLISH_INTENT':
    case 'PAUSE':
    case 'RESUME':
    case 'ARCHIVE': {
      const campaignLinkId = resolveText(payload, 'campaignLinkId');
      if (!campaignLinkId) {
        throw new DomainError('INVALID_INPUT', `${job.jobType} sem campaignLinkId`);
      }
      const [campaignLink] = await db
        .select()
        .from(metaCampaignLinks)
        .where(
          and(eq(metaCampaignLinks.id, campaignLinkId), eq(metaCampaignLinks.orgId, job.orgId)),
        )
        .limit(1);
      if (!campaignLink) {
        return;
      }
      const nextStatus =
        job.jobType === 'PUBLISH_INTENT' || job.jobType === 'RESUME'
          ? 'ACTIVE'
          : job.jobType === 'PAUSE'
            ? 'PAUSED'
            : 'ARCHIVED';
      transitionCampaign(campaignLink.status, nextStatus);
      if (nextStatus === 'ARCHIVED') {
        await meta.archiveCampaign(campaignLink.providerCampaignId);
      } else {
        await meta.setCampaignStatus(
          campaignLink.providerCampaignId,
          nextStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        );
      }
      await db
        .update(metaCampaignLinks)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(metaCampaignLinks.id, campaignLink.id));
      const auditAction =
        job.jobType === 'PUBLISH_INTENT'
          ? AUDIT_ACTIONS.META_CAMPAIGN_PUBLISHED
          : job.jobType === 'PAUSE'
            ? AUDIT_ACTIONS.META_CAMPAIGN_PAUSED
            : job.jobType === 'RESUME'
              ? AUDIT_ACTIONS.META_CAMPAIGN_RESUMED
              : AUDIT_ACTIONS.META_CAMPAIGN_ARCHIVED;
      await writeAudit(db, {
        orgId: job.orgId,
        action: auditAction,
        entityType: 'META_CAMPAIGN',
        entityId: campaignLink.id,
        payload: { status: nextStatus },
      });
      return;
    }

    case 'UPDATE_BUDGET': {
      const campaignLinkId = resolveText(payload, 'campaignLinkId');
      if (!campaignLinkId) {
        throw new DomainError('INVALID_INPUT', 'UPDATE_BUDGET sem campaignLinkId');
      }
      const [campaignLink] = await db
        .select()
        .from(metaCampaignLinks)
        .where(
          and(eq(metaCampaignLinks.id, campaignLinkId), eq(metaCampaignLinks.orgId, job.orgId)),
        )
        .limit(1);
      if (!campaignLink) {
        return;
      }
      const daily = resolveNumber(payload, 'dailyBudgetCents');
      const lifetime = resolveNumber(payload, 'lifetimeBudgetCents');
      // P1 (auditoria final): defesa em profundidade — nunca aplica orçamento
      // acima do teto da org, mesmo que o intent tenha sido enfileirado antes
      // da validação ou por uma tool antiga.
      const [settings] = await db
        .select()
        .from(metaOrgSettings)
        .where(eq(metaOrgSettings.orgId, job.orgId))
        .limit(1);
      const budgetInput: Parameters<typeof validateBudget>[0] = {
        limits: {
          maxDailyBudgetCents: settings?.maxDailyBudgetCents ?? 10_000_00,
          maxLifetimeBudgetCents: settings?.maxLifetimeBudgetCents ?? 100_000_00,
        },
      };
      if (daily !== null) {
        budgetInput.dailyBudgetCents = daily;
      }
      if (lifetime !== null) {
        budgetInput.lifetimeBudgetCents = lifetime;
      }
      const budgetValidation = validateBudget(budgetInput);
      if (!budgetValidation.valid) {
        throw new DomainError(
          'INVALID_INPUT',
          `UPDATE_BUDGET rejeitado: ${budgetValidation.errors.join('; ')}`,
        );
      }
      const budget = { dailyBudgetCents: daily, lifetimeBudgetCents: lifetime };
      await meta.updateCampaignBudget(campaignLink.providerCampaignId, budget);
      await db
        .update(metaCampaignLinks)
        .set({
          dailyBudgetCents: daily ?? campaignLink.dailyBudgetCents,
          lifetimeBudgetCents: lifetime ?? campaignLink.lifetimeBudgetCents,
          updatedAt: new Date(),
        })
        .where(eq(metaCampaignLinks.id, campaignLink.id));
      await writeAudit(db, {
        orgId: job.orgId,
        action: AUDIT_ACTIONS.META_BUDGET_UPDATED,
        entityType: 'META_CAMPAIGN',
        entityId: campaignLink.id,
        payload: { dailyBudgetCents: daily, lifetimeBudgetCents: lifetime },
      });
      return;
    }

    case 'UPDATE_SCHEDULE': {
      const campaignLinkId = resolveText(payload, 'campaignLinkId');
      if (!campaignLinkId) {
        throw new DomainError('INVALID_INPUT', 'UPDATE_SCHEDULE sem campaignLinkId');
      }
      const [campaignLink] = await db
        .select()
        .from(metaCampaignLinks)
        .where(
          and(eq(metaCampaignLinks.id, campaignLinkId), eq(metaCampaignLinks.orgId, job.orgId)),
        )
        .limit(1);
      if (!campaignLink) {
        return;
      }
      const startAt = resolveText(payload, 'startAt');
      const endAt = resolveText(payload, 'endAt');
      await meta.updateSchedule(campaignLink.providerCampaignId, { startAt, endAt });
      await db
        .update(metaCampaignLinks)
        .set({
          startAt: startAt ? new Date(startAt) : campaignLink.startAt,
          endAt: endAt ? new Date(endAt) : campaignLink.endAt,
          updatedAt: new Date(),
        })
        .where(eq(metaCampaignLinks.id, campaignLink.id));
      await writeAudit(db, {
        orgId: job.orgId,
        action: AUDIT_ACTIONS.META_SCHEDULE_UPDATED,
        entityType: 'META_CAMPAIGN',
        entityId: campaignLink.id,
        payload: { startAt, endAt },
      });
      return;
    }

    case 'UPDATE_CREATIVE': {
      const creativeLinkId = resolveText(payload, 'creativeLinkId');
      if (!creativeLinkId) {
        throw new DomainError('INVALID_INPUT', 'UPDATE_CREATIVE sem creativeLinkId');
      }
      const [creativeLink] = await db
        .select()
        .from(metaCreativeLinks)
        .where(
          and(eq(metaCreativeLinks.id, creativeLinkId), eq(metaCreativeLinks.orgId, job.orgId)),
        )
        .limit(1);
      if (!creativeLink) {
        return;
      }
      const copyPrimary = resolveText(payload, 'copyPrimary') ?? creativeLink.copyPrimary;
      const mediaRefs = Array.isArray(payload['mediaRefs'])
        ? (payload['mediaRefs'] as string[])
        : (creativeLink.mediaRefs as string[]);
      await meta.updateCreative(creativeLink.providerCreativeId, {
        mediaRefs,
        copyPrimary,
        landingUrl: creativeLink.landingUrl,
      });
      await db
        .update(metaCreativeLinks)
        .set({ copyPrimary, mediaRefs: mediaRefs as never, updatedAt: new Date() })
        .where(eq(metaCreativeLinks.id, creativeLink.id));
      await writeAudit(db, {
        orgId: job.orgId,
        action: AUDIT_ACTIONS.META_CREATIVE_UPDATED,
        entityType: 'META_CREATIVE',
        entityId: creativeLink.id,
      });
      return;
    }

    default:
      throw new DomainError('INVALID_INPUT', `Job type desconhecido: ${job.jobType}`);
  }
}

/** Um ciclo de meta_sync_jobs (testável com PGlite). */
export async function runMetaJobs(opts: RunMetaJobsOptions): Promise<{ processed: number }> {
  const { db, meta, limit = 10 } = opts;
  if (!meta) {
    // Sem provider (produção sem credencial): marca como FAILED para não re-enfileirar infinito.
    const stuck = await db
      .select()
      .from(metaSyncJobs)
      .where(eq(metaSyncJobs.status, 'PENDING'))
      .limit(limit);
    for (const job of stuck) {
      await db
        .update(metaSyncJobs)
        .set({
          status: 'FAILED',
          lastError: 'provider de meta não configurado',
          finishedAt: new Date(),
        })
        .where(and(eq(metaSyncJobs.id, job.id), eq(metaSyncJobs.status, 'PENDING')));
    }
    return { processed: stuck.length };
  }
  const jobs = await claimMetaJobs(db, limit);
  let processed = 0;
  for (const job of jobs) {
    try {
      await processMetaJob(db, job, meta);
      await markMetaJobSuccess(db, job.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markMetaJobFailed(db, job.id, message);
      processed += 1;
    }
  }
  return { processed };
}
