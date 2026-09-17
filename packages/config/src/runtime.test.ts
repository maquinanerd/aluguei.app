import { describe, expect, it } from 'vitest';
import { ConfigError, fakeProvidersInUse, loadRuntimeEnv } from './runtime.js';

/**
 * P1-12 (auditoria 2026-09-10): API e worker subiam em produção sem banco, sem segredos de
 * webhook e com providers FAKE por omissão. `loadRuntimeEnv` é o ponto de entrada dos dois
 * processos: exige NODE_ENV explícito e, em produção, lista tudo o que falta de uma vez.
 */

const HEX_64 = 'a'.repeat(64);

/** Variáveis da API na homologação (docker-compose.prod.yml), com valores fictícios. */
const HOMOLOGATION_API: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://aluguei:segredo-do-banco@aluguei-postgres:5432/aluguei',
  APP_BASE_URL: 'https://aluguei.example.com',
  COOKIE_SECURE: 'true',
  PAYMENT_PROVIDER: 'FAKE',
  SIGNATURE_PROVIDER: 'FAKE',
  SCREENING_PROVIDER: 'FAKE',
  META_MODE: 'dry_run',
  AI_PROVIDER: 'mock',
  SIGNATURE_WEBHOOK_TOKEN: HEX_64,
  ASAAS_WEBHOOK_TOKEN: HEX_64,
  META_APP_SECRET: HEX_64,
  META_WEBHOOK_VERIFY_TOKEN: HEX_64,
  META_TOKEN_ENCRYPTION_KEY: HEX_64,
};

/** Variáveis do worker na homologação. */
const HOMOLOGATION_WORKER: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://aluguei:segredo-do-banco@aluguei-postgres:5432/aluguei',
  PAYMENT_PROVIDER: 'FAKE',
  SIGNATURE_PROVIDER: 'FAKE',
  SCREENING_PROVIDER: 'FAKE',
  META_MODE: 'dry_run',
  AI_PROVIDER: 'mock',
  META_TOKEN_ENCRYPTION_KEY: HEX_64,
};

function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof ConfigError) {
      return [...err.problems];
    }
    throw err;
  }
  return [];
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return '';
}

describe('loadRuntimeEnv: NODE_ENV explícito', () => {
  it.each([undefined, ''])('NODE_ENV %j recusa a subida (sem default de desenvolvimento)', (v) => {
    const source: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://localhost/aluguei' };
    if (v !== undefined) {
      source.NODE_ENV = v;
    }
    const problems = problemsOf(() => loadRuntimeEnv('api', source));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^NODE_ENV ausente/);
  });

  it('NODE_ENV inválido é recusado com o nome da variável', () => {
    expect(problemsOf(() => loadRuntimeEnv('worker', { NODE_ENV: 'staging' }))[0]).toMatch(
      /^NODE_ENV/,
    );
  });

  it.each(['development', 'test'] as const)('%s sobe sem exigir configuração de produção', (v) => {
    const env = loadRuntimeEnv('api', { NODE_ENV: v });
    expect(env.NODE_ENV).toBe(v);
    expect(env.API_PORT).toBe(4000);
    expect(loadRuntimeEnv('worker', { NODE_ENV: v }).NODE_ENV).toBe(v);
  });
});

