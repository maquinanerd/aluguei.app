import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ledgerEntries, splitAllocations } from '@aluguei/db';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakePayments, fakeSignature, registerUser } from './helpers.js';

interface PropertyBody {
  property: { id: string };
}
interface PartyBody {
  party: { id: string };
}
interface ApplicationBody {
  application: { id: string };
}
interface TemplateBody {
  template: { id: string };
}
interface ContractBody {
  contract: { id: string };
}
interface LeaseBody {
  lease: { id: string };
}
interface ChargeBody {
  charge: { id: string; status: string; amountCents: number; orgId: string };
}

describe('Fase 08: Payments + Split + Ledger', () => {
  let app: FastifyInstance;
  const screeningProvider = new FakeScreeningProvider();

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function runWorker(
    opts: { signature?: boolean; screening?: boolean; payments?: boolean } = {},
  ) {
    const options: Parameters<typeof runInboxJobs>[0] = { db: app.db, limit: 10 };
    if (opts.screening) {
      options.screening = screeningProvider;
    }
    if (opts.signature) {
      options.signature = fakeSignature;
    }
    if (opts.payments) {
      options.payments = fakePayments;
    }
    await runInboxJobs(options);
  }

  async function setupSignedContract(): Promise<{ cookie: string; contractId: string }> {
    const { cookie } = await registerUser(app);
    // Party (tenant) + landlord owner
    const tenant = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Locatário',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const tenantId = (tenant.json() as PartyBody).party.id;
    const landlord = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Proprietário',
        identities: [{ kind: 'CPF', value: '11144477735' }],
      },
    });
    const landlordId = (landlord.json() as PartyBody).party.id;
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Imóvel Financeiro', propertyType: 'HOUSE' },
    });
    const propertyId = (prop.json() as PropertyBody).property.id;
    await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/owners`,
      headers: { cookie },
      payload: { partyId: landlordId },
    });
    await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 100_000 },
    });

    // Application → screening APPROVE (CPF OK) → contract → generate → sign (2 signatários)
    const application = await app.inject({
      method: 'POST',
      url: '/rental-applications',
      headers: { cookie },
      payload: { partyId: tenantId, propertyId },
    });
    const applicationId = (application.json() as ApplicationBody).application.id;
    await app.inject({
      method: 'POST',
      url: `/parties/${tenantId}/consents`,
      headers: { cookie },
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/rental-applications/${applicationId}/status`,
      headers: { cookie },
      payload: { status: 'SUBMITTED' },
    });
    await app.inject({
      method: 'POST',
      url: `/rental-applications/${applicationId}/screening`,
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    await runWorker({ screening: true });

    const template = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { cookie },
      payload: {
        name: 'Contrato Financeiro',
        body: 'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}',
      },
    });
    const templateId = (template.json() as TemplateBody).template.id;
    await app.inject({
      method: 'PATCH',
      url: `/contract-templates/${templateId}/approve`,
      headers: { cookie },
      payload: {},
    });
    const contract = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { cookie },
      payload: { applicationId, templateId },
    });
    const contractId = (contract.json() as ContractBody).contract.id;
    await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/generate`,
      headers: { cookie },
      payload: {},
    });
    const send = await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/send-for-signature`,
      headers: { cookie },
      payload: {},
    });
    const envelope = send.json() as { envelope: { providerEnvelopeId: string } };
    for (const order of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: '/webhooks/signature',
        payload: {
          provider: 'FAKE',
          eventType: 'SIGNER_SIGNED',
          providerEventId: `fin-evt-${String(order)}-${String(Math.random())}`,
          providerEnvelopeId: envelope.envelope.providerEnvelopeId,
          signerOrder: order,
        },
      });
      await runWorker({ signature: true });
    }
    await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      payload: {
        provider: 'FAKE',
        eventType: 'COMPLETED',
        providerEventId: `fin-complete-${String(Math.random())}`,
        providerEnvelopeId: envelope.envelope.providerEnvelopeId,
      },
    });
    await runWorker({ signature: true });
    return { cookie, contractId };
  }

  it('fluxo R$1000 com comissão 10%: lease→charge→payment→webhook→ledger balanceado→payout', async () => {
    const { cookie, contractId } = await setupSignedContract();

    // Lease
    const lease = await app.inject({
      method: 'POST',
      url: '/leases',
      headers: { cookie },
      payload: { contractId },
    });
    expect(lease.statusCode).toBe(201);
    const leaseId = (lease.json() as LeaseBody).lease.id;

    // Charge manual (scheduler não roda no teste)
    const charge = await app.inject({
      method: 'POST',
      url: '/charges',
      headers: { cookie },
      payload: { leaseId, periodStart: '2026-09-01' },
    });
    expect(charge.statusCode).toBe(201);
    const chargeId = (charge.json() as ChargeBody).charge.id;
    expect((charge.json() as ChargeBody).charge.amountCents).toBe(100_000);

    // Payment (PIX)
    const payment = await app.inject({
      method: 'POST',
      url: `/charges/${chargeId}/payment`,
      headers: { cookie },
      payload: { method: 'PIX' },
    });
    expect(payment.statusCode).toBe(201);
    const paymentBody = payment.json() as {
      payment: { id: string; status: string };
      pixQrCode: string | null;
      providerChargeId: string;
    };
    expect(paymentBody.payment.status).toBe('PENDING');
    expect(paymentBody.pixQrCode).toBeTruthy();

    // Webhook PAYMENT_CONFIRMED
    await app.inject({
      method: 'POST',
      url: '/webhooks/payments',
      payload: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `pay-conf-${String(Math.random())}`,
        providerChargeId: paymentBody.providerChargeId,
        amountCents: 100_000,
        paidAt: '2026-09-05T00:00:00.000Z',
      },
    });
    await runWorker({ payments: true });

    // Charge PAID
    const chargeAfter = await app.inject({
      method: 'GET',
      url: `/charges/${chargeId}`,
      headers: { cookie },
    });
    expect((chargeAfter.json() as ChargeBody).charge.status).toBe('PAID');

    // Ledger balanceado (soma por transaction_id = 0)
    const entries = await app.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orgId, (chargeAfter.json() as ChargeBody).charge.orgId));
    const byTransaction = new Map<string, number>();
    for (const entry of entries) {
      byTransaction.set(
        entry.transactionId,
        (byTransaction.get(entry.transactionId) ?? 0) + entry.amountCents,
      );
    }
    for (const [transactionId, balance] of byTransaction) {
      expect(balance, `ledger desbalanceado: ${transactionId}`).toBe(0);
    }
    expect(entries.length).toBeGreaterThanOrEqual(6); // T1 charge (3) + T2 payment (2) + T3 payout (2)

    // Split allocations: agency 10000c / landlord 90000c
    const allocations = await app.db
      .select()
      .from(splitAllocations)
      .where(eq(splitAllocations.paymentId, paymentBody.payment.id));
    const sumAllocations = allocations.reduce((acc, a) => acc + a.amountCents, 0);
    expect(sumAllocations).toBe(100_000);
    expect(allocations.find((a) => a.role === 'AGENCY')?.amountCents).toBe(10_000);
    expect(allocations.find((a) => a.role === 'LANDLORD')?.amountCents).toBe(90_000);

    // Payout criado para landlord
    const payouts = await app.inject({ method: 'GET', url: '/payouts', headers: { cookie } });
    expect((payouts.json() as { payouts: unknown[] }).payouts.length).toBeGreaterThan(0);
  });

  it('cross-org: charge de outra org → 404', async () => {
    const { cookie, contractId } = await setupSignedContract();
    const lease = await app.inject({
      method: 'POST',
      url: '/leases',
      headers: { cookie },
      payload: { contractId },
    });
    const leaseId = (lease.json() as LeaseBody).lease.id;
    const charge = await app.inject({
      method: 'POST',
      url: '/charges',
      headers: { cookie },
      payload: { leaseId, periodStart: '2026-10-01' },
    });
    const chargeId = (charge.json() as ChargeBody).charge.id;

    const other = await registerUser(app);
    const forbidden = await app.inject({
      method: 'GET',
      url: `/charges/${chargeId}`,
      headers: { cookie: other.cookie },
    });
    expect(forbidden.statusCode).toBe(404);
  });

  it('RBAC: agent sem acesso financeiro (403)', async () => {
    const owner = await registerUser(app, {
      email: `fin-owner-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org F ${Math.random().toString(36).slice(2, 6)}`,
    });
    const agent = await registerUser(app, {
      email: `fin-agent-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org A ${Math.random().toString(36).slice(2, 6)}`,
    });
    await app.inject({
      method: 'POST',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: agent.body.user.id, role: 'agent' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/switch-org',
      headers: { cookie: agent.cookie },
      payload: { orgId: owner.body.org.id },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/leases',
      headers: { cookie: agent.cookie },
    });
    expect(list.statusCode).toBe(403);
  });
});
