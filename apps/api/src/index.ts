import { ConfigError, fakeProvidersInUse, loadRuntimeEnv } from '@aluguei/config';
import type { AppEnv } from '@aluguei/config';
import {
  createLogger,
  installProcessErrorHandlers,
  loggerOptions,
  startTelemetry,
} from '@aluguei/observability';

/**
 * Ponto de entrada da API. Em ordem (auditoria 2026-09-10, P1-12 e P2-11):
 * 1. configuração validada — sem NODE_ENV, ou em produção sem banco, URLs, segredos e providers
 *    explícitos, o processo termina com a lista do que falta, sem subir o servidor;
 * 2. telemetria — os instrumentadores de HTTP e pg só enxergam módulos carregados depois;
 * 3. o app (import dinâmico), que aí já nasce instrumentado.
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

  const telemetry = startTelemetry({
    serviceName: 'aluguei-api',
    serviceVersion: '0.2.0',
    environment: env.NODE_ENV,
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  if (telemetry.enabled) {
    log.info({ event: 'telemetry.enabled', service: 'aluguei-api' }, 'tracing OTLP ligado');
  }

  const { buildApp } = await import('./app.js');
  const app = await buildApp({ logger: loggerOptions({ level: env.LOG_LEVEL }), env });

  let stopping: Promise<void> | null = null;
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ event: 'api.stopping', signal }, 'encerrando a API');
    await app.close();
    await telemetry.shutdown();
    log.info({ event: 'api.stopped', signal }, 'API encerrada');
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    stopping ??= shutdown(signal);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  // Promise rejeitada ou exceção sem tratamento: registro estruturado com pilha, marca no span
  // e encerramento gracioso com código 1 (auditoria 2026-09-10, P2-11).
  installProcessErrorHandlers(log, {
    onFatal: (_err, kind) => {
      process.exitCode = 1;
      stopping ??= shutdown(kind);
    },
  });

  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT });
    log.info({ host: env.API_HOST, port: env.API_PORT }, 'api listening');
  } catch (err) {
    log.error(err, 'api failed to start');
    await telemetry.shutdown();
    process.exitCode = 1;
  }
}

const env = readConfig();
if (env) {
  await main(env);
} else {
  process.exitCode = 1;
}
