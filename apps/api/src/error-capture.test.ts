import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from '@aluguei/observability';
import { buildApp } from './app.js';

/**
 * P2-11 (auditoria 2026-09-10): erro 5xx da API não gerava registro estruturado — só um
 * "unhandled error" sem origem e sem pilha utilizável. Todo 5xx sai como `error.captured` com
 * origem, rota, método e pilha; 4xx continua sem virar erro de servidor.
 */
function capture(): { stream: Writable; entries: () => Array<Record<string, unknown>> } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    entries: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('captura de erro da API (P2-11)', () => {
  it('erro 5xx vira error.captured com rota, método e pilha', async () => {
    const log = capture();
    const app = await buildApp({
      logger: { ...loggerOptions({ level: 'info' }), stream: log.stream },
    });
    app.get('/teste/erro-interno', () => {
      throw new Error('quebrou de propósito');
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/teste/erro-interno' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ code: 'INTERNAL' });
    } finally {
      await app.close();
    }

    const captured = log.entries().find((entry) => entry.event === 'error.captured');
    expect(captured, JSON.stringify(log.entries().map((e) => e.msg))).toBeDefined();
    expect(captured?.kind).toBe('http_5xx');
    expect(captured?.method).toBe('GET');
    expect(captured?.route).toBe('/teste/erro-interno');
    expect((captured?.err as { stack?: string }).stack).toContain('Error: quebrou de propósito');
  });

  it('4xx não é capturado como erro de servidor', async () => {
    const log = capture();
    const app = await buildApp({
      logger: { ...loggerOptions({ level: 'info' }), stream: log.stream },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/parties' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
    expect(log.entries().some((entry) => entry.event === 'error.captured')).toBe(false);
  });
});
