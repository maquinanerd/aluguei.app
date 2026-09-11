import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Fixtures dos testes financeiros (auditoria 2026-09-10, P0-01/02/03):
 * locação completa pela API (screening FAKE → contrato → assinatura FAKE →
 * locação), cobrança, iniciação de pagamento, webhook do provider e o retrato
 * do dinheiro de uma organização (pagamentos, split, repasses, razão).
 */

export type Json = Record<string, unknown>;

export interface LeaseFixture {
  cookie: string;
  orgId: string;
  tenantId: string;
  landlordId: string | null;
  leaseId: string;
}

export interface Initiation {
  status: number;
  paymentId: string;
  pcid: string;
  amountCents: number;
  /** Corpo da resposta — usado nas mensagens de falha. */
  body: Json;
}

export interface MoneySnapshot {
  chargeStatus: string;
  paymentsConfirmed: number;
  allocations: number;
  allocationSum: number;
  payouts: number;
  payoutSum: number;
  paymentTx: number;
  payoutTx: number;
  refundTx: number;
  cash: number;
  unapplied: number;
}

type PaymentEvent = 'PAYMENT_CONFIRMED' | 'PAYMENT_REFUNDED' | 'PAYMENT_FAILED' | 'PAYMENT_OVERDUE';

export function createFinanceFixtures(app: FastifyInstance, runWorker: () => Promise<unknown>) {
  const uniq = (): string => Math.random().toString(36).slice(2, 10);
  let registrations = 0;

  /**
   * Registra uma organização. Cada chamada usa um IP diferente porque
   * `POST /auth/register` tem rate limit por IP (10/min) e uma suíte financeira
   * cria muitas organizações — o limite é comportamento de produção e fica
   * intacto (ver hardening.test.ts).
   */
  async function registerOrg(): Promise<{ cookie: string; orgId: string; userId: string }> {
    registrations += 1;
    const suffix = uniq();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      remoteAddress: `10.${String((registrations >> 16) & 255)}.${String((registrations >> 8) & 255)}.${String(registrations & 255)}`,
      payload: {
        name: 'Usuário Teste',
        email: `fin-${suffix}@example.com`,
        password: 'senha-segura-123',
        organizationName: `Imobiliária ${suffix}`,
      },
    });
    if (res.statusCode !== 201) {
      throw new Error(`registro falhou: ${String(res.statusCode)} ${res.body}`);
    }
    const body = res.json() as { org: { id: string }; user: { id: string } };
    const setCookie = res.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
    return { cookie, orgId: body.org.id, userId: body.user.id };
  }

  async function call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    opts: { cookie?: string; payload?: object } = {},
  ): Promise<{ status: number; body: Json }> {
    const res = await app.inject({
      method,
      url,
      headers: opts.cookie ? { cookie: opts.cookie } : {},
      ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
    });
    let body: Json = {};
    try {
      body = res.json() as Json;
    } catch {
      body = {};
    }
    return { status: res.statusCode, body };
  }

  async function rows<T>(query: SQL): Promise<T[]> {
    const result = await app.db.execute(query);
    return result.rows as T[];
  }

  function idOf(body: Json, key: string): string {
    const value = body[key] as { id?: unknown } | undefined;
    if (typeof value?.id !== 'string') {
      throw new Error(`resposta sem ${key}.id: ${JSON.stringify(body)}`);
    }
    return value.id;
  }

  async function setupLease(opts: { rentCents: number; landlord: boolean }): Promise<LeaseFixture> {
    const user = await registerOrg();
    const cookie = user.cookie;
    const property = await call('POST', '/properties', {
      cookie,
      payload: { title: `Imóvel ${uniq()}`, propertyType: 'APARTMENT' },
    });
    const propertyId = idOf(property.body, 'property');
    const terms = await call('PUT', `/properties/${propertyId}/financial-terms`, {
      cookie,
      payload: { monthlyRentCents: opts.rentCents },
    });
    expect(terms.status).toBe(200);

    let landlordId: string | null = null;
    if (opts.landlord) {
      const owner = await call('POST', '/parties', {
        cookie,
        payload: {
          type: 'PERSON',
          name: 'Proprietária',
          identities: [{ kind: 'CPF', value: '11144477735' }],
        },
      });
      landlordId = idOf(owner.body, 'party');
      const link = await call('POST', `/properties/${propertyId}/owners`, {
        cookie,
        payload: { partyId: landlordId },
      });
      expect(link.status, JSON.stringify(link.body)).toBeLessThan(300);
    }

    const tenant = await call('POST', '/parties', {
      cookie,
      payload: {
        type: 'PERSON',
        name: 'Locatária',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const tenantId = idOf(tenant.body, 'party');
    const consent = await call('POST', `/parties/${tenantId}/consents`, {
      cookie,
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    expect(consent.status).toBe(201);
    const application = await call('POST', '/rental-applications', {
      cookie,
      payload: { partyId: tenantId, propertyId },
    });
    const applicationId = idOf(application.body, 'application');
    await call('PATCH', `/rental-applications/${applicationId}/status`, {
      cookie,
      payload: { status: 'SUBMITTED' },
    });
    await call('POST', `/rental-applications/${applicationId}/screening`, {
      cookie,
      payload: { provider: 'FAKE' },
    });
    await runWorker();
    const current = await call('GET', `/rental-applications/${applicationId}`, { cookie });
    const status = (current.body.application as { status?: string } | undefined)?.status;
    if (status === 'MANUAL_REVIEW') {
      await call('PATCH', `/rental-applications/${applicationId}/status`, {
        cookie,
        payload: { status: 'APPROVED', decisionReason: 'Aprovação manual (teste)' },
      });
    }

    const template = await call('POST', '/contract-templates', {
      cookie,
      payload: {
        name: `Contrato ${uniq()}`,
        body: 'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}',
      },
    });
    const templateId = idOf(template.body, 'template');
    await call('PATCH', `/contract-templates/${templateId}/approve`, { cookie, payload: {} });
    const contract = await call('POST', '/contracts', {
      cookie,
      payload: { applicationId, templateId },
    });
    const contractId = idOf(contract.body, 'contract');
    await call('POST', `/contracts/${contractId}/generate`, { cookie, payload: {} });
    const send = await call('POST', `/contracts/${contractId}/send-for-signature`, {
      cookie,
      payload: {},
    });
    const envelopeId =
      (send.body.envelope as { providerEnvelopeId?: string } | undefined)?.providerEnvelopeId ?? '';
    expect(envelopeId, JSON.stringify(send.body)).not.toBe('');
    const signers = opts.landlord ? 2 : 1;
    for (let order = 1; order <= signers; order += 1) {
      await call('POST', '/webhooks/signature', {
        payload: {
          provider: 'FAKE',
          eventType: 'SIGNER_SIGNED',
          providerEventId: `sig-${uniq()}`,
          providerEnvelopeId: envelopeId,
          signerOrder: order,
        },
      });
      await runWorker();
    }
    await call('POST', '/webhooks/signature', {
      payload: {
        provider: 'FAKE',
        eventType: 'COMPLETED',
        providerEventId: `sig-${uniq()}`,
        providerEnvelopeId: envelopeId,
      },
    });
    await runWorker();

    const lease = await call('POST', '/leases', { cookie, payload: { contractId } });
    expect(lease.status, JSON.stringify(lease.body)).toBe(201);
    return {
      cookie,
      orgId: user.orgId,
      tenantId,
      landlordId,
      leaseId: idOf(lease.body, 'lease'),
    };
  }

  async function issueCharge(
    lease: LeaseFixture,
    periodStart: string,
  ): Promise<{ chargeId: string; amountCents: number }> {
    const res = await call('POST', '/charges', {
      cookie: lease.cookie,
      payload: { leaseId: lease.leaseId, periodStart },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const charge = res.body.charge as { id: string; amountCents: number };
    return { chargeId: charge.id, amountCents: charge.amountCents };
  }

  function toInitiation(res: { status: number; body: Json }): Initiation {
    const payment = res.body.payment as { id?: string; amountCents?: number } | undefined;
    return {
      status: res.status,
      paymentId: payment?.id ?? '',
      pcid: (res.body.providerChargeId as string | undefined) ?? '',
      amountCents: payment?.amountCents ?? 0,
      body: res.body,
    };
  }

  async function initiate(
    lease: LeaseFixture,
    chargeId: string,
    method: 'PIX' | 'BOLETO' = 'PIX',
  ): Promise<Initiation> {
    return toInitiation(
      await call('POST', `/charges/${chargeId}/payment`, {
        cookie: lease.cookie,
        payload: { method },
      }),
    );
  }

  async function portalPay(lease: LeaseFixture, chargeId: string): Promise<Initiation> {
    const access = await call('POST', '/portal/access', {
      cookie: lease.cookie,
      payload: { partyId: lease.tenantId, kind: 'TENANT' },
    });
    expect(access.status, JSON.stringify(access.body)).toBe(201);
    const consume = await app.inject({
      method: 'POST',
      url: '/portal/auth/consume',
      payload: { token: access.body.oneTimeToken as string },
    });
    expect(consume.statusCode).toBe(200);
    const header = consume.headers['set-cookie'];
    const setCookie = Array.isArray(header) ? header[0] : header;
    const portalCookie = setCookie?.split(';')[0] ?? '';
    return toInitiation(
      await call('POST', `/portal/tenant/charges/${chargeId}/payment`, {
        cookie: portalCookie,
        payload: { method: 'PIX' },
      }),
    );
  }

  /** Notificação do provider (não autentica nem confirma nada por si). */
  async function paymentWebhook(
    eventType: PaymentEvent,
    pcid: string,
    amountCents: number,
  ): Promise<number> {
    const res = await call('POST', '/webhooks/payments', {
      payload: {
        provider: 'FAKE',
        eventType,
        providerEventId: `evt-${uniq()}`,
        providerChargeId: pcid,
        amountCents,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    });
    return res.status;
  }

  async function money(orgId: string, chargeId: string): Promise<MoneySnapshot> {
    const [snapshot] = await rows<MoneySnapshot>(sql`
      select
        (select status from charges where id = ${chargeId}) as "chargeStatus",
        (select count(*)::int from payments
          where charge_id = ${chargeId} and status = 'CONFIRMED') as "paymentsConfirmed",
        (select count(*)::int from split_allocations
          where payment_id in (select id from payments where charge_id = ${chargeId})
            and status <> 'CANCELLED') as "allocations",
        (select coalesce(sum(amount_cents), 0)::int from split_allocations
          where payment_id in (select id from payments where charge_id = ${chargeId})
            and status <> 'CANCELLED') as "allocationSum",
        (select count(*)::int from payouts
          where org_id = ${orgId} and status <> 'CANCELLED') as "payouts",
        (select coalesce(sum(amount_cents), 0)::int from payouts
          where org_id = ${orgId} and status <> 'CANCELLED') as "payoutSum",
        (select count(distinct transaction_id)::int from ledger_entries
          where org_id = ${orgId} and reference_type = 'PAYMENT') as "paymentTx",
        (select count(distinct transaction_id)::int from ledger_entries
          where org_id = ${orgId} and reference_type = 'PAYOUT') as "payoutTx",
        (select count(distinct transaction_id)::int from ledger_entries
          where org_id = ${orgId} and reference_type = 'REFUND') as "refundTx",
        (select coalesce(sum(e.amount_cents), 0)::int from ledger_entries e
          join ledger_accounts a on a.id = e.account_id
          where e.org_id = ${orgId} and a.code = 'CASH') as "cash",
        (select coalesce(sum(e.amount_cents), 0)::int from ledger_entries e
          join ledger_accounts a on a.id = e.account_id
          where e.org_id = ${orgId} and a.code = 'UNAPPLIED_RECEIPTS') as "unapplied"
    `);
    if (!snapshot) {
      throw new Error('retrato financeiro vazio');
    }
    return snapshot;
  }

  /** Saldo por conta contábil da organização. */
  async function balances(orgId: string): Promise<Record<string, number>> {
    const list = await rows<{ code: string; total: number }>(sql`
      select a.code, coalesce(sum(e.amount_cents), 0)::int as total
      from ledger_accounts a
      left join ledger_entries e on e.account_id = a.id
      where a.org_id = ${orgId}
      group by a.code
    `);
    return Object.fromEntries(list.map((row) => [row.code, row.total]));
  }

  async function inbox(orgId: string): Promise<Array<{ status: string; attempts: number }>> {
    return rows(sql`
      select status, attempts from webhook_inbox
      where org_id = ${orgId} and provider = 'PAYMENT'
      order by created_at
    `);
  }

  return {
    call,
    rows,
    uniq,
    registerOrg,
    setupLease,
    issueCharge,
    initiate,
    portalPay,
    paymentWebhook,
    money,
    balances,
    inbox,
  };
}
