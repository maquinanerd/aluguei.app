import { loadEnv } from '@aluguei/config';
import { createLogger } from '@aluguei/observability';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { getChannelAdapter } from '@aluguei/integrations';
import type { FakeChannel } from '@aluguei/integrations';
import { runChannelJobs } from './channelJobs.js';
import { runInboxJobs } from './inboxJobs.js';
import { runMetaJobs } from './metaJobs.js';
import { startHeartbeat } from './heartbeat.js';
import { getMetaAdsProvider } from '@aluguei/integrations';

export { runChannelJobs, runInboxJobs, runMetaJobs };

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
  fakeChannel?: FakeChannel;
  pollIntervalMs?: number;
  log?: (msg: string) => void;
}

/** Um ciclo de jobs de canal (testável com PGlite). */
export async function runOnce(opts: WorkerRunOptions = {}): Promise<{ processed: number }> {
  const env = loadEnv();
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
  const metaAdsOptions: Parameters<typeof getMetaAdsProvider>[0] = {
    mode: process.env.META_MODE === 'live' ? 'live' : 'dry_run',
  };
  if (process.env.META_ACCESS_TOKEN) {
    metaAdsOptions.accessToken = process.env.META_ACCESS_TOKEN;
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
    runInboxJobs({ db, limit: 10, log }),
    runMetaJobs({ db, meta: metaAds, limit: 10, log }),
  ]);
  return { processed: channels.processed + inbox.processed + metaJobs.processed };
}

/** Executa o worker. Com `--run-once`, um único ciclo (testável); senão loop com poll. */
export function run(argv: string[]): Promise<void> {
  const env = loadEnv();
  const log = createLogger({ level: env.LOG_LEVEL });
  const runOnceFlag = argv.includes('--run-once');

  log.info({ runOnce: runOnceFlag }, 'worker started');

  if (runOnceFlag) {
    return runOnce({
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

  const poll = setInterval(() => {
    runOnce({
      log: (msg: string) => {
        log.debug(msg);
      },
    }).catch((err: unknown) => {
      log.error(err, 'channel job cycle failed');
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
  run(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
