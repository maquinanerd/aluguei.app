import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { buildApp } from '@aluguei/api';
import { createTestDb } from '@aluguei/db';
import { FakePaymentProvider, FakeScreeningProvider } from '@aluguei/integrations';
import { processPaymentJob, runInboxJobs } from '@aluguei/worker';
import { FakeStorageService } from './fakes.js';
import { createFinanceFixtures } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature, testEnv } from './helpers.js';

/**
 * Integridade financeira — auditoria 2026-09-10 (P0-01, P0-02, P0-03, S5 e
 * fila). Os cenários do harness temporário da auditoria
 * (docs/audits/2026-09-10/evidence/scripts/zz-audit-races.tmp.test.ts.archived)
 * viraram testes permanentes com a expectativa correta.
 * PGlite serializa transações: aqui a concorrência é a intercalação nos
 * `await` (o bastante para reproduzir o duplo crédito do código sem transação).
 * A corrida entre conexões e processos reais está em finance-concurrency.pg.test.ts.
 */
describe('integridade financeira (P0-01/P0-02/P0-03)', () => {
  let app: FastifyInstance;
  const screening = new FakeScreeningProvider();
  const worker = (limit = 20) =>
    runInboxJobs({
      db: app.db,
      limit,
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

  it('P0-01: dois processamentos simultâneos do mesmo pagamento → um crédito, um split, um repasse', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const { chargeId } = await fx.issueCharge(lease, '2026-11-01');
    const payment = await fx.initiate(lease, chargeId);
    expect(payment.status).toBe(201);
    await fakePayments.confirmCharge(payment.pcid);

    const job = () => ({
      id: randomUUID(),
      orgId: lease.orgId,
      payload: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerChargeId: payment.pcid,
        amountCents: payment.amountCents,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    });
    const settled = await Promise.allSettled([
      processPaymentJob(app.db, job(), fakePayments),
      processPaymentJob(app.db, job(), fakePayments),
    ]);
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);

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
  });

  it('P0-01: ciclos do worker em paralelo com eventos distintos do mesmo pagamento → efeito único', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    await worker(100); // drena jobs pendentes (scheduler/conciliação) antes da corrida
    const { chargeId } = await fx.issueCharge(lease, '2026-11-01');
    const payment = await fx.initiate(lease, chargeId);
    await fakePayments.confirmCharge(payment.pcid);
    expect(await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents)).toBe(
      200,
    );
    expect(await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents)).toBe(
      200,
    );

    await Promise.all([worker(1), worker(1), worker(1), worker(1)]);

    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      allocations: 2,
      payouts: 1,
      paymentTx: 1,
      payoutTx: 1,
      cash: 10_000,
    });
    expect((await fx.inbox(lease.orgId)).map((job) => job.status)).toEqual(['SUCCESS', 'SUCCESS']);
  });

  it('P0-02: webhook de estorno forjado não executa estorno nem mexe no dinheiro', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const { chargeId } = await fx.issueCharge(lease, '2026-11-01');
    const payment = await fx.initiate(lease, chargeId);
    await fakePayments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);
    await worker();

    const refundSpy = vi.spyOn(fakePayments, 'refundPayment');
    try {
      // sem token (dev/test): qualquer um pode chamar a URL — o evento não pode ter efeito
      await fx.paymentWebhook('PAYMENT_REFUNDED', payment.pcid, payment.amountCents);
      await worker();
      await fx.paymentWebhook('PAYMENT_REFUNDED', payment.pcid, payment.amountCents);
      await worker();
      expect(refundSpy).not.toHaveBeenCalled();
    } finally {
      refundSpy.mockRestore();
    }

    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      payouts: 1,
      refundTx: 0,
      cash: 10_000,
    });
  });

  it('P0-02: estorno confirmado pelo provider + webhooks repetidos → um único registro e razão zerada', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const { chargeId } = await fx.issueCharge(lease, '2026-11-01');
    const payment = await fx.initiate(lease, chargeId);
    await fakePayments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);
    await worker();

    const refundSpy = vi.spyOn(fakePayments, 'refundPayment');
    try {
      const refund = await fx.call('POST', `/charges/${chargeId}/refund`, {
        cookie: lease.cookie,
        payload: {},
      });
      expect(refund.status, JSON.stringify(refund.body)).toBe(200);
      await fx.paymentWebhook('PAYMENT_REFUNDED', payment.pcid, payment.amountCents);
      await fx.paymentWebhook('PAYMENT_REFUNDED', payment.pcid, payment.amountCents);
      await worker();
      expect(refundSpy).toHaveBeenCalledTimes(1);
    } finally {
      refundSpy.mockRestore();
    }

    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'REFUNDED',
      refundTx: 1,
      payouts: 0,
      cash: 0,
    });
    expect(await fx.balances(lease.orgId)).toMatchObject({
      CASH: 0,
      AR_RECEIVABLE: 0,
      AGENCY_FEE_REVENUE: 0,
      LANDLORD_PAYABLE: 0,
    });
  });

  it('P0-03: cobrança SCHEDULED paga pelo portal → PAID e creditada', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    const { chargeId, amountCents } = await fx.issueCharge(lease, '2027-06-01');
    const payment = await fx.portalPay(lease, chargeId);
    expect(payment.status, 'iniciação pelo portal').toBe(201);
    await fakePayments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, amountCents);
    await worker();

    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      paymentTx: 1,
    });
    expect((await fx.inbox(lease.orgId)).map((job) => job.status)).toEqual(['SUCCESS']);
  });

  it('P0-03: cobrança OVERDUE paga → PAID', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    const { chargeId, amountCents } = await fx.issueCharge(lease, '2027-07-01');
    await app.db.execute(sql`update charges set status = 'OVERDUE' where id = ${chargeId}`);
    const payment = await fx.portalPay(lease, chargeId);
    await fakePayments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, amountCents);
    await worker();

    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      paymentTx: 1,
    });
  });

  it('P0-03: dinheiro recebido depois do cancelamento é registrado (recebimento não aplicado)', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    const { chargeId } = await fx.issueCharge(lease, '2027-08-01');
    const payment = await fx.initiate(lease, chargeId);
    const cancel = await fx.call('POST', `/charges/${chargeId}/cancel`, {
      cookie: lease.cookie,
      payload: {},
    });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);

    // o pagador ainda paga o QR antigo
    await fakePayments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);
    await worker();

    expect((await fx.inbox(lease.orgId)).map((job) => job.status)).toEqual(['SUCCESS']);
    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'CANCELLED',
      paymentsConfirmed: 1,
      paymentTx: 1,
      allocations: 0,
      payouts: 0,
      cash: payment.amountCents,
      unapplied: -payment.amountCents,
    });
    // o reconhecimento da cobrança cancelada foi revertido
    expect((await fx.balances(lease.orgId)).AR_RECEIVABLE).toBe(0);
    const audit = await fx.rows<{ n: number }>(
      sql`select count(*)::int as n from audit_events where org_id = ${lease.orgId} and action = 'payment.unapplied'`,
    );
    expect(audit[0]?.n).toBe(1);
  });

  it('P0-03: cancelar cobrança já paga no provider → 409 e o pagamento é liquidado', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    const { chargeId } = await fx.issueCharge(lease, '2027-10-01');
    const payment = await fx.initiate(lease, chargeId);
    await fakePayments.confirmCharge(payment.pcid);

    const cancel = await fx.call('POST', `/charges/${chargeId}/cancel`, {
      cookie: lease.cookie,
      payload: {},
    });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(409);

    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);
    await worker();
    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentTx: 1,
    });
  });

  it('P0-03: PAYMENT_FAILED sem respaldo no provider não impede a liquidação posterior', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    const { chargeId } = await fx.issueCharge(lease, '2027-11-01');
    const payment = await fx.initiate(lease, chargeId);
    await fx.paymentWebhook('PAYMENT_FAILED', payment.pcid, payment.amountCents);
    await worker();

    await fakePayments.confirmCharge(payment.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents);
    await worker();
    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      paymentTx: 1,
    });
  });

  it('P0-03: reemissão reaproveita a tentativa pendente e o QR substituído, se pago, não se perde', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const { chargeId } = await fx.issueCharge(lease, '2027-09-01');
    const first = await fx.initiate(lease, chargeId, 'PIX');
    expect(first.status).toBe(201);
    const again = await fx.initiate(lease, chargeId, 'PIX');
    expect(again.status).toBe(200);
    expect(again.paymentId).toBe(first.paymentId);
    expect(again.pcid).toBe(first.pcid);

    const boleto = await fx.initiate(lease, chargeId, 'BOLETO');
    expect(boleto.status).toBe(201);
    expect(boleto.pcid).not.toBe(first.pcid);
    const pending = await fx.rows<{ n: number }>(
      sql`select count(*)::int as n from payments where charge_id = ${chargeId} and status = 'PENDING'`,
    );
    expect(pending[0]?.n).toBe(1);

    // o pagador paga o PIX substituído: a cobrança é liquidada por ele
    await fakePayments.confirmCharge(first.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', first.pcid, first.amountCents);
    await worker();
    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 1,
      allocations: 2,
      payouts: 1,
      paymentTx: 1,
    });

    // ...e também o boleto novo: o valor excedente vira recebimento não aplicado
    await fakePayments.confirmCharge(boleto.pcid);
    await fx.paymentWebhook('PAYMENT_CONFIRMED', boleto.pcid, boleto.amountCents);
    await worker();
    expect(await fx.money(lease.orgId, chargeId)).toMatchObject({
      chargeStatus: 'PAID',
      paymentsConfirmed: 2,
      allocations: 2,
      payouts: 1,
      paymentTx: 2,
      unapplied: -boleto.amountCents,
    });
  });

  it('S5: uma única cobrança por locação e mês (409 na segunda)', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: false });
    await fx.issueCharge(lease, '2028-01-01');
    const sameMonth = await fx.call('POST', '/charges', {
      cookie: lease.cookie,
      payload: { leaseId: lease.leaseId, periodStart: '2028-01-15' },
    });
    expect(sameMonth.status, JSON.stringify(sameMonth.body)).toBe(409);
    const samePeriod = await fx.call('POST', '/charges', {
      cookie: lease.cookie,
      payload: { leaseId: lease.leaseId, periodStart: '2028-01-01' },
    });
    expect(samePeriod.status, JSON.stringify(samePeriod.body)).toBe(409);
  });

  it('fila: job que esgota as tentativas vira DEAD; o reaper respeita as tentativas', async () => {
    const { orgId } = await fx.registerOrg();
    const failing = randomUUID();
    await app.db.execute(sql`
      insert into webhook_inbox (id, org_id, provider, provider_event_id, payload)
      values (${failing}, ${orgId}, 'UNKNOWN_PROVIDER', ${`bad-${fx.uniq()}`}, '{}'::jsonb)
    `);
    for (let round = 0; round < 6; round += 1) {
      await app.db.execute(sql`update webhook_inbox set run_at = now() where id = ${failing}`);
      await worker(100);
    }
    const [failed] = await fx.rows<{ status: string; attempts: number }>(
      sql`select status, attempts from webhook_inbox where id = ${failing}`,
    );
    expect(failed).toMatchObject({ status: 'DEAD', attempts: 3 });

    // execução travada (lease expirado) com tentativas esgotadas: não volta para a fila
    const stuck = randomUUID();
    await app.db.execute(sql`
      insert into webhook_inbox (id, org_id, provider, provider_event_id, payload, status, attempts, started_at)
      values (${stuck}, ${orgId}, 'UNKNOWN_PROVIDER', ${`stuck-${fx.uniq()}`}, '{}'::jsonb, 'RUNNING', 3, now() - interval '10 minutes')
    `);
    await worker(100);
    const [reaped] = await fx.rows<{ status: string; attempts: number }>(
      sql`select status, attempts from webhook_inbox where id = ${stuck}`,
    );
    expect(reaped).toMatchObject({ status: 'DEAD', attempts: 3 });
  });

  it('razão: toda transação balanceada e nenhuma operação lançada duas vezes', async () => {
    const unbalanced = await fx.rows(sql`
      select transaction_id from ledger_entries
      group by transaction_id having sum(amount_cents) <> 0
    `);
    expect(unbalanced).toEqual([]);
    const duplicated = await fx.rows(sql`
      select org_id, business_key, account_id from ledger_entries
      where business_key is not null
      group by org_id, business_key, account_id having count(*) > 1
    `);
    expect(duplicated).toEqual([]);
    const withoutKey = await fx.rows<{ n: number }>(
      sql`select count(*)::int as n from ledger_entries where business_key is null`,
    );
    expect(withoutKey[0]?.n).toBe(0);
  });
});

describe('P0-02: webhook de pagamentos exige o segredo do provider em produção', () => {
  it('produção sem ASAAS_WEBHOOK_TOKEN → 500 (configuração incorreta) e nada enfileirado', async () => {
    const db = await createTestDb();
    const prod = await buildApp({
      db,
      env: { ...testEnv, NODE_ENV: 'production' },
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      payments: new FakePaymentProvider(),
    });
    try {
      const res = await prod.inject({
        method: 'POST',
        url: '/webhooks/payments',
        payload: {
          provider: 'FAKE',
          eventType: 'PAYMENT_REFUNDED',
          providerEventId: 'forjado-1',
          providerChargeId: 'pc.fake.qualquer',
          amountCents: 1000,
        },
      });
      expect(res.statusCode).toBe(500);
      const queued = await db.execute(sql`select count(*)::int as n from webhook_inbox`);
      expect((queued.rows[0] as { n: number } | undefined)?.n).toBe(0);
    } finally {
      await prod.close();
    }
  });
});
