import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { pino, type Logger } from 'pino';
import { createLogger } from './logger.js';

function captureLog(level: string): { log: Logger; output: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  const log = pino(
    {
      level,
      redact: {
        paths: ['token', 'password', 'authorization', '*.headers.authorization'],
        censor: '[REDACTED]',
      },
    },
    stream,
  );
  return { log, output: () => Buffer.concat(chunks).toString('utf8') };
}

describe('createLogger', () => {
  it('cria logger sem configuração externa', () => {
    const log = createLogger();
    expect(log).toBeDefined();
    log.info({ probe: true }, 'logger ok');
  });

  it('redige token em primeiro nível', () => {
    const { log, output } = captureLog('info');
    log.info({ token: 'super-secret', visible: 1 }, 'probe');
    const text = output();
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain('super-secret');
    expect(text).toContain('"visible":1');
  });

  it('redige authorization em headers aninhados', () => {
    const { log, output } = captureLog('info');
    log.info({ req: { headers: { authorization: 'Bearer abc-123' } } }, 'probe');
    const text = output();
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain('abc-123');
  });
});

// O antigo `initTracer` (tracer sem instrumentação) saiu no lugar de `startTelemetry`: o caso
// "sem endpoint não liga nada e o shutdown não falha" está em telemetry.test.ts.
