import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import * as contracts from '@aluguei/contracts';
import * as domain from '@aluguei/domain';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { createFinanceFixtures } from './finance-fixtures.js';
import type { LeaseFixture } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { futurePeriod } from './test-dates.js';

/**
 * Teto dos valores em centavos na API (pendência do inventário da trilha G do G3, P2-12). Os
 * centavos de cada linha ficam em `integer` (int4, até R$ 21.474.836,47) e a API não tinha teto:
 * acima do int4 o INSERT estourava e a resposta era 500; abaixo dele, valores sem sentido (aluguel
 * de R$ 5 milhões) entravam e a cobrança somada (aluguel + condomínio + impostos + multa + juros)
 * podia estourar depois. O teto é R$ 1.000.000,00 por valor digitado, o mesmo no domínio, no
 * contrato e no campo de dinheiro do painel.
 */
const MAX = 100_000_000;
const INT4_OVER = 3_000_000_000;

describe('teto dos centavos: acima dele a API responde 400, nunca 500', () => {
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
  let lease: LeaseFixture;

  beforeAll(async () => {
    app = await buildTestApp();
    fx = createFinanceFixtures(app, () => worker());
    lease = await fx.setupLease({ rentCents: 150_000, landlord: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('o teto é o mesmo no domínio e no contrato: R$ 1.000.000,00', () => {
    expect(domain.MAX_AMOUNT_CENTS).toBe(MAX);
    expect(contracts.MAX_AMOUNT_CENTS).toBe(MAX);
  });

  const cases = (): Array<[string, 'POST' | 'PUT', string, (cents: number) => object]> => [
    [
      'aluguel do imóvel',
      'PUT',
      `/properties/${lease.propertyId}/financial-terms`,
      (cents) => ({ monthlyRentCents: cents }),
    ],
    [
      'condomínio do imóvel',
      'PUT',
      `/properties/${lease.propertyId}/financial-terms`,
      (cents) => ({ monthlyRentCents: 150_000, condoFeeCents: cents }),
    ],
    [
      'IPTU e caução do imóvel',
      'PUT',
      `/properties/${lease.propertyId}/financial-terms`,
      (cents) => ({ monthlyRentCents: 150_000, iptuCents: cents, securityDepositCents: cents }),
    ],
    ['orçamento do lead', 'POST', '/leads', (cents) => ({ budgetMaxCents: cents })],
    [
      'aluguel da proposta',
      'POST',
      '/proposals',
      (cents) => ({ propertyId: lease.propertyId, monthlyRentCents: cents }),
    ],
    [
      'valor avulso da cobrança',
      'POST',
      '/charges',
      (cents) => ({ leaseId: lease.leaseId, amountOverrideCents: cents }),
    ],
    [
      'aluguel da renovação',
      'POST',
      `/leases/${lease.leaseId}/renew`,
      (cents) => ({ endDate: '2029-12-31', monthlyRentCents: cents }),
    ],
    [
      'aluguel do reajuste',
      'POST',
      `/leases/${lease.leaseId}/readjust`,
      (cents) => ({
        effectiveFrom: futurePeriod(2),
        indexName: 'OUTRO',
        newMonthlyRentCents: cents,
      }),
    ],
  ];

  it.each([
    ['acima do int4 (antes: 500 no INSERT)', INT4_OVER],
    ['acima do teto e dentro do int4 (antes: aceito)', MAX + 1],
  ])('%s', async (_label, cents) => {
    for (const [what, method, url, payload] of cases()) {
      const res = await fx.call(method, url, { cookie: lease.cookie, payload: payload(cents) });
      expect(res.status, `${what}: ${JSON.stringify(res.body)}`).toBe(400);
    }
  });

  it('no teto, o valor é aceito', async () => {
    const terms = await fx.call('PUT', `/properties/${lease.propertyId}/financial-terms`, {
      cookie: lease.cookie,
      payload: { monthlyRentCents: MAX, condoFeeCents: MAX, iptuCents: MAX },
    });
    expect(terms.status, JSON.stringify(terms.body)).toBe(200);
    const lead = await fx.call('POST', '/leads', {
      cookie: lease.cookie,
      payload: { budgetMinCents: 0, budgetMaxCents: MAX },
    });
    expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  });

  it('reajuste por índice que leva o aluguel acima do teto é recusado (400)', async () => {
    const top = await fx.setupLease({ rentCents: MAX, landlord: true });
    const res = await fx.call('POST', `/leases/${top.leaseId}/readjust`, {
      cookie: top.cookie,
      payload: { effectiveFrom: futurePeriod(2), indexName: 'IGPM', adjustmentBps: 500 },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
  });
});
