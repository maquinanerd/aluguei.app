import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createFinanceFixtures } from './finance-fixtures.js';

/**
 * Fixtures de contrato (Gate G2, trilha A): leva um contrato a cada estado do
 * ciclo pela API pública — candidatura aprovada pelo screening FAKE, template
 * aprovado, contrato DRAFT, gerado, enviado, parcialmente assinado, assinado e
 * cancelado. Reaproveita o registro com IP distinto das fixtures financeiras
 * (rate limit de `POST /auth/register`).
 */

export interface ApplicationFixture {
  cookie: string;
  orgId: string;
  userId: string;
  propertyId: string;
  tenantId: string;
  landlordId: string | null;
  applicationId: string;
}

export interface ContractFixture extends ApplicationFixture {
  templateId: string;
  contractId: string;
}

export interface SentContractFixture extends ContractFixture {
  providerEnvelopeId: string;
  signers: number;
}

/** Template com as quatro variáveis que a geração sempre forneceu. */
export const LEGACY_TEMPLATE_BODY =
  'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}';

export interface ContractRow {
  status: string;
  content: string | null;
  content_hash: string | null;
  signed_at: string | null;
  updated_at: string;
}

export function createContractFixtures(app: FastifyInstance, runWorker: () => Promise<unknown>) {
  const base = createFinanceFixtures(app, runWorker);
  const { call, rows, uniq, registerOrg } = base;

  async function approvedApplication(
    opts: { rentCents?: number; landlord?: boolean } = {},
  ): Promise<ApplicationFixture> {
    const user = await registerOrg();
    const cookie = user.cookie;
    const property = await call('POST', '/properties', {
      cookie,
      payload: { title: `Imóvel Contrato ${uniq()}`, propertyType: 'APARTMENT' },
    });
    expect(property.status, JSON.stringify(property.body)).toBe(201);
    const propertyId = (property.body.property as { id: string }).id;
    const terms = await call('PUT', `/properties/${propertyId}/financial-terms`, {
      cookie,
      payload: { monthlyRentCents: opts.rentCents ?? 250_000 },
    });
    expect(terms.status, JSON.stringify(terms.body)).toBe(200);

    let landlordId: string | null = null;
    if (opts.landlord ?? true) {
      const owner = await call('POST', '/parties', {
        cookie,
        payload: {
          type: 'PERSON',
          name: 'Proprietária Contrato',
          identities: [{ kind: 'CPF', value: '11144477735' }],
        },
      });
      expect(owner.status, JSON.stringify(owner.body)).toBe(201);
      landlordId = (owner.body.party as { id: string }).id;
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
        name: 'Locatária Contrato',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    expect(tenant.status, JSON.stringify(tenant.body)).toBe(201);
    const tenantId = (tenant.body.party as { id: string }).id;
    const consent = await call('POST', `/parties/${tenantId}/consents`, {
      cookie,
      payload: { purpose: 'CREDIT_SCREENING' },
    });
    expect(consent.status, JSON.stringify(consent.body)).toBe(201);
    const application = await call('POST', '/rental-applications', {
      cookie,
      payload: { partyId: tenantId, propertyId },
    });
    expect(application.status, JSON.stringify(application.body)).toBe(201);
    const applicationId = (application.body.application as { id: string }).id;
    const submit = await call('PATCH', `/rental-applications/${applicationId}/status`, {
      cookie,
      payload: { status: 'SUBMITTED' },
    });
    expect(submit.status, JSON.stringify(submit.body)).toBe(200);
    const screening = await call('POST', `/rental-applications/${applicationId}/screening`, {
      cookie,
      payload: { provider: 'FAKE' },
    });
    expect(screening.status, JSON.stringify(screening.body)).toBe(202);
    await runWorker();
    const current = await call('GET', `/rental-applications/${applicationId}`, { cookie });
    expect((current.body.application as { status: string }).status).toBe('APPROVED');
    return {
      cookie,
      orgId: user.orgId,
      userId: user.userId,
      propertyId,
      tenantId,
      landlordId,
      applicationId,
    };
  }

  async function approvedTemplate(cookie: string, body = LEGACY_TEMPLATE_BODY): Promise<string> {
    const template = await call('POST', '/contract-templates', {
      cookie,
      payload: { name: `Contrato ${uniq()}`, body },
    });
    expect(template.status, JSON.stringify(template.body)).toBe(201);
    const templateId = (template.body.template as { id: string }).id;
    const approve = await call('PATCH', `/contract-templates/${templateId}/approve`, {
      cookie,
      payload: {},
    });
    expect(approve.status, JSON.stringify(approve.body)).toBe(200);
    return templateId;
  }

  async function draftContract(
    opts: { rentCents?: number; landlord?: boolean; templateBody?: string } = {},
  ): Promise<ContractFixture> {
    const application = await approvedApplication(opts);
    const templateId = await approvedTemplate(application.cookie, opts.templateBody);
    const contract = await call('POST', '/contracts', {
      cookie: application.cookie,
      payload: { applicationId: application.applicationId, templateId },
    });
    expect(contract.status, JSON.stringify(contract.body)).toBe(201);
    const contractId = (contract.body.contract as { id: string }).id;
    return { ...application, templateId, contractId };
  }

  async function generate(
    fixture: ContractFixture,
    payload: object = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return call('POST', `/contracts/${fixture.contractId}/generate`, {
      cookie: fixture.cookie,
      payload,
    });
  }

  async function generatedContract(
    opts: { rentCents?: number; landlord?: boolean; templateBody?: string } = {},
  ): Promise<ContractFixture> {
    const fixture = await draftContract(opts);
    const res = await generate(fixture);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return fixture;
  }

  async function sentContract(
    opts: { rentCents?: number; landlord?: boolean; templateBody?: string } = {},
  ): Promise<SentContractFixture> {
    const fixture = await generatedContract(opts);
    const send = await call('POST', `/contracts/${fixture.contractId}/send-for-signature`, {
      cookie: fixture.cookie,
      payload: {},
    });
    expect(send.status, JSON.stringify(send.body)).toBe(201);
    const providerEnvelopeId =
      (send.body.envelope as { providerEnvelopeId?: string } | undefined)?.providerEnvelopeId ?? '';
    expect(providerEnvelopeId).not.toBe('');
    return { ...fixture, providerEnvelopeId, signers: fixture.landlordId ? 2 : 1 };
  }

  async function signatureWebhook(
    providerEnvelopeId: string,
    event: { eventType: 'SIGNER_SIGNED' | 'COMPLETED' | 'FAILED'; signerOrder?: number },
    provider = 'FAKE',
  ): Promise<{ status: number; providerEventId: string }> {
    const providerEventId = `sig-${uniq()}`;
    const res = await call('POST', '/webhooks/signature', {
      payload: { provider, providerEventId, providerEnvelopeId, ...event },
    });
    return { status: res.status, providerEventId };
  }

  async function partiallySignedContract(
    opts: { rentCents?: number; templateBody?: string } = {},
  ): Promise<SentContractFixture> {
    const fixture = await sentContract({ ...opts, landlord: true });
    await signatureWebhook(fixture.providerEnvelopeId, {
      eventType: 'SIGNER_SIGNED',
      signerOrder: 1,
    });
    await runWorker();
    expect((await contractRow(fixture.contractId)).status).toBe('PARTIALLY_SIGNED');
    return fixture;
  }

  async function signedContract(
    opts: { rentCents?: number; landlord?: boolean; templateBody?: string } = {},
  ): Promise<SentContractFixture> {
    const fixture = await sentContract(opts);
    for (let order = 1; order <= fixture.signers; order += 1) {
      await signatureWebhook(fixture.providerEnvelopeId, {
        eventType: 'SIGNER_SIGNED',
        signerOrder: order,
      });
      await runWorker();
    }
    await signatureWebhook(fixture.providerEnvelopeId, { eventType: 'COMPLETED' });
    await runWorker();
    expect((await contractRow(fixture.contractId)).status).toBe('SIGNED');
    return fixture;
  }

  async function contractRow(contractId: string): Promise<ContractRow> {
    const [row] = await rows<ContractRow>(sql`
      select status, content, content_hash, signed_at::text as signed_at,
             updated_at::text as updated_at
      from contracts where id = ${contractId}
    `);
    if (!row) {
      throw new Error(`contrato ${contractId} não encontrado`);
    }
    return row;
  }

  return {
    ...base,
    approvedApplication,
    approvedTemplate,
    draftContract,
    generate,
    generatedContract,
    sentContract,
    signatureWebhook,
    partiallySignedContract,
    signedContract,
    contractRow,
  };
}
