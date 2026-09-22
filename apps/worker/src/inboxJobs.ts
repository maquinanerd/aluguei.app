import { sql } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { resolveMetaMode, resolveScreeningProvider } from '@aluguei/config';
import type { AppEnv } from '@aluguei/config';
import { createDbFakePaymentStore, webhookInbox } from '@aluguei/db';
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
import { processProposalExpiryJob } from './crmJobs.js';
import { markSpanError, withSpan } from '@aluguei/observability';
import { startJobLog } from './job-log.js';
import type { JobLogger } from './job-log.js';

export interface RunInboxJobsOptions {
  db: AppDb;
  limit?: number;
  log?: (msg: string) => void;
  /** Log estruturado por job (início, fim, falha). */
  logger?: JobLogger;
  /** Env tipado (loadEnv) — os valores de provider são lidos daqui quando presente. */
  env?: AppEnv;
  ai?: AiProvider;
  messenger?: WhatsAppMessenger | null;
  inspectionAi?: InspectionAiProvider;
  screening?: IScreeningProvider;
  signature?: ISignatureProvider;
  screeningApproveScoreMin?: number;
  payments?: IPaymentProvider | null;
  /** Job descartado após esgotar as tentativas (alerta operacional). */
  onDeadLetter?: (job: InboxDeadLetter) => void;
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
    // Expiração da proposta pela validade (auditoria 2026-09-10, P2-02).
    await db
      .insert(webhookInbox)
      .values({
        orgId: org.id,
        provider: 'PROPOSAL_EXPIRY',
        providerEventId: `PROPEXP:${org.id}:${today}`,
        payload: {},
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
  attempts: number;
  /** Marca do claim: garante que só quem está executando conclui o job. */
  startedAt: unknown;
}

export interface InboxDeadLetter {
  id: string;
  provider: string;
  attempts: number;
  lastError: string;
}

function sanitizeError(message: string): string {
  return message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 500);
}

const PAYMENT_MAX_ATTEMPTS = 8;
const DEFAULT_MAX_ATTEMPTS = 3;
/**
 * Pagamento tolera mais tentativas: a confirmação no provider pode demorar.
 * Fragmento literal (constantes internas): como parâmetros, os dois ramos do
 * CASE ficariam sem tipo e o PostgreSQL recusaria a comparação.
 */
const MAX_ATTEMPTS = sql.raw(
  `(CASE provider WHEN 'PAYMENT' THEN ${String(PAYMENT_MAX_ATTEMPTS)} ELSE ${String(DEFAULT_MAX_ATTEMPTS)} END)`,
);

function maxAttemptsFor(provider: string): number {
  return provider === 'PAYMENT' ? PAYMENT_MAX_ATTEMPTS : DEFAULT_MAX_ATTEMPTS;
}

/**
 * Execução que passou de 5 minutos sem concluir volta para a fila com backoff —
 * e vira DEAD quando esgota as tentativas, em vez de reciclar para sempre
 * (auditoria 2026-09-10, P2-10).
 */
async function reapStuckJobs(db: AppDb): Promise<InboxDeadLetter[]> {
  const result = await db.execute(sql`
    UPDATE webhook_inbox
    SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'DEAD' ELSE 'FAILED' END,
        last_error = 'execução expirada (worker não concluiu em 5 minutos)',
        finished_at = now(),
        run_at = now() + LEAST(POWER(2, attempts), 600) * interval '1 second'
    WHERE status = 'RUNNING' AND started_at < now() - interval '5 minutes'
    RETURNING id, provider, attempts, status
  `);
  return result.rows
    .filter((row) => String(row.status) === 'DEAD')
    .map((row) => ({
      id: String(row.id),
      provider: String(row.provider),
      attempts: Number(row.attempts),
      lastError: 'execução expirada (worker não concluiu em 5 minutos)',
    }));
}

/** Claim atômico de eventos do webhook inbox (SKIP LOCKED, mesmo padrão ADR-010). */
async function claimInboxJobs(db: AppDb, limit: number): Promise<InboxJob[]> {
  const result = await db.execute(sql`
    UPDATE webhook_inbox
    SET status = 'RUNNING', started_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM webhook_inbox
      WHERE run_at <= now()
        AND (status = 'PENDING' OR (status = 'FAILED' AND attempts < ${MAX_ATTEMPTS}))
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, provider, payload, attempts, started_at
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    orgId: String(row.org_id),
    provider: String(row.provider),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    attempts: Number(row.attempts),
    startedAt: row.started_at,
  }));
}

/** Executa um ciclo de processamento do inbox. */
export async function runInboxJobs(opts: RunInboxJobsOptions): Promise<{ processed: number }> {
  const { db, limit = 10, log, logger, env, onDeadLetter } = opts;
  await enqueueSchedulerJobs(db, log);
  for (const dead of await reapStuckJobs(db)) {
    log?.(`inbox ${dead.id} (${dead.provider}) DEAD após ${String(dead.attempts)} tentativas`);
    onDeadLetter?.(dead);
  }
  const jobs = await claimInboxJobs(db, limit);
  // Escolhas padrão só fora de produção (P1-12): em produção cada provider vem da configuração,
  // que o boot já validou; sem ela o job falha como "não configurado", nunca no FAKE.
  const modeSource = {
    NODE_ENV: env?.NODE_ENV ?? process.env.NODE_ENV,
    META_MODE: env?.META_MODE ?? process.env.META_MODE,
    SCREENING_PROVIDER: env?.SCREENING_PROVIDER ?? process.env.SCREENING_PROVIDER,
  };
  const ai =
    opts.ai ?? getAiProvider({ provider: env?.AI_PROVIDER ?? process.env.AI_PROVIDER ?? 'mock' });
  const messenger =
    opts.messenger !== undefined
      ? opts.messenger
      : (() => {
          const messengerOptions: WhatsAppRegistryOptions = {};
          const mode = resolveMetaMode(modeSource);
          if (mode) {
            messengerOptions.mode = mode;
          }
          const accessToken = env?.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN;
          if (accessToken) {
            messengerOptions.accessToken = accessToken;
          }
          const phoneNumberId =
            env?.WHATSAPP_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
          if (phoneNumberId) {
            messengerOptions.phoneNumberId = phoneNumberId;
          }
          const verifyToken =
            env?.META_WEBHOOK_VERIFY_TOKEN ?? process.env.META_WEBHOOK_VERIFY_TOKEN;
          if (verifyToken) {
            messengerOptions.verifyToken = verifyToken;
          }
          return getWhatsAppMessenger(messengerOptions);
        })();
  const inspectionAi = opts.inspectionAi ?? getInspectionAiProvider({});
  const screeningProvider =
    opts.screening ??
    (() => {
      // Sem SCREENING_PROVIDER em produção não há provider (antes: esqueleto Serasa).
      const options: Parameters<typeof getScreeningProvider>[0] = {};
      const provider = resolveScreeningProvider(modeSource);
      if (provider) {
        options.provider = provider;
      }
      const clientId = env?.SERASA_CLIENT_ID ?? process.env.SERASA_CLIENT_ID;
      const clientSecret = env?.SERASA_CLIENT_SECRET ?? process.env.SERASA_CLIENT_SECRET;
      if (clientId) {
        options.clientId = clientId;
      }
      if (clientSecret) {
        options.clientSecret = clientSecret;
      }
      return getScreeningProvider(options);
    })();
  const approveScoreMin =
    opts.screeningApproveScoreMin ??
    ((env?.SCREENING_APPROVE_SCORE_MIN ?? process.env.SCREENING_APPROVE_SCORE_MIN)
      ? Number(env?.SCREENING_APPROVE_SCORE_MIN ?? process.env.SCREENING_APPROVE_SCORE_MIN)
      : undefined);
  const paymentProvider =
    opts.payments !== undefined
      ? opts.payments
      : (() => {
          const paymentOptions: PaymentRegistryOptions = {
            // O FAKE do worker precisa ver as cobranças criadas pela API (P1-13).
            fakeStore: createDbFakePaymentStore(db),
          };
          // Sem PAYMENT_PROVIDER não há provider, como na API (antes: FAKE por omissão, P1-12).
          const provider = env?.PAYMENT_PROVIDER ?? process.env.PAYMENT_PROVIDER;
          if (provider) {
            paymentOptions.provider = provider;
          }
          const apiKey = env?.ASAAS_API_KEY ?? process.env.ASAAS_API_KEY;
          if (apiKey) {
            paymentOptions.apiKey = apiKey;
          }
          const asaasEnv =
            env?.ASAAS_ENV ?? (process.env.ASAAS_ENV as 'sandbox' | 'production' | undefined);
          if (asaasEnv) {
            paymentOptions.env = asaasEnv;
          }
          return getPaymentProvider(paymentOptions);
        })();

  for (const job of jobs) {
    // Span do job: as queries e chamadas HTTP do processamento entram no mesmo trace (P2-11).
    await withSpan(
      `job ${job.provider}`,
      {
        'job.queue': 'inbox',
        'job.id': job.id,
        'job.type': job.provider,
        'job.attempt': job.attempts,
        'job.org_id': job.orgId,
      },
      async (span) => {
        const jobLog = startJobLog(logger, {
          queue: 'inbox',
          jobId: job.id,
          jobType: job.provider,
          attempt: job.attempts,
          orgId: job.orgId,
        });
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
          } else if (job.provider === 'PROPOSAL_EXPIRY') {
            await processProposalExpiryJob(db, job);
          } else if (job.provider === 'META') {
            await processMetaWebhookJob(db, job);
          } else {
            throw new Error(`provider desconhecido: ${job.provider}`);
          }
          // Só conclui quem ainda detém o claim: uma execução expirada e reenfileirada
          // não sobrescreve o resultado da tentativa seguinte.
          const finished = await db.execute(sql`
        UPDATE webhook_inbox SET status = 'SUCCESS', finished_at = now()
        WHERE id = ${job.id} AND status = 'RUNNING' AND started_at = ${job.startedAt}
        RETURNING id
      `);
          if (finished.rows.length > 0) {
            jobLog.finished('SUCCESS');
          } else {
            jobLog.finished('IGNORED', { reason: 'concluído fora do claim' });
          }
          log?.(
            finished.rows.length > 0
              ? `inbox ${job.id} (${job.provider}) OK`
              : `inbox ${job.id} (${job.provider}) concluído fora do claim — resultado ignorado`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const safe = sanitizeError(message);
          const failed = await db.execute(sql`
        UPDATE webhook_inbox
        SET status = CASE WHEN attempts >= ${maxAttemptsFor(job.provider)} THEN 'DEAD' ELSE 'FAILED' END,
            last_error = ${safe}, finished_at = now(),
            run_at = now() + LEAST(POWER(2, attempts), 600) * interval '1 second'
        WHERE id = ${job.id} AND status = 'RUNNING' AND started_at = ${job.startedAt}
        RETURNING status
      `);
          // `rows` vem como Record<string, unknown>: sem tipar, o status cairia em
          // "[object Object]" no log em vez de FAILED/DEAD.
          const [outcome] = failed.rows as Array<{ status?: string } | undefined>;
          const status = outcome?.status ?? 'FAILED';
          jobLog.failed(status, safe, err);
          markSpanError(span, err);
          span.setAttribute('job.status', status);
          log?.(`inbox ${job.id} (${job.provider}) ${status}: ${safe}`);
          if (status === 'DEAD') {
            onDeadLetter?.({
              id: job.id,
              provider: job.provider,
              attempts: job.attempts,
              lastError: safe,
            });
          }
        }
      },
    );
  }

  return { processed: jobs.length };
}
