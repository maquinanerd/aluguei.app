import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FakeScreeningProvider, FakeSignatureProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, fakePayments, fakeStorage, registerUser } from './helpers.js';

/**
 * E2E crítico (Fase 12): journey completo ponta-a-ponta via API pública:
 * imóvel → anúncio → lead → contrato assinado → locação → cobrança → pagamento
 * (QR) → confirmação via webhook → portal do locatário.
 */
describe('Fase 12: E2E crítico (journey completo)', () => {
  let app: FastifyInstance;
  const screening = new FakeScreeningProvider();
  const signature = new FakeSignatureProvider();

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function runWorker(): Promise<void> {
    await runInboxJobs({ db: app.db, limit: 10, screening, signature, payments: fakePayments });
  }

  it('imóvel → anúncio → lead → contrato → locação → cobrança → pagamento → portal', async () => {
    const { cookie } = await registerUser(app);

    // 1. Imóvel + termos financeiros + endereço público + mídia
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Apartamento E2E', propertyType: 'APARTMENT' },
    });
    const propertyId = (prop.json() as { property: { id: string } }).property.id;
    const terms = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 100_000 },
    });
    expect(terms.statusCode).toBe(200);
    await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/address`,
      headers: { cookie },
      payload: {
        publicAddress: { street: 'Rua E2E', city: 'São Paulo', state: 'SP', zipCode: '01310-100' },
      },
    });
    const upload = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    });
    const { key } = upload.json() as { key: string };
    fakeStorage.markUploaded(key, 2048);
    const confirm = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/confirm`,
      headers: { cookie },
      payload: { key },
    });
    expect(confirm.statusCode).toBe(201);

    // 2. Anúncio READY → PUBLISHED (site público)
    const listing = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title: 'Apartamento E2E', description: '2 quartos' },
    });
    const listingId = (listing.json() as { listing: { id: string } }).listing.id;
    await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'READY' },
    });
    const published = await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'PUBLISHED' },
    });
    expect(published.statusCode).toBe(200);

    // 3. Lead + atendimento (timeline)
    const party = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Locatária E2E',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const tenantId = (party.json() as { party: { id: string } }).party.id;
    const lead = await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie },
      payload: { partyId: tenantId, source: 'PORTAL' },
    });
    expect(lead.statusCode).toBe(201);

    // 4. Análise cadastral com consentimento + contrato assinado
    await app.inject({
      method: 'POST',
      url: `/parties/${tenantId}/consents`,
      headers: { cookie },
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    const application = await app.inject({
      method: 'POST',
      url: '/rental-applications',
      headers: { cookie },
      payload: { partyId: tenantId, propertyId },
    });
    const applicationId = (application.json() as { application: { id: string } }).application.id;
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
    await runWorker();
    const applicationAfter = await app.inject({
      method: 'GET',
      url: `/rental-applications/${applicationId}`,
      headers: { cookie },
    });
    expect(
      (applicationAfter.json() as { application: { status: string } }).application.status,
    ).toBe('APPROVED');

    const template = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { cookie },
      payload: {
        name: 'Template E2E',
        body: 'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}',
      },
    });
    const templateId = (template.json() as { template: { id: string } }).template.id;
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
    const contractId = (contract.json() as { contract: { id: string } }).contract.id;
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
    expect(send.statusCode).toBe(201);
    const envelopeId = (send.json() as { envelope: { providerEnvelopeId: string } }).envelope
      .providerEnvelopeId;
    for (const order of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: '/webhooks/signature',
        payload: {
          provider: 'FAKE',
          eventType: 'SIGNER_SIGNED',
          providerEventId: `e2e-sig-${String(order)}-${Math.random().toString(36).slice(2, 6)}`,
          providerEnvelopeId: envelopeId,
          signerOrder: order,
        },
      });
      await runWorker();
    }
    await app.inject({
      method: 'POST',
      url: '/webhooks/signature',
      payload: {
        provider: 'FAKE',
        eventType: 'COMPLETED',
        providerEventId: `e2e-complete-${Math.random().toString(36).slice(2, 6)}`,
        providerEnvelopeId: envelopeId,
      },
    });
    await runWorker();
    const contractAfter = await app.inject({
      method: 'GET',
      url: `/contracts/${contractId}`,
      headers: { cookie },
    });
    expect((contractAfter.json() as { contract: { status: string } }).contract.status).toBe(
      'SIGNED',
    );

    // 5. Locação + cobrança + pagamento PIX
    const lease = await app.inject({
      method: 'POST',
      url: '/leases',
      headers: { cookie },
      payload: { contractId },
    });
    const leaseId = (lease.json() as { lease: { id: string } }).lease.id;
    const charge = await app.inject({
      method: 'POST',
      url: '/charges',
      headers: { cookie },
      payload: { leaseId, periodStart: '2026-11-01' },
    });
    const chargeId = (charge.json() as { charge: { id: string } }).charge.id;
    const payment = await app.inject({
      method: 'POST',
      url: `/charges/${chargeId}/payment`,
      headers: { cookie },
      payload: { method: 'PIX' },
    });
    const paymentBody = payment.json() as {
      payment: { status: string };
      pixQrCode: string | null;
      providerChargeId: string;
    };
    expect(paymentBody.payment.status).toBe('PENDING');
    expect(paymentBody.pixQrCode).toBeTruthy();

    // 6. Confirmação via webhook → charge PAID
    await app.inject({
      method: 'POST',
      url: '/webhooks/payments',
      payload: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `e2e-pay-${Math.random().toString(36).slice(2, 6)}`,
        providerChargeId: paymentBody.providerChargeId,
        amountCents: 100_000,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    });
    await runWorker();
    const chargeAfter = await app.inject({
      method: 'GET',
      url: `/charges/${chargeId}`,
      headers: { cookie },
    });
    expect((chargeAfter.json() as { charge: { status: string } }).charge.status).toBe('PAID');

    // 7. Portal do locatário: convite → sessão → extrato com cobrança paga
    const access = await app.inject({
      method: 'POST',
      url: '/portal/access',
      headers: { cookie },
      payload: { partyId: tenantId, kind: 'TENANT' },
    });
    const oneTimeToken = (access.json() as { oneTimeToken: string }).oneTimeToken;
    const consume = await app.inject({
      method: 'POST',
      url: '/portal/auth/consume',
      payload: { token: oneTimeToken },
    });
    expect(consume.statusCode).toBe(200);
    const portalCookie = (consume.headers['set-cookie'] ?? '').toString();
    const statement = await app.inject({
      method: 'GET',
      url: '/portal/tenant/statement',
      headers: { cookie: portalCookie },
    });
    const totals = (statement.json() as { totals: { billedCents: number; paidCents: number } })
      .totals;
    expect(totals.billedCents).toBe(100_000);
    expect(totals.paidCents).toBe(100_000);

    // 8. Reporting: receita reconhecida + funil
    const revenue = await app.inject({
      method: 'GET',
      url: '/reporting/revenue-monthly',
      headers: { cookie },
    });
    expect(revenue.statusCode).toBe(200);
  });
});
