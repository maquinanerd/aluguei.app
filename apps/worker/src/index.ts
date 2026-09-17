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
import { getChannelAdapter } from '@aluguei/integrations';
import type { FakeChannel } from '@aluguei/integrations';
import { runChannelJobs } from './channelJobs.js';
import { runInboxJobs } from './inboxJobs.js';
import type { InboxDeadLetter } from './inboxJobs.js';
import { runMetaJobs } from './metaJobs.js';
import { startHeartbeat } from './heartbeat.js';
import { getMetaAdsProvider } from '@aluguei/integrations';

export { runChannelJobs, runInboxJobs, runMetaJobs };
export { processPaymentJob } from './paymentJobs.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const JOB_POLL_INTERVAL_MS = 5_000;

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

export interface WorkerRunOptions {
  db?: AppDb;
  /** Configuração já validada (`run`); sem ela, lê o ambiente do processo. */
  env?: AppEnv;
  fakeChannel?: FakeChannel;
  pollIntervalMs?: number;
  log?: (msg: string) => void;
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

  const [channels, inbox, metaJobs] = await Promise.all([
    runChannelJobs({
      db,
      adapterFor: (channel) =>
        getChannelAdapter(channel as never, fakeChannel ? { fake: fakeChannel } : undefined),
      limit: 10,
      log,
    }),
    runInboxJobs({
      db,
      limit: 10,
      log,
      env,
      ...(opts.onDeadLetter ? { onDeadLetter: opts.onDeadLetter } : {}),
    }),
    runMetaJobs({ db, meta: metaAds, limit: 10, log }),
  ]);
  return { processed: channels.processed + inbox.processed + metaJobs.processed };
}

/** Executa o worker. Com `--run-once`, um único ciclo (testável); senão loop com poll. */
export function run(argv: string[]): Promise<void> {
  // Sem NODE_ENV, ou em produção sem banco e providers explícitos, lança ConfigError com a
  // lista do que falta (P1-12) — antes de qualquer ciclo.
  const env = loadRuntimeEnv('worker');
  const log = createLogger({ level: env.LOG_LEVEL });
  const runOnceFlag = argv.includes('--run-once');

  const fakeProviders = fakeProvidersInUse(env, 'worker');
  if (env.NODE_ENV === 'production' && fakeProviders.length > 0) {
    log.warn(
      { fakeProviders },
      'ALLOW_FAKE_PROVIDERS=true: worker em produção com providers FAKE, mock ou dry_run',
    );
  }
  log.info({ runOnce: runOnceFlag }, 'worker started');

  if (runOnceFlag) {
    return runOnce({
      env,
      log: (msg: string) => {
        log.info(msg);
      },
    }).then(({ processed }) => {
      log.info({ processed }, 'worker run-once completed');
    });
  }

  const dispose = startHeartbeat(HEARTBEAT_INTERVAL_MS, (tick) => {
    log.debug({ tick }, 'heartbeat');
  });

  // Um ciclo por vez: ciclos sobrepostos processavam o mesmo evento em
  // paralelo dentro do próprio worker (auditoria 2026-09-10, P0-01).
  let cycleInFlight = false;
  const poll = setInterval(() => {
    if (cycleInFlight) {
      log.debug({}, 'ciclo anterior ainda em execução — aguardando');
      return;
    }
    cycleInFlight = true;
    runOnce({
      env,
      log: (msg: string) => {
        log.debug(msg);
      },
      onDeadLetter: (job) => {
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
      },
    })
      .catch((err: unknown) => {
        log.error(err, 'job cycle failed');
      })
      .finally(() => {
        cycleInFlight = false;
      });
  }, JOB_POLL_INTERVAL_MS);

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'worker stopping');
    dispose();
    clearInterval(poll);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  return Promise.resolve();
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
