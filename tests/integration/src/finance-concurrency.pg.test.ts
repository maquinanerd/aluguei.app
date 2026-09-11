import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { buildApp } from '@aluguei/api';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  FakePaymentProvider,
  FakeScreeningProvider,
  FakeSignatureProvider,
} from '@aluguei/integrations';
import type { PaymentChargeStatus } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { FakeStorageService } from './fakes.js';
import { createFinanceFixtures } from './finance-fixtures.js';
import { testEnv } from './helpers.js';

/**
 * Concorrência REAL — PostgreSQL, conexões e processos distintos (auditoria
 * 2026-09-10: P0-01, P0-03, P1-13). O PGlite serializa transações e não
 * reproduz estas corridas. Exige TEST_DATABASE_URL de um PostgreSQL ≥ 15 com
 * permissão de CREATE DATABASE: a suíte cria um banco próprio, aplica as
 * migrations e o remove no final.
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres \
 *     pnpm --filter @aluguei/tests-integration test:pg
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** FAKE com barreira: as próximas N consultas de status só respondem juntas (força a corrida). */
class GatedFakeProvider extends FakePaymentProvider {
  private gate: {
    parties: number;
    arrived: number;
    open: Promise<void>;
    release: () => void;
  } | null = null;

  arm(parties: number): void {
    let release: () => void = () => undefined;
    const open = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gate = { parties, arrived: 0, open, release };
  }

  override async getChargeStatus(providerChargeId: string): Promise<PaymentChargeStatus> {
    const gate = this.gate;
    if (gate) {
      gate.arrived += 1;
      if (gate.arrived >= gate.parties) {
        gate.release();
        this.gate = null;
      }
      await Promise.race([gate.open, sleep(5_000)]);
    }
    return super.getChargeStatus(providerChargeId);
  }
}

/** Executa o worker real como processo separado (`--run-once`) contra o banco de teste. */
function runWorkerProcess(url: string): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    PAYMENT_PROVIDER: 'FAKE',
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
  };
  delete env.REDIS_URL;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'apps/worker/src/index.ts', '--run-once'],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(`worker (processo) saiu com código ${String(code)}:\n${output.slice(-3000)}`),
        );
      }
    });
  });
}

