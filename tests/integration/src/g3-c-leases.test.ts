import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { addDays, calculateChargeBreakdown, saoPauloDate } from '@aluguei/domain';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { createFinanceFixtures } from './finance-fixtures.js';
import type { Json, LeaseFixture } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { futurePeriod } from './test-dates.js';

/**
 * G3, trilha C (auditoria 2026-09-10): encargos por atraso configuráveis na locação (P1-07),
 * repasse entre coproprietários (P1-08) e renovação, reajuste e encerramento da locação (P1-20).
 */
describe('G3 trilha C — locação pela API', () => {
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

  const leaseOf = async (lease: LeaseFixture): Promise<Json> => {
    const res = await fx.call('GET', `/leases/${lease.leaseId}`, { cookie: lease.cookie });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body;
  };

  const monthsAgo = (months: number): string => {
    const today = saoPauloDate(new Date());
    const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const date = new Date(Date.UTC(year, month - 1 - months, 1));
    return date.toISOString().slice(0, 10);
  };

  describe('P1-07: encargos por atraso configuráveis na locação', () => {
    it('locação nova tem os padrões; a edição respeita os limites e fica auditada', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      expect((await leaseOf(lease)).lease).toMatchObject({
        lateFeeBps: 200,
        interestMonthlyBps: 100,
        dueDay: 10,
      });

      const updated = await fx.call('PATCH', `/leases/${lease.leaseId}/terms`, {
        cookie: lease.cookie,
        payload: { lateFeeBps: 1_000, interestMonthlyBps: 50, dueDay: 5 },
      });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.lease).toMatchObject({
        lateFeeBps: 1_000,
        interestMonthlyBps: 50,
        dueDay: 5,
      });

      for (const payload of [{ lateFeeBps: 1_001 }, { interestMonthlyBps: 101 }, { dueDay: 29 }]) {
        const refused = await fx.call('PATCH', `/leases/${lease.leaseId}/terms`, {
          cookie: lease.cookie,
          payload,
        });
        expect(refused.status, JSON.stringify(payload)).toBe(400);
      }

      const audit = await fx.rows<{ payload: Json }>(sql`
        select payload from audit_events
        where org_id = ${lease.orgId} and action = 'lease.terms_updated' and entity_id = ${lease.leaseId}
      `);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.payload).toMatchObject({
        changes: {
          lateFeeBps: { from: 200, to: 1_000 },
          interestMonthlyBps: { from: 100, to: 50 },
          dueDay: { from: 10, to: 5 },
        },
      });
    });

    it('cobrança nova vence no dia configurado na locação', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      await fx.call('PATCH', `/leases/${lease.leaseId}/terms`, {
        cookie: lease.cookie,
        payload: { dueDay: 5 },
      });
      const period = futurePeriod();
      const res = await fx.call('POST', '/charges', {
        cookie: lease.cookie,
        payload: { leaseId: lease.leaseId, periodStart: period },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.charge).toMatchObject({ dueDate: `${period.slice(0, 8)}05` });
    });

    it('período e vencimento da cobrança só como data civil AAAA-MM-DD', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      for (const payload of [
        { dueDate: 'abc' },
        { dueDate: '2026-10-17T00:00:00.000Z' },
        { dueDate: '2027-02-30' },
        { periodStart: '2026-13-01' },
      ]) {
        const refused = await fx.call('POST', '/charges', {
          cookie: lease.cookie,
          payload: { leaseId: lease.leaseId, ...payload },
        });
        expect(refused.status, JSON.stringify({ payload, body: refused.body })).toBe(400);
      }
      const accepted = await fx.call('POST', '/charges', {
        cookie: lease.cookie,
        payload: { leaseId: lease.leaseId, periodStart: futurePeriod(), dueDate: '2030-01-15' },
      });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
      expect(accepted.body.charge).toMatchObject({ dueDate: '2030-01-15' });
    });

    it('pagamento de cobrança vencida usa as taxas da locação e a data de São Paulo', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      await fx.call('PATCH', `/leases/${lease.leaseId}/terms`, {
        cookie: lease.cookie,
        payload: { lateFeeBps: 1_000, interestMonthlyBps: 50, dueDay: 5 },
      });
      const period = monthsAgo(2);
      const issued = await fx.call('POST', '/charges', {
        cookie: lease.cookie,
        payload: { leaseId: lease.leaseId, periodStart: period },
      });
      expect(issued.status, JSON.stringify(issued.body)).toBe(201);
      const charge = issued.body.charge as { id: string; dueDate: string };

      const payment = await fx.initiate(lease, charge.id);
      expect(payment.status, JSON.stringify(payment.body)).toBe(201);
      const expected = calculateChargeBreakdown({
        rentCents: 100_000,
        lateFeeBps: 1_000,
        interestMonthlyBps: 50,
        dueDate: charge.dueDate,
        paidOn: saoPauloDate(new Date()),
      });
      expect(expected.lateFeeCents).toBe(10_000);
      expect(payment.amountCents).toBe(expected.amountCents);
    });
  });

  describe('P1-08: repasse entre coproprietários', () => {
    it('as participações cadastradas no imóvel não passam de 100%', async () => {
      const { cookie } = await fx.registerOrg();
      const property = await fx.call('POST', '/properties', {
        cookie,
        payload: { title: `Imóvel ${fx.uniq()}`, propertyType: 'APARTMENT' },
      });
      const propertyId = (property.body.property as { id: string }).id;
      const owner = async (cpf: string): Promise<string> => {
        const res = await fx.call('POST', '/parties', {
          cookie,
          payload: {
            type: 'PERSON',
            name: `Dona ${cpf}`,
            identities: [{ kind: 'CPF', value: cpf }],
          },
        });
        return (res.body.party as { id: string }).id;
      };
      const first = await owner('11144477735');
      const second = await owner('39053344705');
      const link = (partyId: string, pct: number) =>
        fx.call('POST', `/properties/${propertyId}/owners`, {
          cookie,
          payload: { partyId, ownershipSharePct: pct },
        });

      expect((await link(first, 60)).status).toBe(201);
      const tooMuch = await link(second, 50);
      expect(tooMuch.status, JSON.stringify(tooMuch.body)).toBe(409);
      expect(String(tooMuch.body.message)).toContain('110%');
      expect((await link(second, 40)).status).toBe(201);
    });

    it('locação de imóvel com participação faltando é recusada', async () => {
      let leaseResponse: { status: number; body: Json } | undefined;
      await fx.setupLease({
        rentCents: 100_000,
        landlord: true,
        owners: [
          { cpf: '11144477735', sharePct: 60 },
          { cpf: '39053344705', sharePct: null },
        ],
        onLease: (res) => {
          leaseResponse = res;
        },
      });
      expect(leaseResponse?.status, JSON.stringify(leaseResponse?.body)).toBe(409);
    });

    it('liquidação divide o repasse 60/40 sem perder centavo; cada coproprietário vê só a sua parte', async () => {
      const lease = await fx.setupLease({
        rentCents: 100_001,
        landlord: true,
        owners: [
          { cpf: '11144477735', sharePct: 60 },
          { cpf: '39053344705', sharePct: 40 },
        ],
      });
      const [majority, minority] = lease.landlordIds;
      expect((await leaseOf(lease)).landlords).toEqual([
        { partyId: majority, shareBps: 6_000 },
        { partyId: minority, shareBps: 4_000 },
      ]);

      const { chargeId } = await fx.issueCharge(lease, futurePeriod());
      const payment = await fx.initiate(lease, chargeId);
      expect(payment.status).toBe(201);
      await fakePayments.confirmCharge(payment.pcid);
      expect(await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents)).toBe(
        200,
      );
      await worker();

      const payouts = await fx.rows<{ partyId: string; amountCents: number }>(sql`
        select party_id as "partyId", amount_cents as "amountCents" from payouts
        where org_id = ${lease.orgId} and status <> 'CANCELLED' order by amount_cents desc
      `);
      // Comissão de 10% sobre 100.001 = 10.000; repasse 90.001 → 54.001 e 36.000.
      expect(payouts).toEqual([
        { partyId: majority, amountCents: 54_001 },
        { partyId: minority, amountCents: 36_000 },
      ]);

      const access = await fx.call('POST', '/portal/access', {
        cookie: lease.cookie,
        payload: { partyId: minority, kind: 'LANDLORD' },
      });
      expect(access.status, JSON.stringify(access.body)).toBe(201);
      const consume = await app.inject({
        method: 'POST',
        url: '/portal/auth/consume',
        payload: { token: access.body.oneTimeToken as string },
      });
      expect(consume.statusCode).toBe(200);
      const header = consume.headers['set-cookie'];
      const portalCookie = (Array.isArray(header) ? header[0] : header)?.split(';')[0] ?? '';
      const statement = await fx.call('GET', '/portal/landlord/statement', {
        cookie: portalCookie,
      });
      expect(statement.status, JSON.stringify(statement.body)).toBe(200);
      expect(statement.body.totals).toMatchObject({ allocatedCents: 36_000 });
      const contracts = await fx.call('GET', '/portal/landlord/contracts', {
        cookie: portalCookie,
      });
      expect(contracts.status).toBe(200);
      expect(contracts.body.contracts).toHaveLength(1);
    });
  });

  describe('P1-20: renovar, reajustar e encerrar', () => {
    it('reajuste por índice vale a partir do mês informado; cobranças anteriores mantêm o aluguel', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const effectiveFrom = futurePeriod(2);
      const readjust = await fx.call('POST', `/leases/${lease.leaseId}/readjust`, {
        cookie: lease.cookie,
        payload: { effectiveFrom, adjustmentBps: 452, indexName: 'IGPM' },
      });
      expect(readjust.status, JSON.stringify(readjust.body)).toBe(201);
      expect(readjust.body.amendment).toMatchObject({
        kind: 'READJUSTMENT',
        effectiveFrom,
        previousRentCents: 100_000,
        newRentCents: 104_520,
        indexName: 'IGPM',
        adjustmentBps: 452,
      });

      for (const payload of [
        { effectiveFrom, adjustmentBps: 452, newMonthlyRentCents: 104_520, indexName: 'IGPM' },
        { effectiveFrom, indexName: 'IGPM' },
      ]) {
        const refused = await fx.call('POST', `/leases/${lease.leaseId}/readjust`, {
          cookie: lease.cookie,
          payload,
        });
        expect(refused.status, JSON.stringify(payload)).toBe(400);
      }

      const before = await fx.issueCharge(lease, futurePeriod(1));
      const after = await fx.issueCharge(lease, futurePeriod(2));
      const rents = await fx.rows<{ id: string; rentCents: number }>(sql`
        select id, rent_cents as "rentCents" from charges where lease_id = ${lease.leaseId}
      `);
      expect(rents.find((r) => r.id === before.chargeId)?.rentCents).toBe(100_000);
      expect(rents.find((r) => r.id === after.chargeId)?.rentCents).toBe(104_520);
      const detail = await leaseOf(lease);
      expect(detail.lease).toMatchObject({ monthlyRentCents: 100_000 });
      expect(detail.amendments).toEqual([expect.objectContaining({ kind: 'READJUSTMENT' })]);
    });

    it('renovação estende o término e traz o aluguel novo a partir do mês seguinte', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const renewal = await fx.call('POST', `/leases/${lease.leaseId}/renew`, {
        cookie: lease.cookie,
        payload: { endDate: '2029-12-31', monthlyRentCents: 120_000 },
      });
      expect(renewal.status, JSON.stringify(renewal.body)).toBe(201);
      expect(renewal.body.lease).toMatchObject({ endDate: '2029-12-31' });
      expect(renewal.body.amendment).toMatchObject({
        kind: 'RENEWAL',
        newEndDate: '2029-12-31',
        effectiveFrom: futurePeriod(1),
        previousRentCents: 100_000,
        newRentCents: 120_000,
      });
      const next = await fx.issueCharge(lease, futurePeriod(1));
      const [row] = await fx.rows<{ rentCents: number }>(sql`
        select rent_cents as "rentCents" from charges where id = ${next.chargeId}
      `);
      expect(row?.rentCents).toBe(120_000);

      const backwards = await fx.call('POST', `/leases/${lease.leaseId}/renew`, {
        cookie: lease.cookie,
        payload: { endDate: '2029-06-30' },
      });
      expect(backwards.status).toBe(400);
    });

    it('reajuste antes de uma mudança de aluguel já registrada, ou depois do término, é recusado', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const later = await fx.call('POST', `/leases/${lease.leaseId}/readjust`, {
        cookie: lease.cookie,
        payload: { effectiveFrom: futurePeriod(3), adjustmentBps: 500, indexName: 'IPCA' },
      });
      expect(later.status, JSON.stringify(later.body)).toBe(201);

      // O reajuste de março foi calculado sobre o aluguel anterior; um reajuste de fevereiro
      // gravado depois deixaria março com um valor que ignora fevereiro.
      const earlier = await fx.call('POST', `/leases/${lease.leaseId}/readjust`, {
        cookie: lease.cookie,
        payload: { effectiveFrom: futurePeriod(2), adjustmentBps: 300, indexName: 'IPCA' },
      });
      expect(earlier.status, JSON.stringify(earlier.body)).toBe(409);
      const renewalBefore = await fx.call('POST', `/leases/${lease.leaseId}/renew`, {
        cookie: lease.cookie,
        payload: { endDate: addDays(futurePeriod(2), -1), monthlyRentCents: 110_000 },
      });
      expect(renewalBefore.status, JSON.stringify(renewalBefore.body)).toBe(409);

      const bounded = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const renewal = await fx.call('POST', `/leases/${bounded.leaseId}/renew`, {
        cookie: bounded.cookie,
        payload: { endDate: addDays(futurePeriod(2), -1) },
      });
      expect(renewal.status, JSON.stringify(renewal.body)).toBe(201);
      const afterEnd = await fx.call('POST', `/leases/${bounded.leaseId}/readjust`, {
        cookie: bounded.cookie,
        payload: { effectiveFrom: futurePeriod(2), adjustmentBps: 500, indexName: 'IPCA' },
      });
      expect(afterEnd.status, JSON.stringify(afterEnd.body)).toBe(400);
      const beforeStart = await fx.call('POST', `/leases/${bounded.leaseId}/readjust`, {
        cookie: bounded.cookie,
        payload: { effectiveFrom: '2020-01-01', adjustmentBps: 500, indexName: 'IPCA' },
      });
      expect(beforeStart.status, JSON.stringify(beforeStart.body)).toBe(400);
      expect((await leaseOf(bounded)).amendments).toHaveLength(1);
    });

    it('renovação de locação já vencida com aluguel novo atualiza o aluguel em vigor', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const today = saoPauloDate(new Date());
      const previousMonthEnd = addDays(monthsAgo(0), -1);
      await app.db.execute(sql`
        update leases set start_date = ${addDays(today, -400)}, end_date = ${previousMonthEnd}
        where id = ${lease.leaseId}
      `);
      const renewal = await fx.call('POST', `/leases/${lease.leaseId}/renew`, {
        cookie: lease.cookie,
        payload: { endDate: '2030-12-31', monthlyRentCents: 120_000 },
      });
      expect(renewal.status, JSON.stringify(renewal.body)).toBe(201);
      expect(renewal.body.amendment).toMatchObject({ effectiveFrom: monthsAgo(0) });
      expect(renewal.body.lease).toMatchObject({ monthlyRentCents: 120_000 });
    });

    it('encerramento com data futura: em encerramento, e cobranças agendadas depois do fim são canceladas', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const later = await fx.issueCharge(lease, futurePeriod(3));
      const endDate = addDays(futurePeriod(2), -1); // último dia do mês seguinte
      const ended = await fx.call('POST', `/leases/${lease.leaseId}/end`, {
        cookie: lease.cookie,
        payload: { endDate, reason: 'Acordo entre as partes' },
      });
      expect(ended.status, JSON.stringify(ended.body)).toBe(200);
      expect(ended.body.lease).toMatchObject({ status: 'TERMINATING', endDate });

      const [charge] = await fx.rows<{ status: string }>(sql`
        select status from charges where id = ${later.chargeId}
      `);
      expect(charge?.status).toBe('CANCELLED');
      const [receivable] = await fx.rows<{ total: number }>(sql`
        select coalesce(sum(e.amount_cents), 0)::int as total
        from ledger_entries e join ledger_accounts a on a.id = e.account_id
        where e.org_id = ${lease.orgId} and a.code = 'AR_RECEIVABLE'
      `);
      expect(receivable?.total).toBe(0);

      const renewal = await fx.call('POST', `/leases/${lease.leaseId}/renew`, {
        cookie: lease.cookie,
        payload: { endDate: '2030-12-31' },
      });
      expect(renewal.status).toBe(409);
    });

    it('encerramento com data passada leva a locação a ENDED', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      // Locação que começou há dois meses: o término não pode ser antes do início.
      const today = saoPauloDate(new Date());
      await app.db.execute(
        sql`update leases set start_date = ${addDays(today, -60)} where id = ${lease.leaseId}`,
      );
      const ended = await fx.call('POST', `/leases/${lease.leaseId}/end`, {
        cookie: lease.cookie,
        payload: { endDate: addDays(today, -1), reason: 'Entrega das chaves' },
      });
      expect(ended.status, JSON.stringify(ended.body)).toBe(200);
      expect(ended.body.lease).toMatchObject({ status: 'ENDED', endReason: 'Entrega das chaves' });

      const beforeStart = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const refused = await fx.call('POST', `/leases/${beforeStart.leaseId}/end`, {
        cookie: beforeStart.cookie,
        payload: { endDate: addDays(today, -1), reason: 'Data antes do início' },
      });
      expect(refused.status).toBe(400);
    });

    it('encerramento retroativo cancela a cobrança já aberta do mês seguinte ao término, sem pagamento', async () => {
      const lease = await fx.setupLease({ rentCents: 100_000, landlord: true });
      const today = saoPauloDate(new Date());
      await app.db.execute(
        sql`update leases set start_date = ${addDays(today, -400)} where id = ${lease.leaseId}`,
      );
      const current = await fx.issueCharge(lease, monthsAgo(0));
      const lastMonth = await fx.issueCharge(lease, monthsAgo(1));
      // A varredura diária já abriu as cobranças dos meses que começaram.
      await app.db.execute(sql`
        update charges set status = 'OPEN'
        where id in (${current.chargeId}, ${lastMonth.chargeId})
      `);

      const ended = await fx.call('POST', `/leases/${lease.leaseId}/end`, {
        cookie: lease.cookie,
        payload: { endDate: addDays(monthsAgo(0), -1), reason: 'Chaves entregues no mês passado' },
      });
      expect(ended.status, JSON.stringify(ended.body)).toBe(200);
      expect(ended.body.lease).toMatchObject({ status: 'ENDED' });

      const statuses = await fx.rows<{ id: string; status: string }>(sql`
        select id, status from charges where lease_id = ${lease.leaseId}
      `);
      // O mês do término continua devido; o mês seguinte, sem tentativa de pagamento, sai.
      expect(statuses.find((c) => c.id === lastMonth.chargeId)?.status).toBe('OPEN');
      expect(statuses.find((c) => c.id === current.chargeId)?.status).toBe('CANCELLED');
      const [receivable] = await fx.rows<{ total: number }>(sql`
        select coalesce(sum(e.amount_cents), 0)::int as total
        from ledger_entries e join ledger_accounts a on a.id = e.account_id
        where e.org_id = ${lease.orgId} and a.code = 'AR_RECEIVABLE'
      `);
      expect(receivable?.total).toBe(lastMonth.amountCents);
    });
  });
});