describe('loadRuntimeEnv: API em produção', () => {
  it('sem nada configurado lista todas as variáveis obrigatórias de uma vez', () => {
    const problems = problemsOf(() => loadRuntimeEnv('api', { NODE_ENV: 'production' }));
    for (const name of [
      'DATABASE_URL',
      'APP_BASE_URL',
      'ASAAS_WEBHOOK_TOKEN',
      'SIGNATURE_WEBHOOK_TOKEN',
      'META_APP_SECRET',
      'META_WEBHOOK_VERIFY_TOKEN',
      'META_TOKEN_ENCRYPTION_KEY',
      'PAYMENT_PROVIDER',
      'SIGNATURE_PROVIDER',
      'META_MODE',
      'AI_PROVIDER',
    ]) {
      expect(
        problems.some((p) => p.startsWith(name)),
        `${name} em ${JSON.stringify(problems)}`,
      ).toBe(true);
    }
  });

  it('a mensagem diz o serviço, o ambiente e cada problema numa linha', () => {
    const message = messageOf(() => loadRuntimeEnv('api', { NODE_ENV: 'production' }));
    expect(message).toMatch(/api/);
    expect(message).toMatch(/produção/);
    expect(message).toMatch(/\n\s+- DATABASE_URL/);
  });

  it('configuração da homologação sem ALLOW_FAKE_PROVIDERS é recusada e diz quais são FAKE', () => {
    const problems = problemsOf(() => loadRuntimeEnv('api', HOMOLOGATION_API));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/ALLOW_FAKE_PROVIDERS=true/);
    for (const fake of [
      'PAYMENT_PROVIDER=FAKE',
      'SIGNATURE_PROVIDER=FAKE',
      'META_MODE=dry_run',
      'AI_PROVIDER=mock',
    ]) {
      expect(problems[0]).toContain(fake);
    }
  });

  it('configuração da homologação com ALLOW_FAKE_PROVIDERS=true sobe', () => {
    const env = loadRuntimeEnv('api', { ...HOMOLOGATION_API, ALLOW_FAKE_PROVIDERS: 'true' });
    expect(env.NODE_ENV).toBe('production');
    expect(fakeProvidersInUse(env, 'api')).toEqual([
      'PAYMENT_PROVIDER=FAKE',
      'SIGNATURE_PROVIDER=FAKE',
      'META_MODE=dry_run',
      'AI_PROVIDER=mock',
    ]);
  });

  it.each(['1', 'TRUE', 'yes'])('ALLOW_FAKE_PROVIDERS=%s não vale como permissão', (value) => {
    const problems = problemsOf(() =>
      loadRuntimeEnv('api', { ...HOMOLOGATION_API, ALLOW_FAKE_PROVIDERS: value }),
    );
    expect(problems.some((p) => p.startsWith('ALLOW_FAKE_PROVIDERS'))).toBe(true);
  });

  it.each([
    [{ COOKIE_SECURE: 'false' }, 'COOKIE_SECURE'],
    [{ APP_BASE_URL: 'http://aluguei.example.com' }, 'APP_BASE_URL'],
    [{ DATABASE_URL: 'mysql://db/aluguei' }, 'DATABASE_URL'],
    [{ META_TOKEN_ENCRYPTION_KEY: 'curta' }, 'META_TOKEN_ENCRYPTION_KEY'],
    [{ PAYMENT_PROVIDER: 'ASAAS' }, 'ASAAS_API_KEY'],
    [{ PAYMENT_PROVIDER: 'ASAAS', ASAAS_API_KEY: 'chave' }, 'ASAAS_ENV'],
    [{ SIGNATURE_PROVIDER: 'CLICKSIGN' }, 'CLICKSIGN_API_TOKEN'],
    [{ SIGNATURE_PROVIDER: 'D4SIGN', D4SIGN_API_TOKEN: 'x' }, 'SIGNATURE_PROVIDER'],
    [{ META_MODE: 'live' }, 'WHATSAPP_ACCESS_TOKEN'],
    [{ META_MODE: 'live' }, 'META_ACCESS_TOKEN'],
    [{ AI_PROVIDER: 'openai' }, 'OPENAI_API_KEY'],
    [{ AI_PROVIDER: 'gemini' }, 'GEMINI_API_KEY'],
    [{ AI_PROVIDER: 'llama' }, 'AI_PROVIDER'],
    [{ REDIS_URL: 'http://cache:6379' }, 'REDIS_URL'],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: 'collector:4318' }, 'OTEL_EXPORTER_OTLP_ENDPOINT'],
  ] as Array<[NodeJS.ProcessEnv, string]>)('%j é recusado (%s)', (override, name) => {
    const problems = problemsOf(() =>
      loadRuntimeEnv('api', { ...HOMOLOGATION_API, ALLOW_FAKE_PROVIDERS: 'true', ...override }),
    );
    expect(
      problems.some((p) => p.startsWith(name)),
      JSON.stringify(problems),
    ).toBe(true);
  });

  it('providers reais com credenciais sobem sem permissão de FAKE', () => {
    const env = loadRuntimeEnv('api', {
      ...HOMOLOGATION_API,
      PAYMENT_PROVIDER: 'ASAAS',
      ASAAS_API_KEY: 'chave-asaas',
      ASAAS_ENV: 'sandbox',
      SIGNATURE_PROVIDER: 'CLICKSIGN',
      CLICKSIGN_API_TOKEN: 'token-clicksign',
      META_MODE: 'live',
      META_ACCESS_TOKEN: 'token-meta',
      WHATSAPP_ACCESS_TOKEN: 'token-whatsapp',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'chave-openai',
    });
    expect(fakeProvidersInUse(env, 'api')).toEqual([]);
  });

  it('a mensagem nunca repete o valor de uma variável', () => {
    const message = messageOf(() =>
      loadRuntimeEnv('api', {
        ...HOMOLOGATION_API,
        DATABASE_URL: 'mysql://root:senha-que-nao-pode-vazar@db/aluguei',
        META_TOKEN_ENCRYPTION_KEY: 'chave-que-nao-pode-vazar',
      }),
    );
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('senha-que-nao-pode-vazar');
    expect(message).not.toContain('chave-que-nao-pode-vazar');
  });
});

