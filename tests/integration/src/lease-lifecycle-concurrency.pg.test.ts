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
import { runInboxJobs } from '@aluguei/worker';
import { FakeStorageService } from './fakes.js';
import { createFinanceFixtures } from './finance-fixtures.js';
import { testEnv } from './helpers.js';
import { dropTestDatabase } from './pg-test-database.js';

/**
 * Ciclo da locação sob concorrência REAL (PostgreSQL, conexões distintas do pool): renovação,
 * reajuste e encerramento travam a linha da locação (G3, trilha C, P1-20). Sem a trava, uma
 * renovação lida antes de um encerramento ainda não confirmado grava o término novo por cima
 * dele: a locação fica em encerramento com o prazo estendido e uma renovação no histórico.
 * O PGlite serializa as transações e não reproduz a corrida. Exige TEST_DATABASE_URL (ver
 * finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

describe('concorrência real (PostgreSQL): ciclo da locação', () => {
  const dbName = `aluguei_lc_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const screening = new FakeScreeningProvider();
  const signature = new FakeSignatureProvider();
  const payments = new FakePaymentProvider();
  let admin: AppDb;
  let db: AppDb;
  let app: FastifyInstance;
  let fx: ReturnType<typeof createFinanceFixtures>;

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });
    app = await buildApp({
      db,
      env: testEnv,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      signature,
      payments,
      logger: { level: 'error' },
    });
    fx = createFinanceFixtures(app, () =>
      runInboxJobs({ db, limit: 20, screening, signature, payments }),
    );
  });

  afterAll(async () => {
    await app.close();
    await db.$client.end();
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
  });

  it('encerramento ainda não confirmado: a renovação espera, é recusada e não estende o término', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const endDate = '2030-06-30';

    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const rowLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Outro pedido no meio do encerramento: a locação já está em encerramento nesta transação,
    // que ainda não confirmou.
    const inFlight = db.transaction(async (tx) => {
      await tx.execute(sql`
        update leases set status = 'TERMINATING', end_date = ${endDate}, end_reason = 'Acordo'
        where id = ${lease.leaseId}
      `);
      locked();
      await released;
    });
    await rowLocked;

    const renewal = fx.call('POST', `/leases/${lease.leaseId}/renew`, {
      cookie: lease.cookie,
      payload: { endDate: '2031-12-31' },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await inFlight;
    const renewed = await renewal;
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(409);

    const [row] = await fx.rows<{ status: string; endDate: string }>(sql`
      select status, end_date::text as "endDate" from leases where id = ${lease.leaseId}
    `);
    expect(row).toEqual({ status: 'TERMINATING', endDate });
    const amendments = await fx.rows<{ kind: string }>(sql`
      select kind from lease_amendments where lease_id = ${lease.leaseId}
    `);
    expect(amendments).toEqual([]);
  });
});
