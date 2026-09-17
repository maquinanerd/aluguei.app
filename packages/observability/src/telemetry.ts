import { createRequire } from 'node:module';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, Span } from '@opentelemetry/api';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/** Exportador em memória e tipos de span usados nos testes (sem depender do SDK direto). */
export const InMemorySpanExporter = tracing.InMemorySpanExporter;
export type ReadableSpan = tracing.ReadableSpan;
export type SpanExporter = tracing.SpanExporter;

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  /** `deployment.environment.name` (NODE_ENV). */
  environment?: string;
  /** Base do coletor OTLP/HTTP (OTEL_EXPORTER_OTLP_ENDPOINT); sem ela, telemetria desligada. */
  endpoint?: string;
  /** Exportador substituto (testes com exportador em memória). */
  spanExporter?: tracing.SpanExporter;
  /** Exporta span por span, sem lote (testes). */
  simpleProcessor?: boolean;
}

export interface Telemetry {
  /** false quando não há destino: nenhum instrumentador é registrado. */
  enabled: boolean;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

const DISABLED: Telemetry = {
  enabled: false,
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

/**
 * URL de traces a partir da base do coletor. `OTEL_EXPORTER_OTLP_ENDPOINT` é a base (padrão
 * OTEL) e o caminho `/v1/traces` é acrescentado uma vez — antes o endpoint ia cru para o
 * exportador e o coletor recebia POST na raiz.
 */
export function tracesUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  return base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
}

/**
 * Inicializa tracing com instrumentação de HTTP (servidor e cliente `node:http`), `fetch`
 * (undici) e `pg` (auditoria 2026-09-10, P2-11: o tracer subia sem instrumentação e nenhum span
 * era criado). Só liga com endpoint OTLP ou exportador injetado; sem isso, nada é registrado e
 * o boot não depende de telemetria.
 *
 * Precisa ser chamada ANTES de carregar app, banco e filas: os instrumentadores enxergam apenas
 * módulos carregados depois (os pontos de entrada importam o resto por import dinâmico).
 * Métricas e logs OTLP ficam desligados — esta fase só usa tracing.
 */
export function startTelemetry(opts: TelemetryOptions): Telemetry {
  const exporter =
    opts.spanExporter ??
    (opts.endpoint ? new OTLPTraceExporter({ url: tracesUrl(opts.endpoint) }) : null);
  if (!exporter) {
    return DISABLED;
  }
  const processor = opts.simpleProcessor
    ? new tracing.SimpleSpanProcessor(exporter)
    : new tracing.BatchSpanProcessor(exporter);
  const sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: opts.serviceName,
        [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? '0.1.0',
        ...(opts.environment ? { 'deployment.environment.name': opts.environment } : {}),
      }),
    ),
    // Sem detectores: nada de linha de comando, usuário e máquina no recurso.
    autoDetectResources: false,
    spanProcessors: [processor],
    metricReaders: [],
    logRecordProcessors: [],
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation(),
      new UndiciInstrumentation(),
    ],
  });
  sdk.start();
  // `http`/`https` são módulos nativos: o patch chega pelo hook de require, e o prototype do
  // Server é compartilhado com quem importou por ESM. Sem este require, um servidor criado a
  // partir de `import { createServer } from 'node:http'` ficaria sem span.
  const require = createRequire(import.meta.url);
  require('node:http');
  require('node:https');

  return {
    enabled: true,
    forceFlush: () => processor.forceFlush(),
    shutdown: async () => {
      await sdk.shutdown();
      // Libera os globais: um novo startTelemetry no mesmo processo (testes) volta a registrar.
      trace.disable();
    },
  };
}

/** Marca o erro no span: evento de exceção com a pilha e status de erro. */
export function markSpanError(span: Span | undefined, err: unknown): void {
  if (!span) {
    return;
  }
  span.recordException(err instanceof Error ? err : new Error(String(err)));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err instanceof Error ? err.message : String(err),
  });
}

/** Span ativo atual (a API fica no-op quando a telemetria está desligada). */
export function activeSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Executa `fn` dentro de um span ativo — o que ele fizer (queries pg, chamadas HTTP) entra no
 * mesmo trace. Erro é marcado no span e propagado.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('aluguei');
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      markSpanError(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Nomeia o span do request com a rota do Fastify (`GET /properties/:id`) em vez do método
 * solto, e grava `http.route`. Sem span ativo (telemetria desligada) não faz nada.
 */
export function annotateHttpRoute(method: string, route: string | undefined): void {
  const span = trace.getActiveSpan();
  if (!span || !route) {
    return;
  }
  span.setAttribute('http.route', route);
  span.updateName(`${method} ${route}`);
}
