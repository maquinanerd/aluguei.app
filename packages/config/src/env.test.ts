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

  /**
   * Regressão da queda de 2026-09-24: o Coolify repassa as variáveis do compose
   * a todos os serviços, então uma opção declarada para um serviço chega **vazia**
   * nos outros. Vazio tem de valer como ausente; antes disso a API recusava a
   * subida com "expected one of" e o contêiner reiniciava em laço.
   */
  it('trata opção vazia como ausente, não como valor inválido', () => {
    const env = envSchema.parse({
      API_BASE_URL_ALLOW_HTTP: '',
      ALLOW_FAKE_PROVIDERS: '',
      COOKIE_SECURE: '',
      STORAGE_FORCE_PATH_STYLE: '',
      META_MODE: '',
      SIGNATURE_PROVIDER: '',
      SCREENING_PROVIDER: '',
      ASAAS_ENV: '',
      PAYMENT_PROVIDER: '',
    });
    expect(env.API_BASE_URL_ALLOW_HTTP).toBeUndefined();
    expect(env.ALLOW_FAKE_PROVIDERS).toBeUndefined();
    expect(env.COOKIE_SECURE).toBeUndefined();
    expect(env.STORAGE_FORCE_PATH_STYLE).toBeUndefined();
    expect(env.META_MODE).toBeUndefined();
    expect(env.SIGNATURE_PROVIDER).toBeUndefined();
    expect(env.SCREENING_PROVIDER).toBeUndefined();
    expect(env.ASAAS_ENV).toBeUndefined();
    expect(env.PAYMENT_PROVIDER).toBeUndefined();
  });

  it('continua recusando valor fora das opções', () => {
    expect(() => envSchema.parse({ API_BASE_URL_ALLOW_HTTP: 'sim' })).toThrow();
    expect(() => envSchema.parse({ META_MODE: 'producao' })).toThrow();
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
