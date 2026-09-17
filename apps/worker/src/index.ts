import { performance } from 'node:perf_hooks';
import {
  ConfigError,
  fakeProvidersInUse,
  loadEnv,
  loadRuntimeEnv,
  resolveMetaMode,
} from '@aluguei/config';
import type { AppEnv } from '@aluguei/config';
import { createLogger } from '@aluguei/observability';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { getChannelAdapter, getMetaAdsProvider } from '@aluguei/integrations';
import type { FakeChannel } from '@aluguei/integrations';
import { runChannelJobs } from './channelJobs.js';
import { runInboxJobs } from './inboxJobs.js';
import type { InboxDeadLetter } from './inboxJobs.js';
import { runMetaJobs } from './metaJobs.js';
import { startHeartbeat } from './heartbeat.js';
import { createJobLoop } from './job-loop.js';
import { defaultHealthPolicy, startHealthServer } from './health.js';
import type { HealthServer } from './health.js';
import type { JobLogger } from './job-log.js';

export { runChannelJobs, runInboxJobs, runMetaJobs };
export { processPaymentJob } from './paymentJobs.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const JOB_POLL_INTERVAL_MS = 5_000;
/** Espera padrão pelos jobs em andamento no SIGTERM/SIGINT (o compose dá 30 s ao container). */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 20_000;
/** Depois do limite, quanto o processo ainda tem para sair sozinho antes do exit forçado. */
const FORCED_EXIT_GRACE_MS = 1_000;
const DB_CLOSE_TIMEOUT_MS = 5_000;

/** Singleton do pool de DB do worker — evita vazar um pool por ciclo de poll. */
let dbSingleton: AppDb | null = null;

function getWorkerDb(env: ReturnType<typeof loadEnv>): AppDb | null {
  if (!env.DATABASE_URL) {
    return null;
  }
  if (!dbSingleton) {
    dbSingleton = createDb(env.DATABASE_URL);
  }
  return dbSingleton;
}

/** Logger do worker: o pino da observabilidade ou um duplo nos testes. */
export interface WorkerLogger extends JobLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

export interface WorkerRunOptions {
  db?: AppDb;
  /** Configuração já validada (`run`); sem ela, lê o ambiente do processo. */
  env?: AppEnv;
  fakeChannel?: FakeChannel;
  pollIntervalMs?: number;
  log?: (msg: string) => void;
  /** Log estruturado por job (início, fim, falha) nas três filas. */
  logger?: JobLogger;
  /** Job descartado após esgotar tentativas — alerta operacional. */
  onDeadLetter?: (job: InboxDeadLetter) => void;
}

/** Um ciclo de jobs de canal (testável com PGlite). */
export async function runOnce(opts: WorkerRunOptions = {}): Promise<{ processed: number }> {
  const env = opts.env ?? loadEnv();
  const log =
    opts.log ??
    ((msg: string) => {
      createLogger({ level: env.LOG_LEVEL }).info({}, msg);
    });
  if (!opts.db && !env.DATABASE_URL) {
    log('DATABASE_URL ausente — pulando ciclo de jobs');
    return Promise.resolve({ processed: 0 });
  }
  const db = opts.db ?? getWorkerDb(env);
  if (!db) {
    log('DATABASE_URL ausente — pulando ciclo de jobs');
    return Promise.resolve({ processed: 0 });
  }
  const fakeChannel = opts.fakeChannel ?? undefined;
  // `dry_run` só fora de produção e só sem META_MODE; em produção sem modo, os jobs da Meta
  // falham como "não configurado" em vez de rodar no FAKE (P1-12).
  const metaAdsOptions: Parameters<typeof getMetaAdsProvider>[0] = {};
  const metaMode = resolveMetaMode(env);
  if (metaMode) {
    metaAdsOptions.mode = metaMode;
  }
  if (env.META_ACCESS_TOKEN) {
    metaAdsOptions.accessToken = env.META_ACCESS_TOKEN;
  }
  if (env.META_AD_ACCOUNT_ID) {
    metaAdsOptions.adAccountId = env.META_AD_ACCOUNT_ID;
  }
  const metaAds = getMetaAdsProvider(metaAdsOptions);
  const logger = opts.logger ? { logger: opts.logger } : {};

  const [channels, inbox, metaJobs] = await Promise.all([
    runChannelJobs({
      db,
      adapterFor: (channel) =>
        getChannelAdapter(channel as never, fakeChannel ? { fake: fakeChannel } : undefined),
      limit: 10,
      log,
      ...logger,
    }),
    runInboxJobs({
      db,
      limit: 10,
      log,
      env,
      ...logger,
      ...(opts.onDeadLetter ? { onDeadLetter: opts.onDeadLetter } : {}),
    }),
    runMetaJobs({ db, meta: metaAds, limit: 10, log, ...logger }),
  ]);
  return { processed: channels.processed + inbox.processed + metaJobs.processed };
}