describe('concorrência real (PostgreSQL): liquidação, fila e processos separados', () => {
  const dbName = `aluguei_it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const screening = new FakeScreeningProvider();
  const signature = new FakeSignatureProvider();
  const payments = new GatedFakeProvider();
  let admin: AppDb;
  let db: AppDb;
  let workerA: AppDb;
  let workerB: AppDb;
  let app: FastifyInstance;
  let fx: ReturnType<typeof createFinanceFixtures>;

  const runWorker = (on: AppDb, limit = 20) =>
    runInboxJobs({ db: on, limit, screening, signature, payments });

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });
    workerA = createDb(databaseUrl(dbName));
    workerB = createDb(databaseUrl(dbName));
    app = await buildApp({
      db,
      env: testEnv,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      signature,
      payments,
    });
    fx = createFinanceFixtures(app, () => runWorker(db));
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([db, workerA, workerB].map((pool) => pool.$client.end()));
    await admin.execute(sql.raw(`drop database if exists ${dbName} with (force)`));
    await admin.$client.end();
  });

  it('P0-01: dois workers (conexões distintas) com eventos distintos do mesmo pagamento → um crédito, um split, um repasse', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    await runWorker(db, 100); // drena scheduler/conciliação antes da corrida
    const { chargeId } = await fx.issueCharge(lease, '2026-11-01');
    const payment = await fx.initiate(lease, chargeId);
    expect(payment.status).toBe(201);
    await payments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);

    // as duas consultas ao provider respondem juntas: as duas liquidações disputam o pagamento
    payments.arm(2);
    const [a, b] = await Promise.all([runWorker(workerA, 1), runWorker(workerB, 1)]);
    expect(a.processed + b.processed).toBe(2);

    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      allocations: 2,
      allocationSum: 100_000,
      payouts: 1,
      payoutSum: 90_000,
      paymentTx: 1,
      payoutTx: 1,
      cash: 10_000,
    });
    expect(await fx.inbox(lease.orgId)).toEqual([
      { status: 'SUCCESS', attempts: 1 },
      { status: 'SUCCESS', attempts: 1 },
    ]);
  });

  it('fila: dois workers concorrentes nunca processam o mesmo job (FOR UPDATE SKIP LOCKED)', async () => {
    const { orgId } = await fx.registerOrg();
    for (let index = 0; index < 30; index += 1) {
      const id = randomUUID();
      const payload = JSON.stringify({
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerChargeId: `pc.fake.inexistente-${id}`,
        amountCents: 1,
      });
      await db.execute(sql`
        insert into webhook_inbox (id, org_id, provider, provider_event_id, payload)
        values (${id}, ${orgId}, 'PAYMENT', ${`PAY:FAKE:fila-${id}`}, ${payload}::jsonb)
      `);
    }
    await Promise.all([runWorker(workerA, 30), runWorker(workerB, 30)]);
    const jobs = await fx.rows<{ status: string; attempts: number }>(sql`
      select status, attempts from webhook_inbox where org_id = ${orgId} and provider = 'PAYMENT'
    `);
    expect(jobs).toHaveLength(30);
    expect(jobs.filter((job) => job.status !== 'SUCCESS' || job.attempts !== 1)).toEqual([]);
  });

  it('P0-03: iniciações simultâneas da mesma cobrança → uma única tentativa pendente', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    const { chargeId } = await fx.issueCharge(lease, '2027-01-01');
    const results = await Promise.all(
      Array.from({ length: 6 }, () => fx.initiate(lease, chargeId)),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(
      results.every((result) => [200, 201, 409].includes(result.status)),
      JSON.stringify(results),
    ).toBe(true);
    const [counts] = await fx.rows<{ total: number; pending: number }>(sql`
      select count(*)::int as total, count(*) filter (where status = 'PENDING')::int as pending
      from payments where charge_id = ${chargeId}
    `);
    expect(counts).toEqual({ total: 1, pending: 1 });
  });

  it('P1-13: API e worker em processos separados liquidam o pagamento (FAKE compartilhado em tabela)', async () => {
    // API sem provider injetado: o FAKE guarda o estado no banco, como o worker de outro processo
    const api = await buildApp({
      db,
      env: { ...testEnv, PAYMENT_PROVIDER: 'FAKE' },
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      signature,
    });
    try {
      const apiFx = createFinanceFixtures(api, () =>
        runInboxJobs({ db, limit: 20, screening, signature }),
      );
      const lease = await apiFx.setupLease({ rentCents: 120_000, landlord: true });
      const { chargeId } = await apiFx.issueCharge(lease, '2026-12-01');
      const payment = await apiFx.initiate(lease, chargeId);
      expect(payment.status).toBe(201);

      // o pagador paga (simulado no FAKE) e o provider notifica
      const confirm = await apiFx.call(
        'POST',
        `/dev/fake-payments/${encodeURIComponent(payment.pcid)}/confirm`,
        { cookie: lease.cookie, payload: {} },
      );
      expect(confirm.status, JSON.stringify(confirm.body)).toBe(200);
      expect(
        await apiFx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents),
      ).toBe(200);

      await runWorkerProcess(databaseUrl(dbName));

      expect(await apiFx.money(lease.orgId, chargeId)).toMatchObject({
        chargeStatus: 'PAID',
        paymentsConfirmed: 1,
        allocations: 2,
        payouts: 1,
        paymentTx: 1,
        payoutTx: 1,
      });
      expect(await apiFx.inbox(lease.orgId)).toEqual([{ status: 'SUCCESS', attempts: 1 }]);
    } finally {
      await api.close();
    }
  });
});
