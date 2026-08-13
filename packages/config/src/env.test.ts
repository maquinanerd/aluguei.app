import { describe, expect, it } from 'vitest';
import { envSchema, loadEnv } from './env.js';

describe('envSchema', () => {
  it('aplica defaults sem configuração', () => {
    const env = envSchema.parse({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('rejeita valores inválidos', () => {
    expect(() => envSchema.parse({ API_PORT: 'abc' })).toThrow();
    expect(() => envSchema.parse({ NODE_ENV: 'staging' })).toThrow();
  });
});

describe('loadEnv', () => {
  it('carrega e valida de uma fonte', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/aluguei' });
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/aluguei');
  });

  it('lança erro tipado em fonte inválida', () => {
    expect(() => loadEnv({ API_PORT: 'x' })).toThrow(/Invalid environment/);
  });
});