/** Dependências de `run` que os testes substituem; em produção vêm do ambiente. */
export interface WorkerDeps {
  db?: AppDb;
  logger?: WorkerLogger;
  pollIntervalMs?: number;
  /** Porta do health HTTP; sem ela, usa WORKER_HEALTH_PORT (ausente: sem health). */
  healthPort?: number;
  /** Espera pelos jobs em andamento no sinal; sem ela, WORKER_SHUTDOWN_TIMEOUT_MS ou 20 s. */
  shutdownTimeoutMs?: number;
  /** Ciclo substituto (testes de shutdown). */
  runCycle?: () => Promise<unknown>;
}

/** Fecha o pool (pg) ou o banco em memória (PGlite), sem esperar além do limite. */
async function closeDb(db: AppDb, timeoutMs: number): Promise<boolean> {
  const client = db.$client as unknown as {
    end?: () => Promise<void>;
    close?: () => Promise<void>;
  };
  const closing =
    typeof client.end === 'function'
      ? client.end()
      : typeof client.close === 'function'
        ? client.close()
        : Promise.resolve();
  let expire: (closed: boolean) => void = () => undefined;
  const expired = new Promise<boolean>((resolve) => {
    expire = resolve;
  });
  const limit = setTimeout(() => {
    expire(false);
  }, timeoutMs);
  const closed = await Promise.race([
    closing.then(
      () => true,
      () => false,
    ),
    expired,
  ]);
  clearTimeout(limit);
  return closed;
}

/**
 * Executa o worker. Com `--run-once`, um único ciclo (testável); senão o loop com poll, o health
 * HTTP (WORKER_HEALTH_PORT) e o encerramento gracioso em SIGTERM/SIGINT: para de pegar jobs,
 * espera os em andamento até o limite, fecha health e pool e deixa o processo sair sozinho
 * (auditoria 2026-09-10, P2-10). `process.exit` só depois do limite, se algo ainda o segurar.
 */
