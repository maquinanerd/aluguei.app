import { beforeAll, describe, expect, it } from 'vitest';
import {
  channelSyncJobs,
  createTestDb,
  metaSyncJobs,
  organizations,
  webhookInbox,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { FakeChannel, FakeMetaAdsProvider, FakePaymentProvider } from '@aluguei/integrations';
import { runChannelJobs } from './channelJobs.js';
import { runInboxJobs } from './inboxJobs.js';
import { runMetaJobs } from './metaJobs.js';

/**
 * P2-10 (auditoria 2026-09-10): o worker só logava "worker started" — um job que falhava não
 * deixava rastro no log. Cada job das três filas registra início, fim e falha, com id, tipo,
 * tentativa, duração e a mensagem de erro, em log estruturado.
 */
interface Entry {
  level: 'info' | 'error';
  obj: Record<string, unknown>;
  msg: string;
}

function captureLogger(): {
  entries: Entry[];
  logger: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
} {
  const entries: Entry[] = [];
  return {
    entries,
    logger: {
      info: (obj, msg) => {
        entries.push({ level: 'info', obj, msg });
      },
      error: (obj, msg) => {
        entries.push({ level: 'error', obj, msg });
      },
    },
  };
}

function forJob(entries: Entry[], jobId: string): Entry[] {
  return entries.filter((entry) => entry.obj.jobId === jobId);
}

describe('log estruturado por job (P2-10)', () => {
  let db: AppDb;
  let orgId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org Logs', slug: 'org-logs' })
      .returning();
    if (!org) {
      throw new Error('org seed failed');
    }
    orgId = org.id;
  });

  async function inbox(provider: string): Promise<string> {
    const [row] = await db
      .insert(webhookInbox)
      .values({
        orgId,
        provider,
        providerEventId: `${provider}:${Math.random().toString(36).slice(2)}`,
        payload: {},
      })
      .returning();
    if (!row) {
      throw new Error('inbox seed failed');
    }
    return row.id;
  }

  it('fila inbox: início e fim de um job concluído', async () => {
    const { entries, logger } = captureLogger();
    const id = await inbox('PAYMENT');
    await runInboxJobs({ db, limit: 50, payments: new FakePaymentProvider(), logger });

    const logged = forJob(entries, id);
    expect(logged.map((entry) => entry.obj.event)).toEqual(['job.started', 'job.finished']);
    expect(logged[0]?.obj).toMatchObject({
      queue: 'inbox',
      jobId: id,
      jobType: 'PAYMENT',
      attempt: 1,
      orgId,
    });
    expect(logged[1]?.level).toBe('info');
    expect(logged[1]?.obj).toMatchObject({ jobType: 'PAYMENT', attempt: 1, status: 'SUCCESS' });
    expect(typeof logged[1]?.obj.durationMs).toBe('number');
  });

  it('fila inbox: falha com tentativa, duração e mensagem de erro', async () => {
    const { entries, logger } = captureLogger();
    const id = await inbox('PAYMENT');
    await runInboxJobs({ db, limit: 50, payments: null, logger });

    const logged = forJob(entries, id);
    expect(logged.map((entry) => entry.obj.event)).toEqual(['job.started', 'job.failed']);
    expect(logged[1]?.level).toBe('error');
    expect(logged[1]?.obj).toMatchObject({
      queue: 'inbox',
      jobType: 'PAYMENT',
      attempt: 1,
      status: 'FAILED',
      error: 'provider de pagamento não configurado',
    });
    expect(logged[1]?.obj.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fila de canais: job concluído e job com canal sem integração', async () => {
    const { entries, logger } = captureLogger();
    const [ok, missing] = await db
      .insert(channelSyncJobs)
      .values([
        { orgId, channel: 'fake', jobType: 'RECONCILE', idempotencyKey: `ok-${orgId}` },
        { orgId, channel: 'olx', jobType: 'RECONCILE', idempotencyKey: `missing-${orgId}` },
      ])
      .returning();
    if (!ok || !missing) {
      throw new Error('channel jobs seed failed');
    }
    const fake = new FakeChannel();
    await runChannelJobs({
      db,
      adapterFor: (channel) => (channel === 'fake' ? fake : null),
      limit: 10,
      logger,
    });

    expect(forJob(entries, ok.id).map((entry) => entry.obj.event)).toEqual([
      'job.started',
      'job.finished',
    ]);
    const failed = forJob(entries, missing.id);
    expect(failed.map((entry) => entry.obj.event)).toEqual(['job.started', 'job.failed']);
    expect(failed[1]?.obj).toMatchObject({
      queue: 'channel',
      jobType: 'olx:RECONCILE',
      attempt: 1,
      status: 'FAILED',
      error: 'Canal não configurado',
    });
  });

  it('fila da Meta: falha registrada com a mensagem do job', async () => {
    const { entries, logger } = captureLogger();
    const [job] = await db
      .insert(metaSyncJobs)
      .values({ orgId, jobType: 'SYNC_INSIGHTS', payload: {} })
      .returning();
    if (!job) {
      throw new Error('meta job seed failed');
    }
    await runMetaJobs({ db, meta: new FakeMetaAdsProvider(), logger });

    const logged = forJob(entries, job.id);
    expect(logged.map((entry) => entry.obj.event)).toEqual(['job.started', 'job.failed']);
    expect(logged[1]?.obj).toMatchObject({
      queue: 'meta',
      jobType: 'SYNC_INSIGHTS',
      attempt: 1,
      status: 'FAILED',
      error: 'SYNC_INSIGHTS sem campaignLinkId',
    });
  });
});
