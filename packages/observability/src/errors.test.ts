import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';
import { captureError, errorDetails, installProcessErrorHandlers } from './errors.js';
import { InMemorySpanExporter, startTelemetry, withSpan } from './telemetry.js';
import type { Telemetry } from './telemetry.js';

/**
 * P2-11 (auditoria 2026-09-10): não havia captura de erro — um 5xx da API, uma falha de job ou
 * uma promise rejeitada sem tratamento não deixavam registro estruturado com pilha e não
 * marcavam o span. `captureError` faz os dois; `installProcessErrorHandlers` cobre
 * `unhandledRejection` e `uncaughtException` sem derrubar o processo na hora.
 */
interface Entry {
  obj: Record<string, unknown>;
  msg: string;
}

function sink(): { entries: Entry[]; error: (obj: Record<string, unknown>, msg: string) => void } {
  const entries: Entry[] = [];
  return {
    entries,
    error: (obj, msg) => {
      entries.push({ obj, msg });
    },
  };
}

describe('errorDetails', () => {
  it('tipo, mensagem saneada e pilha sem a mensagem original', () => {
    const err = new Error('falha ao chamar https://provider.exemplo/token?key=segredo');
    const details = errorDetails(err, 'falha ao chamar [url]');
    expect(details.type).toBe('Error');
    expect(details.message).toBe('falha ao chamar [url]');
    expect(details.stack).toContain('Error: falha ao chamar [url]');
    expect(details.stack).not.toContain('segredo');
    expect(details.stack).toContain('errors.test.ts');
  });

  it('erro que não é Error vira tipo e texto', () => {
    const details = errorDetails('quebrou');
    expect(details.type).toBe('String');
    expect(details.message).toBe('quebrou');
  });
});

describe('captureError', () => {
  const exporter = new InMemorySpanExporter();
  let telemetry: Telemetry;

  beforeAll(() => {
    telemetry = startTelemetry({
      serviceName: 'aluguei-teste',
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

  it('registra o erro com origem e pilha e marca o span ativo', async () => {
    const log = sink();
    await withSpan('GET /rota', {}, () => {
      captureError(log, new Error('quebrou'), { kind: 'http_5xx', route: '/rota' });
      return Promise.resolve();
    });
    await telemetry.forceFlush();

    const [entry] = log.entries;
    expect(entry?.obj.event).toBe('error.captured');
    expect(entry?.obj.kind).toBe('http_5xx');
    expect(entry?.obj.route).toBe('/rota');
    expect((entry?.obj.err as { stack?: string }).stack).toContain('Error: quebrou');

    const span = exporter.getFinishedSpans().find((candidate) => candidate.name === 'GET /rota');
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('sem span ativo continua registrando o erro', () => {
    const log = sink();
    captureError(log, new Error('fora de span'), { kind: 'job_failed', jobId: 'j-1' });
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.obj.jobId).toBe('j-1');
  });
});

describe('installProcessErrorHandlers', () => {
  it('captura unhandledRejection e uncaughtException e avisa quem encerra', () => {
    const log = sink();
    const target = new EventEmitter();
    const onFatal = vi.fn();
    const uninstall = installProcessErrorHandlers(log, {
      target: target as unknown as NodeJS.Process,
      onFatal,
    });

    target.emit('unhandledRejection', new Error('promise solta'), Promise.resolve());
    target.emit('uncaughtException', new Error('exceção solta'));

    expect(log.entries.map((entry) => entry.obj.kind)).toEqual([
      'unhandled_rejection',
      'uncaught_exception',
    ]);
    expect(log.entries[0]?.obj.event).toBe('error.captured');
    expect(onFatal).toHaveBeenCalledTimes(2);
    expect(onFatal.mock.calls[0]?.[1]).toBe('unhandled_rejection');

    uninstall();
    target.emit('uncaughtException', new Error('depois de desinstalar'));
    expect(log.entries).toHaveLength(2);
  });
});