export async function run(argv: string[], deps: WorkerDeps = {}): Promise<void> {
  // Sem NODE_ENV, ou em produção sem banco e providers explícitos, lança ConfigError com a
  // lista do que falta (P1-12) — antes de qualquer ciclo.
  const env = loadRuntimeEnv('worker');
  const log: WorkerLogger = deps.logger ?? createLogger({ level: env.LOG_LEVEL });
  const runOnceFlag = argv.includes('--run-once');

  const fakeProviders = fakeProvidersInUse(env, 'worker');
  if (env.NODE_ENV === 'production' && fakeProviders.length > 0) {
    log.warn(
      { fakeProviders },
      'ALLOW_FAKE_PROVIDERS=true: worker em produção com providers FAKE, mock ou dry_run',
    );
  }
  log.info({ runOnce: runOnceFlag }, 'worker started');

  const onDeadLetter = (job: InboxDeadLetter): void => {
    log.error(
      {
        event: 'inbox.dead_letter',
        jobId: job.id,
        provider: job.provider,
        attempts: job.attempts,
        lastError: job.lastError,
      },
      'job descartado após esgotar as tentativas',
    );
  };

  if (runOnceFlag) {
    const { processed } = await runOnce({
      env,
      ...(deps.db ? { db: deps.db } : {}),
      logger: log,
      onDeadLetter,
      log: (msg: string) => {
        log.info({}, msg);
      },
    });
    log.info({ processed }, 'worker run-once completed');
    return;
  }

  const db = deps.db ?? getWorkerDb(env);
  const pollIntervalMs = deps.pollIntervalMs ?? JOB_POLL_INTERVAL_MS;
  const shutdownTimeoutMs =
    deps.shutdownTimeoutMs ?? env.WORKER_SHUTDOWN_TIMEOUT_MS ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

  const runCycle =
    deps.runCycle ??
    (async () => {
      const startedAt = performance.now();
      const { processed } = await runOnce({
        env,
        ...(db ? { db } : {}),
        logger: log,
        onDeadLetter,
        log: (msg: string) => {
          log.debug({}, msg);
        },
      });
      log.debug(
        { event: 'worker.cycle', processed, durationMs: Math.round(performance.now() - startedAt) },
        'ciclo de jobs concluído',
      );
    });

  const loop = createJobLoop({
    intervalMs: pollIntervalMs,
    runCycle,
    onCycleError: (err) => {
      log.error({ event: 'worker.cycle_failed', err }, 'job cycle failed');
    },
  });

  let health: HealthServer | null = null;
  const healthPort = deps.healthPort ?? env.WORKER_HEALTH_PORT;
  if (healthPort !== undefined) {
    health = await startHealthServer({
      port: healthPort,
      state: () => loop.state(),
      policy: defaultHealthPolicy(pollIntervalMs),
    });
    log.info({ event: 'worker.health.listening', port: health.port }, 'health HTTP no ar');
  }

  const disposeHeartbeat = startHeartbeat(HEARTBEAT_INTERVAL_MS, (tick) => {
    log.debug({ tick }, 'heartbeat');
  });
  loop.start();

  let stopping: Promise<void> | null = null;
  const onSignal = (signal: NodeJS.Signals): void => {
    stopping ??= shutdown(signal);
  };

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    log.info(
      { event: 'worker.stopping', signal, timeoutMs: shutdownTimeoutMs },
      'worker parando: não pega jobs novos e espera os em andamento',
    );
    const inFlightSince = loop.state().cycleStartedAt;
    const outcome = await loop.stop(shutdownTimeoutMs);
    disposeHeartbeat();
    await health?.close();
    const dbClosed = db ? await closeDb(db, DB_CLOSE_TIMEOUT_MS) : true;
    if (db === dbSingleton) {
      dbSingleton = null;
    }
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);

    if (outcome === 'timeout' || !dbClosed) {
      process.exitCode = 1;
      log.error(
        {
          event: 'worker.shutdown_timeout',
          signal,
          timeoutMs: shutdownTimeoutMs,
          cycleInFlightSince: inFlightSince === null ? null : new Date(inFlightSince).toISOString(),
          dbClosed,
        },
        'jobs em andamento não terminaram no prazo; a execução expirada volta à fila pelo reaper',
      );
      // Último recurso: se um job preso ainda segurar o processo, sai depois de uma folga.
      setTimeout(() => {
        process.exit(1);
      }, FORCED_EXIT_GRACE_MS).unref();
      return;
    }
    log.info({ event: 'worker.stopped', signal }, 'worker parado');
  }

  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('index.ts') || entry.endsWith('index.js')) {
  try {
    await run(process.argv.slice(2));
  } catch (err: unknown) {
    // Configuração inválida: só a lista do que falta, sem pilha.
    console.error(err instanceof ConfigError ? err.message : err);
    process.exitCode = 1;
  }
}
