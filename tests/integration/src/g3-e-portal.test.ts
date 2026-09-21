import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { calculateChargeBreakdown, saoPauloDate } from '@aluguei/domain';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { createFinanceFixtures } from './finance-fixtures.js';
import type { Json, LeaseFixture } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { futurePeriod } from './test-dates.js';

/**
 * G3, trilha E (auditoria 2026-09-10, P2-05): o portal somava cobrança cancelada no extrato, o
 * locatário via vistoria intermediária e rascunho, a lista de cobranças devolvia um id no lugar da
 * contagem e o pagamento pelo portal cobrava o valor de face, sem a multa e os juros do atraso
 * (achado da trilha C).
 */
describe('G3 trilha E — portal do locatário e do proprietário', () => {
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

  const monthsAgo = (months: number): string => {
    const today = saoPauloDate(new Date());
    const date = new Date(
      Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - months, 1),
    );
    return date.toISOString().slice(0, 10);
  };

  /** Sessão do portal de uma parte da locação. */
  const portalSession = async (
    lease: LeaseFixture,
    kind: 'TENANT' | 'LANDLORD',
    partyId?: string,
  ): Promise<string> => {
    const access = await fx.call('POST', '/portal/access', {
      cookie: lease.cookie,
      payload: { partyId: partyId ?? lease.tenantId, kind },
    });
    expect(access.status, JSON.stringify(access.body)).toBe(201);
    const consume = await app.inject({
      method: 'POST',
      url: '/portal/auth/consume',
      payload: { token: access.body.oneTimeToken as string },
    });
    expect(consume.statusCode).toBe(200);
    const header = consume.headers['set-cookie'];
    return (Array.isArray(header) ? header[0] : header)?.split(';')[0] ?? '';
  };

  const portalGet = async (cookie: string, url: string): Promise<Json> => {
    const res = await fx.call('GET', url, { cookie });
    expect(res.status, `${url}: ${JSON.stringify(res.body)}`).toBe(200);
    return res.body;
  };

  it('extrato do locatário não soma cobrança cancelada, e ela continua visível na lista', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const keep = await fx.issueCharge(lease, futurePeriod(1));
    const cancelled = await fx.issueCharge(lease, futurePeriod(2));
    const cancel = await fx.call('POST', `/charges/${cancelled.chargeId}/cancel`, {
      cookie: lease.cookie,
    });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);

    const cookie = await portalSession(lease, 'TENANT');
    const statement = await portalGet(cookie, '/portal/tenant/statement');
    expect(statement.totals).toMatchObject({
      billedCents: 100_000,
      paidCents: 0,
      openCents: 100_000,
    });
    const listed = statement.charges as Array<{ id: string; status: string }>;
    expect(listed.find((c) => c.id === keep.chargeId)?.status).toBe('SCHEDULED');
    expect(listed.find((c) => c.id === cancelled.chargeId)?.status).toBe('CANCELLED');
  });

  it('lista de cobranças do locatário devolve a contagem em total, não um id', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    for (const months of [1, 2, 3]) {
      await fx.issueCharge(lease, futurePeriod(months));
    }
    const cookie = await portalSession(lease, 'TENANT');
    const page = await portalGet(cookie, '/portal/tenant/charges?limit=1&offset=0');
    expect(page.charges).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('portal mostra só vistoria de entrada ou saída concluída', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const create = async (type: string, status: string): Promise<string> => {
      const res = await fx.call('POST', '/inspections', {
        cookie: lease.cookie,
        payload: { propertyId: lease.propertyId, type },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const id = (res.body.inspection as { id: string }).id;
      // O status vem do fluxo de vistoria; aqui só a visibilidade no portal está em teste.
      await app.db.execute(sql`update inspections set status = ${status} where id = ${id}`);
      return id;
    };
    const completedCheckin = await create('CHECKIN', 'COMPLETED');
    const draftCheckout = await create('CHECKOUT', 'CAPTURING');
    const completedIntermediate = await create('INTERMEDIATE', 'COMPLETED');

    for (const [kind, partyId] of [
      ['TENANT', lease.tenantId],
      ['LANDLORD', lease.landlordId ?? ''],
    ] as const) {
      const cookie = await portalSession(lease, kind, partyId);
      const url = kind === 'TENANT' ? '/portal/tenant/inspections' : '/portal/landlord/inspections';
      const body = await portalGet(cookie, url);
      const ids = (body.inspections as Array<{ id: string }>).map((i) => i.id);
      expect(ids, kind).toEqual([completedCheckin]);
      expect(ids, kind).not.toContain(draftCheckout);
      expect(ids, kind).not.toContain(completedIntermediate);
    }
  });

  it('pagamento pelo portal recalcula multa e juros e reaproveita o QR do provider', async () => {
    const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
    const issued = await fx.call('POST', '/charges', {
      cookie: lease.cookie,
      payload: { leaseId: lease.leaseId, periodStart: monthsAgo(2) },
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    const charge = issued.body.charge as { id: string; dueDate: string; amountCents: number };

    const payment = await fx.portalPay(lease, charge.id);
    expect(payment.status, JSON.stringify(payment.body)).toBe(201);
    const expected = calculateChargeBreakdown({
      rentCents: 100_000,
      dueDate: charge.dueDate,
      paidOn: saoPauloDate(new Date()),
    });
    expect(expected.lateFeeCents).toBe(2_000);
    expect(expected.interestCents).toBeGreaterThan(0);
    expect(payment.amountCents).toBe(expected.amountCents);
    expect(payment.amountCents).toBeGreaterThan(charge.amountCents);

    // Segunda tentativa: mesma cobrança, mesmo QR emitido pelo provider (nada fabricado).
    const again = await fx.portalPay(lease, charge.id);
    expect(again.status).toBe(200);
    expect(again.pcid).toBe(payment.pcid);
    expect(again.body.pixQrCode).toBe(payment.body.pixQrCode);
    expect(String(again.body.pixQrCode)).toContain(payment.pcid);
  });
});
