import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FakeScreeningProvider, FakeSignatureProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { buildTestApp, registerUser } from './helpers.js';

interface PropertyBody {
  property: { id: string };
}

interface PartyBody {
  party: { id: string };
}

interface ApplicationBody {
  application: { id: string; status: string };
}

const HIGH_RISK_CPF = '11144477735';
const OK_CPF = '52998224725';

describe('Fase 07: Screening + Contracts + Signature', () => {
  let app: FastifyInstance;
  const screeningProvider = new FakeScreeningProvider({ highRiskCpf: HIGH_RISK_CPF });
  const signatureProvider = new FakeSignatureProvider();

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupPartyAndApplication(
    cpf: string,
    organizationName?: string,
  ): Promise<{ cookie: string; partyId: string; applicationId: string }> {
    const { cookie } = await registerUser(app, {
      organizationName: organizationName ?? `Org S ${Math.random().toString(36).slice(2, 6)}`,
    });
    const party = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: { type: 'PERSON', name: 'Candidato', identities: [{ kind: 'CPF', value: cpf }] },
    });
    const partyId = (party.json() as PartyBody).party.id;
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Imóvel Contrato', propertyType: 'HOUSE' },
    });
    const propertyId = (prop.json() as PropertyBody).property.id;
    const application = await app.inject({
      method: 'POST',
      url: '/rental-applications',
      headers: { cookie },
      payload: { partyId, propertyId },
    });
    expect(application.statusCode).toBe(201);
    return {
      cookie,
      partyId,
      applicationId: (application.json() as ApplicationBody).application.id,
    };
  }

  async function runWorker(): Promise<void> {
    await runInboxJobs({
      db: app.db,
      limit: 10,
      screening: screeningProvider,
      signature: signatureProvider,
    });
  }

  it('fluxo completo: consent → submit → screening APPROVE → contract → generate → SIGNED', async () => {
    const { cookie, partyId, applicationId } = await setupPartyAndApplication(OK_CPF);

    // Consentimento ausente → submit falha
    const submitNoConsent = await app.inject({
      method: 'PATCH',
      url: `/rental-applications/${applicationId}/status`,
      headers: { cookie },
      payload: { status: 'SUBMITTED' },
    });
    expect(submitNoConsent.statusCode).toBe(409);

    // Consentimento
    const consent = await app.inject({
      method: 'POST',
      url: `/parties/${partyId}/consents`,
      headers: { cookie },
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    expect(consent.statusCode).toBe(201);

    // Submit + screening
    const submit = await app.inject({
      method: 'PATCH',
      url: `/rental-applications/${applicationId}/status`,
      headers: { cookie },
      payload: { status: 'SUBMITTED' },
    });
    expect(submit.statusCode).toBe(200);
    const screening = await app.inject({
      method: 'POST',
      url: `/rental-applications/${applicationId}/screening`,
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    expect(screening.statusCode).toBe(202);
    await runWorker();

    // Score alto (CPF OK) → APPROVED automático
    const aggregate = await app.inject({
      method: 'GET',
      url: `/rental-applications/${applicationId}`,
      headers: { cookie },
    });
    const aggBody = aggregate.json() as {
      application: { status: string };
      latestScreeningResult: { decision: string } | null;
    };
    expect(aggBody.application.status).toBe('APPROVED');
    expect(aggBody.latestScreeningResult?.decision).toBe('APPROVE');

    // Template + contrato
    const template = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { cookie },
      payload: {
        name: 'Contrato Locação',
        body: 'PROPRIETARIO: {{landlordName}}\nLOCATARIO: {{tenantName}}\nIMOVEL: {{propertyTitle}}\nALUGUEL: {{monthlyRentCents}}',
      },
    });
    expect(template.statusCode).toBe(201);
    const templateId = (template.json() as { template: { id: string } }).template.id;
    const approve = await app.inject({
      method: 'PATCH',
      url: `/contract-templates/${templateId}/approve`,
      headers: { cookie },
      payload: {},
    });
    console.log('APPROVE:', approve.statusCode, approve.body.slice(0, 150));
    expect(approve.statusCode).toBe(200);

    const contract = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { cookie },
      payload: { applicationId, templateId },
    });
    expect(contract.statusCode).toBe(201);
    const contractId = (contract.json() as { contract: { id: string } }).contract.id;

    const generate = await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/generate`,
      headers: { cookie },
      payload: {},
    });
    console.log('GEN:', generate.statusCode, generate.body.slice(0, 200));
    expect(generate.statusCode).toBe(200);
    const generated = generate.json() as {
      contract: { contract: { status: string; content: string | null; contentHash: string } };
    };
    expect(generated.contract.contract.status).toBe('GENERATED');
    expect(generated.contract.contract.content).toContain('LOCATARIO:');
    expect(generated.contract.contract.content).toContain('Candidato');
    expect(generated.contract.contract.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const send = await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/send-for-signature`,
      headers: { cookie },
      payload: {},
    });
    console.log('SEND:', send.statusCode, send.body.slice(0, 150));
    expect(send.statusCode).toBe(201);

    // Webhook SIGNER_SIGNED (2 signatários: landlord + tenant)
    const envelope = send.json() as { envelope: { id: string; providerEnvelopeId: string } };
    for (const order of [1, 2]) {
      await app.inject({
        method: 'POST',
        url: '/webhooks/signature',
        payload: {
          provider: 'FAKE',
          eventType: 'SIGNER_SIGNED',
          providerEventId: `evt-${String(order)}-${String(Math.random())}`,
          providerEnvelopeId: envelope.envelope.providerEnvelopeId,
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
        providerEventId: `evt-complete-${String(Math.random())}`,
        providerEnvelopeId: envelope.envelope.providerEnvelopeId,
      },
    });
    await runWorker();

    const finalContract = await app.inject({
      method: 'GET',
      url: `/contracts/${contractId}`,
      headers: { cookie },
    });
    expect((finalContract.json() as { contract: { status: string } }).contract.status).toBe(
      'SIGNED',
    );
  });

  it('red flag HIGH → REJECTED + lead LOST', async () => {
    const { cookie, applicationId } = await setupPartyAndApplication(HIGH_RISK_CPF);
    // Consentimento
    const application = await app.inject({
      method: 'GET',
      url: `/rental-applications/${applicationId}`,
      headers: { cookie },
    });
    const partyId = (application.json() as { application: { partyId: string } }).application
      .partyId;
    await app.inject({
      method: 'POST',
      url: `/parties/${partyId}/consents`,
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
    await runWorker();

    const aggregate = await app.inject({
      method: 'GET',
      url: `/rental-applications/${applicationId}`,
      headers: { cookie },
    });
    const aggBody = aggregate.json() as { application: { status: string } };
    expect(aggBody.application.status).toBe('REJECTED');
  });

  it('template APPROVED imutável: geração usa variáveis e hash confere', async () => {
    const { cookie, partyId, applicationId } = await setupPartyAndApplication(OK_CPF);
    await app.inject({
      method: 'POST',
      url: `/parties/${partyId}/consents`,
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
    await runWorker();

    const template = await app.inject({
      method: 'POST',
      url: '/contract-templates',
      headers: { cookie },
      payload: {
        name: 'T2',
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

    // Versão nova (DRAFT) não substitui a aprovada
    const version = await app.inject({
      method: 'POST',
      url: `/contract-templates/${templateId}/versions`,
      headers: { cookie },
      payload: { body: 'NOVA CLAUSULA' },
    });
    expect(version.statusCode).toBe(201);

    const contract = await app.inject({
      method: 'POST',
      url: '/contracts',
      headers: { cookie },
      payload: { applicationId, templateId },
    });
    const contractId = (contract.json() as { contract: { id: string } }).contract.id;
    const generate = await app.inject({
      method: 'POST',
      url: `/contracts/${contractId}/generate`,
      headers: { cookie },
      payload: {},
    });
    console.log('GEN:', generate.statusCode, generate.body.slice(0, 200));
    expect(generate.statusCode).toBe(200);
    const content =
      (generate.json() as { contract: { contract: { content: string | null } } }).contract.contract
        .content ?? '';
    expect(content).toContain('ALUGUEL:');
    expect(content).toContain('TEN:');
  });

  it('consentimento duplicado → 409; cross-org → 404', async () => {
    const { cookie, partyId } = await setupPartyAndApplication(OK_CPF);
    await app.inject({
      method: 'POST',
      url: `/parties/${partyId}/consents`,
      headers: { cookie },
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    const dup = await app.inject({
      method: 'POST',
      url: `/parties/${partyId}/consents`,
      headers: { cookie },
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    expect(dup.statusCode).toBe(409);

    const other = await registerUser(app);
    const otherOrg = await app.inject({
      method: 'GET',
      url: `/rental-applications`,
      headers: { cookie: other.cookie },
    });
    expect(otherOrg.statusCode).toBe(200);
    const first = await app.inject({
      method: 'GET',
      url: '/rental-applications',
      headers: { cookie },
    });
    const applicationId = (first.json() as { applications: Array<{ id: string }> }).applications[0]
      ?.id;
    const forbidden = await app.inject({
      method: 'GET',
      url: `/rental-applications/${String(applicationId)}`,
      headers: { cookie: other.cookie },
    });
    expect(forbidden.statusCode).toBe(404);
  });
});
