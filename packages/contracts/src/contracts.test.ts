import { describe, expect, it } from 'vitest';
import { errorResponseSchema, healthResponseSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('aceita payload válido', () => {
    const payload = {
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      timestamp: '2026-08-13T00:00:00.000Z',
    };
    expect(() => healthResponseSchema.parse(payload)).not.toThrow();
  });

  it('rejeita status desconhecido', () => {
    expect(() =>
      healthResponseSchema.parse({
        status: 'degraded',
        service: 'api',
        version: '0.1.0',
        timestamp: 'x',
      }),
    ).toThrow();
  });
});

describe('errorResponseSchema', () => {
  it('aceita payload mínimo', () => {
    const payload = { error: 'Bad Request', code: 'BAD_REQUEST', message: 'Campo inválido' };
    expect(() => errorResponseSchema.parse(payload)).not.toThrow();
  });
});