describe('loadRuntimeEnv: worker em produção', () => {
  it('sem nada configurado lista o que o worker precisa (e só isso)', () => {
    const problems = problemsOf(() => loadRuntimeEnv('worker', { NODE_ENV: 'production' }));
    for (const name of [
      'DATABASE_URL',
      'PAYMENT_PROVIDER',
      'SCREENING_PROVIDER',
      'META_MODE',
      'AI_PROVIDER',
    ]) {
      expect(problems.some((p) => p.startsWith(name))).toBe(true);
    }
    for (const apiOnly of ['APP_BASE_URL', 'ASAAS_WEBHOOK_TOKEN', 'SIGNATURE_PROVIDER']) {
      expect(problems.some((p) => p.startsWith(apiOnly))).toBe(false);
    }
  });

  it('configuração da homologação: recusa sem permissão e sobe com ALLOW_FAKE_PROVIDERS=true', () => {
    const problems = problemsOf(() => loadRuntimeEnv('worker', HOMOLOGATION_WORKER));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('SCREENING_PROVIDER=FAKE');
    const env = loadRuntimeEnv('worker', { ...HOMOLOGATION_WORKER, ALLOW_FAKE_PROVIDERS: 'true' });
    expect(fakeProvidersInUse(env, 'worker')).toEqual([
      'PAYMENT_PROVIDER=FAKE',
      'SCREENING_PROVIDER=FAKE',
      'META_MODE=dry_run',
      'AI_PROVIDER=mock',
    ]);
  });

  it.each([
    [{ SCREENING_PROVIDER: 'SERASA' }, 'SERASA_CLIENT_ID'],
    [
      { SCREENING_PROVIDER: 'SPC', SPC_CLIENT_ID: 'x', SPC_CLIENT_SECRET: 'y' },
      'SCREENING_PROVIDER',
    ],
  ] as Array<[NodeJS.ProcessEnv, string]>)('%j é recusado (%s)', (override, name) => {
    const problems = problemsOf(() =>
      loadRuntimeEnv('worker', {
        ...HOMOLOGATION_WORKER,
        ALLOW_FAKE_PROVIDERS: 'true',
        ...override,
      }),
    );
    expect(problems.some((p) => p.startsWith(name))).toBe(true);
  });
});
