import { randomBytes } from 'node:crypto';
import { buildApp } from '@aluguei/api';
import { createTestDb } from '@aluguei/db';
import type { AppEnv } from '@aluguei/config';
import type { FastifyInstance } from 'fastify';
import {
  FakeChannel,
  FakeMetaAdsProvider,
  FakePaymentProvider,
  FakeSignatureProvider,
  FakeWhatsAppMessenger,
  MockAiProvider,
} from '@aluguei/integrations';
import { FakeStorageService } from './fakes.js';
import { approveAgency } from './platform-fixtures.js';

export const fakeStorage = new FakeStorageService();
export const fakeChannel = new FakeChannel();
export const fakeWhatsApp = new FakeWhatsAppMessenger('test-verify-token');
export const fakeAi = new MockAiProvider();
export const fakeSignature = new FakeSignatureProvider();
export const fakePayments = new FakePaymentProvider();
export const fakeMetaAds = new FakeMetaAdsProvider();

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
  // Admins da plataforma (ver platform-fixtures.ts); o segundo e-mail nunca é cadastrado.
  PLATFORM_ADMIN_EMAILS: 'plataforma@aluguei.test, reservado@aluguei.test',
  // Chave que cifra os tokens por conexão (Meta Ads e WhatsApp, ADR-028), nova a cada execução.
  META_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};

let appCache: FastifyInstance | null = null;

/** Cria app Fastify com PGlite (Postgres in-process) + migrations aplicadas. */
export async function buildTestApp(): Promise<FastifyInstance> {
  if (appCache) {
    return appCache;
  }
  const db = await createTestDb();
  const app = await buildApp({
    db,
    env: testEnv,
    config: { cookieSecure: false },
    storage: fakeStorage,
    channels: { fake: fakeChannel },
    whatsapp: fakeWhatsApp,
    ai: fakeAi,
    signature: fakeSignature,
    payments: fakePayments,
    meta: fakeMetaAds,
  });
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

/**
 * Cadastra uma imobiliária e a aprova pela API da plataforma: o cadastro aberto nasce
 * aguardando aprovação (admin da plataforma), e as suítes de negócio precisam dela operando.
 * O fluxo sem aprovação é coberto em platform-admin.test.ts.
 */
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
  const body = res.json() as RegisteredUser['body'];
  await approveAgency(app, body.org.id);
  return { cookie, body };
}
