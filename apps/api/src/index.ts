import { loadEnv } from '@aluguei/config';
import { createLogger, initTracer, loggerOptions } from '@aluguei/observability';
import { buildApp } from './app.js';

const env = loadEnv();
const log = createLogger({ level: env.LOG_LEVEL });
const tracer = initTracer({ serviceName: 'aluguei-api', serviceVersion: '0.2.0' });

const app = await buildApp({ logger: loggerOptions({ level: env.LOG_LEVEL }), env });

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, 'shutting down api');
  await app.close();
  await tracer.shutdown();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  log.info({ host: env.API_HOST, port: env.API_PORT }, 'api listening');
} catch (err) {
  log.error(err, 'api failed to start');
  await tracer.shutdown();
  process.exit(1);
}
