import { buildApp } from '@aluguei/api';
import { createTestDb } from '@aluguei/db';
import type { AppEnv } from '@aluguei/config';
import type { FastifyInstance } from 'fastify';

/** Env mínimo de teste (cookie não-seguro via config override). */
export const testEnv: AppEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_HOST: '127.0.0.1',
  API_PORT: 0,
  APP_BASE_URL: 'http://localhost:3000',
  SESSION_TTL_SECONDS: 3600,
  DATABASE_URL: undefined,
  REDIS_URL: undefined,
  STORAGE_ENDPOINT: undefined,
  STORAGE_REGION: undefined,
  STORAGE_BUCKET: undefined,
  OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
};

let appCache: FastifyInstance | null = null;

/** Cria app Fastify com PGlite (Postgres in-process) + migrations aplicadas. */
export async function buildTestApp(): Promise<FastifyInstance> {
  if (appCache) {
    return appCache;
  }
  const db = await createTestDb();
  const app = await buildApp({ db, env: testEnv, config: { cookieSecure: false } });
  appCache = app;
  return app;
}

export interface RegisteredUser {
  cookie: string;
  body: {
    user: { id: string; email: string; name: string };
    org: { id: string; name: string; slug: string };
    membership: { id: string; orgId: string; role: string };
  };
}

export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }> = {},
): Promise<RegisteredUser> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: overrides.name ?? 'Usuário Teste',
      email: overrides.email ?? `user-${suffix}@example.com`,
      password: overrides.password ?? 'senha-segura-123',
      organizationName: overrides.organizationName ?? `Imobiliária ${suffix}`,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`registerUser falhou: ${String(res.statusCode)} ${res.body}`);
  }
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
  return { cookie, body: res.json() as RegisteredUser['body'] };
}
