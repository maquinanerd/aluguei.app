import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TracerLifecycle {
  shutdown(): Promise<void>;
}

export interface InitTracerOptions {
  serviceName?: string;
  serviceVersion?: string;
  endpoint?: string;
}

/**
 * Inicializa o tracer OTel apenas quando um endpoint OTLP está configurado.
 * Sem endpoint, retorna um lifecycle noop — o boot nunca falha por telemetria.
 */
export function initTracer(opts: InitTracerOptions = {}): TracerLifecycle {
  const endpoint = opts.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return { shutdown: () => Promise.resolve() };
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: opts.serviceName ?? 'aluguei-app',
      [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
  });

  sdk.start();
  return {
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
}
