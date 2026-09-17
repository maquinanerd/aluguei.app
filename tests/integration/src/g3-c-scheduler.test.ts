import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { FakeScreeningProvider } from '@aluguei/integrations';
import {
  advanceBillingLifecycle,
  processPaymentSchedulerJob,
  processReconcileJob,
  runInboxJobs,
} from '@aluguei/worker';
import { createFinanceFixtures } from './finance-fixtures.js';
import type { LeaseFixture } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { futurePeriod } from './test-dates.js';

/**
 * G3, trilha C (auditoria 2026-09-10, P1-20 e P1-07): o scheduler cobrava locações ENDED e PENDING
 * — `lt(status, 'TERMINATING')` compara texto em ordem alfabética — e vencia tudo no dia 11. A
 * mudança de status das cobranças (em aberto, vencida) só rodava no job mensal. Aqui o scheduler usa
 * a lista explícita de status, a vigência, o dia de vencimento e o aluguel do período; a varredura
 * diária abre a cobrança no período, só a vence depois do dia útil seguinte e finaliza o
 * encerramento da locação.
 */
describe('G3 trilha C — scheduler e varredura diária', () => {
  let app: FastifyInstance;
  const screening = new FakeScreeningProvider();
  const worker = () =>
    runInboxJobs({
      db: app.db,
      limit: 20,
      screening,
      signature: fakeSignature,
      payments: fakePayments,
    });
  let fx: ReturnType<typeof createFinanceFixtures>;

  beforeAll(async () => {
    app = await buildTestApp();
    fx = createFinanceFixtures(app, () => worker());
  });

  afterAll(async () => {
    await app.close();
  });

  const schedule = (lease: LeaseFixture, periodStart: string) =>
    processPaymentSchedulerJob(app.db, {
      id: randomUUID(),
      orgId: lease.orgId,
      payload: { periodStart },
    });

  const chargesOf = (lease: LeaseFixture) =>
    fx.rows<{ periodStart: string; dueDate: string; rentCents: number; status: string }>(sql`
      select period_start::text as "periodStart", due_date::text as "dueDate",
             rent_cents as "rentCents", status
      from charges where lease_id = ${lease.leaseId} order by period_start
    `);

  it('cobra só locações ativas, inadimplentes ou em encerramento dentro da vigência', async () => {
    const period = futurePeriod(2);
    const active = await fx.setupLease({ rentCents: 100_000, landlord: true });
    await app.db.execute(sql`update leases set due_day = 5 where id = ${active.leaseId}`);
    const ended = await fx.setupLease({ rentCents: 100_000, landlord: true });
    await app.db.execute(
      sql`update leases set status = 'ENDED', end_date = current_date - 1 where id = ${ended.leaseId}`,
    );
    const pending = await fx.setupLease({ rentCents: 100_000, landlord: true });
    await app.db.execute(sql`update leases set status = 'PENDING' where id = ${pending.leaseId}`);
    const ending = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const endDate = new Date(Date.parse(`${period}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    await app.db.execute(
      sql`update leases set status = 'TERMINATING', end_date = ${endDate} where id = ${ending.leaseId}`,
    );

    for (const lease of [active, ended, pending, ending]) {
      await schedule(lease, period);
    }
    await schedule(ending, futurePeriod(1));

    const billed = {
      ended: (await chargesOf(ended)).length,
      pending: (await chargesOf(pending)).length,
      ending: (await chargesOf(ending)).map((c) => c.periodStart),
    };
    expect(billed).toEqual({ ended: 0, pending: 0, ending: [futurePeriod(1)] });
    expect(await chargesOf(active)).toEqual([
      {
        periodStart: period,
        dueDate: `${period.slice(0, 8)}05`,
        rentCents: 100_000,
        status: 'SCHEDULED',
      },
    ]);
  });

  it('o aluguel de cada período segue o reajuste registrado', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    await app.db.execute(sql`
      insert into lease_amendments (id, org_id, lease_id, kind, effective_from, previous_rent_cents, new_rent_cents, index_name, adjustment_bps)
      values (${randomUUID()}, ${lease.orgId}, ${lease.leaseId}, 'READJUSTMENT', ${futurePeriod(2)}, 100000, 104520, 'IGPM', 452)
    `);
    await schedule(lease, futurePeriod(1));
    await schedule(lease, futurePeriod(2));
    expect((await chargesOf(lease)).map((c) => c.rentCents)).toEqual([100_000, 104_520]);
  });

  it('varredura diária: abre no período, vence só depois do dia útil seguinte e finaliza o encerramento', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const chargeId = randomUUID();
    await app.db.execute(sql`
      insert into charges (id, org_id, lease_id, period_start, due_date, status, amount_cents, rent_cents)
      values (${chargeId}, ${lease.orgId}, ${lease.leaseId}, '2031-10-01', '2031-10-11', 'SCHEDULED', 100000, 100000)
    `);
    await app.db.execute(
      sql`update leases set status = 'TERMINATING', end_date = '2031-10-31' where id = ${lease.leaseId}`,
    );
    const status = async () =>
      (
        await fx.rows<{ charge: string; lease: string }>(sql`
        select (select status from charges where id = ${chargeId}) as charge,
               (select status from leases where id = ${lease.leaseId}) as lease
      `)
      )[0];

    await advanceBillingLifecycle(app.db, lease.orgId, '2031-09-30');
    expect(await status()).toEqual({ charge: 'SCHEDULED', lease: 'TERMINATING' });
    await advanceBillingLifecycle(app.db, lease.orgId, '2031-10-01');
    expect((await status())?.charge).toBe('OPEN');
    // 11/10/2031 é sábado; 13/10 segunda é o dia útil seguinte (12/10 é feriado, mas cai no domingo).
    await advanceBillingLifecycle(app.db, lease.orgId, '2031-10-13');
    expect((await status())?.charge).toBe('OPEN');
    await advanceBillingLifecycle(app.db, lease.orgId, '2031-10-14');
    expect((await status())?.charge).toBe('OVERDUE');
    await advanceBillingLifecycle(app.db, lease.orgId, '2031-10-31');
    expect((await status())?.lease).toBe('TERMINATING');
    await advanceBillingLifecycle(app.db, lease.orgId, '2031-11-01');
    expect((await status())?.lease).toBe('ENDED');
  });

  it('a conciliação diária do worker roda a varredura', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const chargeId = randomUUID();
    await app.db.execute(sql`
      insert into charges (id, org_id, lease_id, period_start, due_date, status, amount_cents, rent_cents)
      values (${chargeId}, ${lease.orgId}, ${lease.leaseId}, '2020-01-01', '2020-01-10', 'OPEN', 100000, 100000)
    `);
    await processReconcileJob(
      app.db,
      { id: randomUUID(), orgId: lease.orgId, payload: { periodStart: '2020-01-01' } },
      fakePayments,
    );
    const [row] = await fx.rows<{ status: string }>(
      sql`select status from charges where id = ${chargeId}`,
    );
    expect(row?.status).toBe('OVERDUE');
  });
});
