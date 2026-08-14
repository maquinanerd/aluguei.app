import { sql } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { webhookInbox } from '@aluguei/db';
import { processWhatsAppInboxJob } from '@aluguei/api/whatsapp';
import {
  getAiProvider,
  getInspectionAiProvider,
  getPaymentProvider,
  getScreeningProvider,
  getWhatsAppMessenger,
} from '@aluguei/integrations';
import type {
  AiProvider,
  InspectionAiProvider,
  IPaymentProvider,
  PaymentRegistryOptions,
  IScreeningProvider,
  ISignatureProvider,
  WhatsAppMessenger,
  WhatsAppRegistryOptions,
} from '@aluguei/integrations';
import { processInspectionJob } from './inspectionJobs.js';
import { processScreeningJob } from './screeningJobs.js';
import { processSignatureJob } from './signatureJobs.js';
import {
  processPaymentJob,
  processPaymentSchedulerJob,
  processReconcileJob,
} from './paymentJobs.js';
import { processMetaWebhookJob } from './metaJobs.js';

export interface RunInboxJobsOptions {
  db: AppDb;
  limit?: number;
  log?: (msg: string) => void;
  ai?: AiProvider;
  messenger?: WhatsAppMessenger | null;
  inspectionAi?: InspectionAiProvider;
  screening?: IScreeningProvider;
  signature?: ISignatureProvider;
  screeningApproveScoreMin?: number;
  payments?: IPaymentProvider | null;
}

/** Enfileira jobs recorrentes (scheduler de charges e reconciliação) antes do claim. */
async function enqueueSchedulerJobs(db: AppDb, log?: (msg: string) => void): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const periodStart = `${today.slice(0, 8)}01`;
  const orgs = await db
    .select({ id: (await import('@aluguei/db')).organizations.id })
    .from((await import('@aluguei/db')).organizations);
  for (const org of orgs) {
    await db
      .insert(webhookInbox)
      .values({
        orgId: org.id,
        provider: 'PAYMENT_SCHEDULER',
        providerEventId: `SCHED:${org.id}:${periodStart}`,
        payload: { periodStart },
      })
      .onConflictDoNothing();
    await db
      .insert(webhookInbox)
      .values({
        orgId: org.id,
        provider: 'PAYMENT_RECONCILE',
        providerEventId: `RECON:${org.id}:${today}`,
        payload: { periodStart: today },
      })
      .onConflictDoNothing();
  }
  log?.('scheduler jobs enqueued');
}

interface InboxJob {
  id: string;
  orgId: string;
  provider: string;
  payload: Record<string, unknown>;
}

function sanitizeError(message: string): string {
  return message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 500);
}

/** Claim atômico de eventos do webhook inbox (SKIP LOCKED, mesmo padrão ADR-010). */
async function claimInboxJobs(db: AppDb, limit: number): Promise<InboxJob[]> {
  await db.execute(sql`
    UPDATE webhook_inbox
    SET status = 'PENDING'
    WHERE status = 'RUNNING' AND started_at < now() - interval '5 minutes'
  `);
  const result = await db.execute(sql`
    UPDATE webhook_inbox
    SET status = 'RUNNING', started_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM webhook_inbox
      WHERE run_at <= now() AND (status = 'PENDING' OR (status = 'FAILED' AND attempts < 3))
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, provider, payload
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    orgId: String(row.org_id),
    provider: String(row.provider),
    payload: (row.payload ?? {}) as Record<string, unknown>,
  }));
}

/** Executa um ciclo de processamento do inbox. */
export async function runInboxJobs(opts: RunInboxJobsOptions): Promise<{ processed: number }> {
  const { db, limit = 10, log } = opts;
  await enqueueSchedulerJobs(db, log);
  const jobs = await claimInboxJobs(db, limit);
  const ai = opts.ai ?? getAiProvider({ provider: process.env.AI_PROVIDER ?? 'mock' });
  const messenger =
    opts.messenger !== undefined
      ? opts.messenger
      : (() => {
          const messengerOptions: WhatsAppRegistryOptions = {
            mode: process.env.META_MODE === 'live' ? 'live' : 'dry_run',
          };
          if (process.env.WHATSAPP_ACCESS_TOKEN) {
            messengerOptions.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
          }
          if (process.env.WHATSAPP_PHONE_NUMBER_ID) {
            messengerOptions.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          }
          if (process.env.META_WEBHOOK_VERIFY_TOKEN) {
            messengerOptions.verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
          }
          return getWhatsAppMessenger(messengerOptions);
        })();
  const inspectionAi = opts.inspectionAi ?? getInspectionAiProvider({});
  const screeningProvider =
    opts.screening ??
    getScreeningProvider({
      provider:
        process.env.SCREENING_PROVIDER ??
        (process.env.NODE_ENV === 'production' ? 'SERASA' : 'FAKE'),
    });
  const approveScoreMin =
    opts.screeningApproveScoreMin ??
    (process.env.SCREENING_APPROVE_SCORE_MIN
      ? Number(process.env.SCREENING_APPROVE_SCORE_MIN)
      : undefined);
  const paymentProvider =
    opts.payments !== undefined
      ? opts.payments
      : (() => {
          const paymentOptions: PaymentRegistryOptions = {
            provider: process.env.PAYMENT_PROVIDER ?? 'FAKE',
          };
          if (process.env.ASAAS_API_KEY) {
            paymentOptions.apiKey = process.env.ASAAS_API_KEY;
          }
          return getPaymentProvider(paymentOptions);
        })();

  for (const job of jobs) {
    try {
      if (job.provider === 'WHATSAPP') {
        await processWhatsAppInboxJob(db, job, ai, messenger);
      } else if (job.provider === 'INSPECTION') {
        await processInspectionJob(db, job, inspectionAi);
      } else if (job.provider === 'SCREENING') {
        if (!screeningProvider) {
          throw new Error('provider de screening não configurado');
        }
        await processScreeningJob(db, job, screeningProvider, approveScoreMin);
      } else if (job.provider === 'SIGNATURE') {
        await processSignatureJob(db, job);
      } else if (job.provider === 'PAYMENT') {
        if (!paymentProvider) {
          throw new Error('provider de pagamento não configurado');
        }
        await processPaymentJob(db, job, paymentProvider);
      } else if (job.provider === 'PAYMENT_SCHEDULER') {
        await processPaymentSchedulerJob(db, job);
      } else if (job.provider === 'PAYMENT_RECONCILE') {
        await processReconcileJob(db, job, paymentProvider);
      } else if (job.provider === 'META') {
        await processMetaWebhookJob(db, job);
      } else {
        throw new Error(`provider desconhecido: ${job.provider}`);
      }
      await db
        .update(webhookInbox)
        .set({ status: 'SUCCESS', finishedAt: new Date() })
        .where(and(eq(webhookInbox.id, job.id), eq(webhookInbox.status, 'RUNNING')));
      log?.(`inbox ${job.id} (${job.provider}) OK`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const safe = sanitizeError(message);
      await db.execute(
        sql`UPDATE webhook_inbox
            SET status = 'FAILED', last_error = ${safe}, finished_at = now(),
                run_at = now() + LEAST(POWER(2, attempts), 600) * interval '1 second'
            WHERE id = ${job.id}`,
      );
      log?.(`inbox ${job.id} (${job.provider}) FAILED: ${safe}`);
    }
  }

  return { processed: jobs.length };
}
