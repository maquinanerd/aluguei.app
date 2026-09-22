import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => '' }),
}));

import { assertSecureApiBase } from './api-server';

/**
 * P1-15 (auditoria 2026-09-10): o web de produção exige `API_BASE_URL` https, então com a API
 * na rede interna (`http://api:4000`) o painel redireciona para o login. A permissão para http
 * é explícita (`API_BASE_URL_ALLOW_HTTP=true`) e vale só para endereço interno: nome de serviço
 * sem domínio, loopback, IP privado ou domínio `.internal`/`.local`.
 */
function production(apiBaseUrl: string | undefined, allowHttp?: string): void {
  vi.stubEnv('NODE_ENV', 'production');
  if (apiBaseUrl !== undefined) {
    vi.stubEnv('API_BASE_URL', apiBaseUrl);
  } else {
    vi.stubEnv('API_BASE_URL', undefined);
  }
  if (allowHttp !== undefined) {
    vi.stubEnv('API_BASE_URL_ALLOW_HTTP', allowHttp);
  } else {
    vi.stubEnv('API_BASE_URL_ALLOW_HTTP', undefined);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertSecureApiBase (P1-15)', () => {
  it('produção com https passa, com ou sem a permissão', () => {
    production('https://api.aluguei.example.com');
    expect(() => {
      assertSecureApiBase();
    }).not.toThrow();
    production('https://api.aluguei.example.com', 'true');
    expect(() => {
      assertSecureApiBase();
    }).not.toThrow();
  });

  it('produção com http e sem a permissão é recusada, e a mensagem diz como liberar', () => {
    production('http://api:4000');
    expect(() => {
      assertSecureApiBase();
    }).toThrow(/API_BASE_URL_ALLOW_HTTP=true/);
  });

  it.each([
    'http://api:4000',
    'http://aluguei-api:4000/',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'http://[::1]:4000',
    'http://10.0.1.5:4000',
    'http://172.18.0.4:4000',
    'http://192.168.10.2:4000',
    'http://api.aluguei.internal:4000',
    'http://api.default.svc.cluster.local:4000',
  ])('produção com a permissão aceita http interno: %s', (url) => {
    production(url, 'true');
    expect(() => {
      assertSecureApiBase();
    }).not.toThrow();
  });

  it.each([
    'http://api.aluguei.example.com',
    'http://62.171.164.224:4000',
    'http://172.32.0.1:4000',
    'http://api.62.171.164.224.sslip.io',
  ])('mesmo com a permissão, http para endereço público é recusado: %s', (url) => {
    production(url, 'true');
    expect(() => {
      assertSecureApiBase();
    }).toThrow(/rede interna/);
  });

  it.each(['1', 'yes', 'TRUE ', ''])('permissão só vale com o valor exato "true" (%j)', (value) => {
    production('http://api:4000', value);
    expect(() => {
      assertSecureApiBase();
    }).toThrow(/API_BASE_URL_ALLOW_HTTP=true/);
  });

  it('produção sem API_BASE_URL é recusada (não cai no localhost padrão)', () => {
    production(undefined);
    expect(() => {
      assertSecureApiBase();
    }).toThrow(/API_BASE_URL ausente/);
  });

  it('desenvolvimento continua aceitando http sem permissão', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('API_BASE_URL', 'http://127.0.0.1:4000');
    expect(() => {
      assertSecureApiBase();
    }).not.toThrow();
  });
});
