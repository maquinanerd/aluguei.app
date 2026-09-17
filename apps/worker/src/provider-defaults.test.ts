import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, metaSyncJobs, organizations, webhookInbox } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import type { AppEnv } from '@aluguei/config';
import { runInboxJobs } from './inboxJobs.js';
import { runOnce } from './index.js';

/**
 * P1-12 (auditoria 2026-09-10): o worker escolhia provider por omissão — pagamento FAKE sem
 * `PAYMENT_PROVIDER`, o esqueleto Serasa em produção sem `SCREENING_PROVIDER` e Meta Ads FAKE
 * fora de `live`. Sem escolha explícita o job falha como "não configurado"; FAKE só por
 * configuração (e, em produção, só com a permissão do boot).
 */
const developmentEnv: AppEnv = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  API_HOST: '127.0.0.1',
  API_PORT: 0,
  APP_BASE_URL: 'http://localhost:3000',
  SESSION_TTL_SECONDS: 3600,
};

describe('worker sem provider por omissão (P1-12)', () => {
  let db: AppDb;
  let orgId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org Providers', slug: 'org-providers' })
      .returning();
    if (!org) {
      throw new Error('org seed failed');
    }
    orgId = org.id;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function enqueue(provider: string, payload: Record<string, unknown>): Promise<string> {
    const [row] = await db
      .insert(webhookInbox)
      .values({
        orgId,
        provider,
        providerEventId: `${provider}:${Math.random().toString(36).slice(2)}`,
        payload,
      })
      .returning();
    if (!row) {
      throw new Error('inbox seed failed');
    }
    return row.id;
  }

  async function inboxOutcome(id: string): Promise<{ status: string; lastError: string | null }> {
    const [row] = await db.select().from(webhookInbox).where(eq(webhookInbox.id, id));
    return { status: row?.status ?? '', lastError: row?.lastError ?? null };
  }

  it('pagamento sem PAYMENT_PROVIDER: o job falha como não configurado, sem FAKE implícito', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', undefined);
    const id = await enqueue('PAYMENT', {});
    await runInboxJobs({ db, env: developmentEnv, limit: 50 });
    expect(await inboxOutcome(id)).toEqual({
      status: 'FAILED',
      lastError: 'provider de pagamento não configurado',
    });
  });

  it('produção sem SCREENING_PROVIDER não usa o esqueleto Serasa, mesmo com credenciais', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SCREENING_PROVIDER', undefined);
    const env: AppEnv = {
      ...developmentEnv,
      NODE_ENV: 'production',
      SERASA_CLIENT_ID: 'cliente',
      SERASA_CLIENT_SECRET: 'segredo',
    };
    const id = await enqueue('SCREENING', {
      applicationId: '00000000-0000-0000-0000-000000000000',
    });
    await runInboxJobs({ db, env, limit: 50, payments: null });
    expect(await inboxOutcome(id)).toEqual({
      status: 'FAILED',
      lastError: 'provider de screening não configurado',
    });
  });

  it('produção sem META_MODE: jobs da Meta não rodam no FAKE', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('META_MODE', undefined);
    vi.stubEnv('DATABASE_URL', undefined);
    const env: AppEnv = { ...developmentEnv, NODE_ENV: 'production' };
    const [job] = await db
      .insert(metaSyncJobs)
      .values({ orgId, jobType: 'SYNC_INSIGHTS', payload: {} })
      .returning();
    if (!job) {
      throw new Error('meta job seed failed');
    }
    await runOnce({ db, env, log: () => undefined });
    const [after] = await db.select().from(metaSyncJobs).where(eq(metaSyncJobs.id, job.id));
    expect(after?.status).toBe('FAILED');
    expect(after?.lastError).toBe('provider de meta não configurado');
  });
});
