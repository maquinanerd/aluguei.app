import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, startTelemetry, tracesUrl, withSpan } from './telemetry.js';
import type { Telemetry } from './telemetry.js';

/**
 * P2-11 (auditoria 2026-09-10): o tracer subia sem instrumentação nenhuma — com
 * OTEL_EXPORTER_OTLP_ENDPOINT definido nenhum span era criado. `startTelemetry` registra HTTP
 * (servidor Node), fetch (undici) e pg; aqui a prova é com um exportador em memória (a de pg,
 * com PostgreSQL real, está em tests/integration/src/otel-*.pg.test.ts).
 */
describe('startTelemetry sem destino', () => {
  it('sem endpoint e sem exportador fica desligada e o shutdown não falha', async () => {
    const telemetry = startTelemetry({ serviceName: 'aluguei-teste' });
    expect(telemetry.enabled).toBe(false);
    await expect(telemetry.forceFlush()).resolves.toBeUndefined();
    await expect(telemetry.shutdown()).resolves.toBeUndefined();
  });

  it('o endpoint é a base do coletor: /v1/traces é acrescentado uma vez', () => {
    expect(tracesUrl('http://coletor:4318')).toBe('http://coletor:4318/v1/traces');
    expect(tracesUrl('http://coletor:4318/')).toBe('http://coletor:4318/v1/traces');
    expect(tracesUrl('http://coletor:4318/v1/traces')).toBe('http://coletor:4318/v1/traces');
  });
});

describe('startTelemetry com exportador em memória', () => {
  const exporter = new InMemorySpanExporter();
  let telemetry: Telemetry;

  beforeAll(() => {
    telemetry = startTelemetry({
      serviceName: 'aluguei-teste',
      serviceVersion: '9.9.9',
      environment: 'test',
      spanExporter: exporter,
      simpleProcessor: true,
    });
  });

  afterAll(async () => {
    await telemetry.shutdown();
  });

  beforeEach(() => {
    exporter.reset();
  });

  it('request HTTP gera span de servidor, e o fetch que o fez, span de cliente no mesmo trace', async () => {
    expect(telemetry.enabled).toBe(true);
    const { createServer } = await import('node:http');
    const server = createServer((_req, res) => {
      res.writeHead(204);
      res.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${String(port)}/recurso?x=1`);
      expect(res.status).toBe(204);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    await telemetry.forceFlush();

    const spans = exporter.getFinishedSpans();
    const serverSpan = spans.find((span) => span.kind === SpanKind.SERVER);
    const clientSpan = spans.find((span) => span.kind === SpanKind.CLIENT);
    expect(serverSpan, JSON.stringify(spans.map((s) => s.name))).toBeDefined();
    expect(serverSpan?.attributes['http.request.method']).toBe('GET');
    expect(serverSpan?.attributes['url.path']).toBe('/recurso');
    expect(serverSpan?.attributes['http.response.status_code']).toBe(204);
    expect(serverSpan?.resource.attributes['service.name']).toBe('aluguei-teste');
    expect(serverSpan?.resource.attributes['service.version']).toBe('9.9.9');
    expect(clientSpan, 'span do fetch (undici)').toBeDefined();
    expect(clientSpan?.spanContext().traceId).toBe(serverSpan?.spanContext().traceId);
  });

  it('withSpan: o span fica ativo durante a função e erro sai marcado no span', async () => {
    const result = await withSpan('job PAYMENT', { 'job.id': 'j-1' }, () => {
      expect(trace.getActiveSpan()).toBeDefined();
      return Promise.resolve(42);
    });
    expect(result).toBe(42);
    await expect(
      withSpan('job SCREENING', { 'job.id': 'j-2' }, () => Promise.reject(new Error('falhou'))),
    ).rejects.toThrow('falhou');
    await telemetry.forceFlush();

    const spans = exporter.getFinishedSpans();
    const ok = spans.find((span) => span.name === 'job PAYMENT');
    const failed = spans.find((span) => span.name === 'job SCREENING');
    expect(ok?.attributes['job.id']).toBe('j-1');
    expect(ok?.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(failed?.status.code).toBe(SpanStatusCode.ERROR);
    expect(failed?.events.some((event) => event.name === 'exception')).toBe(true);
  });
});
