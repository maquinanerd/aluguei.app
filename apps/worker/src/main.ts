import { ConfigError, loadRuntimeEnv } from '@aluguei/config';
import { createLogger, installProcessErrorHandlers, startTelemetry } from '@aluguei/observability';

/**
 * Ponto de entrada do worker (`node --import tsx apps/worker/src/main.ts`). Em ordem:
 * 1. configuração validada (auditoria 2026-09-10, P1-12) — sem NODE_ENV, ou em produção sem
 *    banco e providers explícitos, imprime o que falta e termina;
 * 2. telemetria (P2-11) — os instrumentadores de pg e HTTP só enxergam módulos carregados
 *    depois, então o worker entra por import dinâmico;
 * 3. o loop de jobs, com captura de erro do processo: promise rejeitada ou exceção sem
 *    tratamento ficam registradas e levam ao encerramento gracioso, com código 1.
 */
try {
  const env = loadRuntimeEnv('worker');
  const log = createLogger({ level: env.LOG_LEVEL });
  const telemetry = startTelemetry({
    serviceName: 'aluguei-worker',
    serviceVersion: '0.4.0',
    environment: env.NODE_ENV,
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  });
  if (telemetry.enabled) {
    log.info({ event: 'telemetry.enabled', service: 'aluguei-worker' }, 'tracing OTLP ligado');
  }
  const { run } = await import('./index.js');
  const worker = await run(process.argv.slice(2), { logger: log, telemetry });
  installProcessErrorHandlers(log, {
    onFatal: (_err, kind) => {
      process.exitCode = 1;
      void worker.stop(kind);
    },
  });
  if (process.argv.includes('--run-once')) {
    await telemetry.shutdown();
  }
} catch (err: unknown) {
  // Configuração inválida: só a lista do que falta, sem pilha.
  console.error(err instanceof ConfigError ? err.message : err);
  process.exitCode = 1;
}
