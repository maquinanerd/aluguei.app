import { ConfigError, fakeProvidersInUse, loadRuntimeEnv } from '@aluguei/config';
import type { AppEnv } from '@aluguei/config';
import { createLogger, initTracer, loggerOptions } from '@aluguei/observability';

/**
 * Ponto de entrada da API. A configuração é validada antes de tudo (auditoria 2026-09-10,
 * P1-12): sem NODE_ENV, ou em produção sem banco, URLs, segredos e providers explícitos, o
 * processo termina com a lista do que falta, sem subir o servidor. O app só é importado depois.
 */
function readConfig(): AppEnv | null {
  try {
    return loadRuntimeEnv('api');
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      return null;
    }
    throw err;
  }
}

async function main(env: AppEnv): Promise<void> {
  const log = createLogger({ level: env.LOG_LEVEL });
  const fakeProviders = fakeProvidersInUse(env, 'api');
  if (env.NODE_ENV === 'production' && fakeProviders.length > 0) {
    log.warn(
      { fakeProviders },
      'ALLOW_FAKE_PROVIDERS=true: API em produção com providers FAKE, mock ou dry_run',
    );
  }
  const tracer = initTracer({ serviceName: 'aluguei-api', serviceVersion: '0.2.0' });

  const { buildApp } = await import('./app.js');
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
}

const env = readConfig();
if (env) {
  await main(env);
} else {
  process.exitCode = 1;
}
