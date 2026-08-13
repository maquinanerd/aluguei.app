import { loadEnv } from '@aluguei/config';
import { createLogger } from '@aluguei/observability';
import { startHeartbeat } from './heartbeat.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

/** Executa o worker. Com `--run-once`, executa uma única vez e resolve (testável). */
export function run(argv: string[]): Promise<void> {
  const env = loadEnv();
  const log = createLogger({ level: env.LOG_LEVEL });
  const runOnce = argv.includes('--run-once');

  log.info({ runOnce }, 'worker started');

  if (runOnce) {
    log.info('worker run-once completed');
    return Promise.resolve();
  }

  const dispose = startHeartbeat(HEARTBEAT_INTERVAL_MS, (tick) => {
    log.debug({ tick }, 'heartbeat');
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'worker stopping');
    dispose();
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
