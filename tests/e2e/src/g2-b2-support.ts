import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, poll, registerViaApi, uniq } from './g2-b1-support';

/**
 * Sementes da Track B2 do Gate G2, pela API (providers FAKE): imóvel pronto para
 * publicar, candidatura aprovada pelo screening FAKE, template aprovado, contrato
 * assinado pelo webhook FAKE, locação e cobrança. As telas testadas partem daqui.
 */

export interface IdBody {
  id: string;
}

export const VALID_CPFS = ['52998224725', '11144477735', '39053344705', '15350946056'] as const;

export function nextMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

export async function seedParty(cookie: string, name: string, cpf: string): Promise<string> {
  const res = await api<{ party: IdBody }>('POST', '/parties', {
    cookie,
    json: { type: 'PERSON', name, identities: [{ kind: 'CPF', value: cpf }] },
  });
  expect(res.status, `pessoa "${name}"`).toBe(201);
  return res.body.party.id;
}

/** Imóvel com termos financeiros e endereço público: pronto para anúncio publicado. */
export async function seedReadyProperty(cookie: string, title: string): Promise<string> {
  const property = await api<{ property: IdBody }>('POST', '/properties', {
    cookie,
    json: { title, propertyType: 'APARTMENT' },
  });
  expect(property.status, `imóvel "${title}"`).toBe(201);
  const propertyId = property.body.property.id;
  const terms = await api('PUT', `/properties/${propertyId}/financial-terms`, {
    cookie,
    json: { monthlyRentCents: 250_000, minimumLeaseMonths: 12 },
  });
  expect(terms.status).toBe(200);
  const address = await api('PUT', `/properties/${propertyId}/address`, {
    cookie,
    json: {
      privateAddress: { street: 'Rua Privada', number: '10', city: 'São Paulo', state: 'SP' },
      publicAddress: { neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
    },
  });
  expect(address.status).toBe(200);
  return propertyId;
}

export async function seedPublishedListing(
  cookie: string,
  propertyId: string,
  title: string,
): Promise<string> {
  const listing = await api<{ listing: IdBody }>('POST', '/listings', {
    cookie,
    json: { propertyId, title },
  });
  expect(listing.status).toBe(201);
  const listingId = listing.body.listing.id;
  for (const status of ['READY', 'PUBLISHED']) {
    const res = await api('PATCH', `/listings/${listingId}/status`, { cookie, json: { status } });
    expect(res.status, `anúncio → ${status}`).toBe(200);
  }
  return listingId;
}

export async function seedApprovedApplication(
  cookie: string,
  propertyId: string,
  tenantId: string,
): Promise<string> {
  const consent = await api('POST', `/parties/${tenantId}/consents`, {
    cookie,
    json: { purpose: 'CREDIT_SCREENING' },
  });
  expect(consent.status).toBe(201);
  const application = await api<{ application: IdBody }>('POST', '/rental-applications', {
    cookie,
    json: { partyId: tenantId, propertyId },
  });
  expect(application.status).toBe(201);
  const applicationId = application.body.application.id;
  const submit = await api('PATCH', `/rental-applications/${applicationId}/status`, {
    cookie,
    json: { status: 'SUBMITTED' },
  });
  expect(submit.status).toBe(200);
  const screening = await api('POST', `/rental-applications/${applicationId}/screening`, {
    cookie,
    json: { provider: 'FAKE' },
  });
  expect([200, 201, 202]).toContain(screening.status);
  await poll(
    () =>
      api<{ application: { status: string } }>('GET', `/rental-applications/${applicationId}`, {
        cookie,
      }),
    (res) => res.body.application.status === 'APPROVED',
    'o worker deve aprovar a candidatura com screening FAKE',
  );
  return applicationId;
}

export async function seedApprovedTemplate(cookie: string, name: string): Promise<string> {
  const template = await api<{ template: IdBody }>('POST', '/contract-templates', {
    cookie,
    json: {
      name,
      body: 'LOCADOR {{landlordName}} LOCATÁRIO {{tenantName}} IMÓVEL {{propertyTitle}} ALUGUEL {{monthlyRent}}',
    },
  });
  expect(template.status).toBe(201);
  const templateId = template.body.template.id;
  const approve = await api('PATCH', `/contract-templates/${templateId}/approve`, {
    cookie,
    json: {},
  });
  expect(approve.status).toBeLessThan(300);
  return templateId;
}

export async function seedSignedContract(
  cookie: string,
  applicationId: string,
  templateId: string,
): Promise<string> {
  const contract = await api<{ contract: IdBody }>('POST', '/contracts', {
    cookie,
    json: { applicationId, templateId },
  });
  expect(contract.status).toBe(201);
  const contractId = contract.body.contract.id;
  expect(
    (await api('POST', `/contracts/${contractId}/generate`, { cookie, json: {} })).status,
  ).toBe(200);
  const send = await api<{ envelope: { providerEnvelopeId: string } }>(
    'POST',
    `/contracts/${contractId}/send-for-signature`,
    { cookie, json: {} },
  );
  expect(send.status).toBe(201);
  const envelopeId = send.body.envelope.providerEnvelopeId;
  const id = uniq();
  for (const order of [1, 2]) {
    await api('POST', '/webhooks/signature', {
      json: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: `b2-sig-${String(order)}-${id}`,
        providerEnvelopeId: envelopeId,
        signerOrder: order,
      },
    });
  }
  await api('POST', '/webhooks/signature', {
    json: {
      provider: 'FAKE',
      eventType: 'COMPLETED',
      providerEventId: `b2-complete-${id}`,
      providerEnvelopeId: envelopeId,
    },
  });
  await poll(
    () => api<{ contract: { status: string } }>('GET', `/contracts/${contractId}`, { cookie }),
    (res) => res.body.contract.status === 'SIGNED',
    'a assinatura FAKE deve levar o contrato a SIGNED',
  );
  return contractId;
}

export interface LeaseSeed {
  cookie: string;
  propertyId: string;
  propertyTitle: string;
  tenantId: string;
  tenantName: string;
  landlordId: string;
  landlordName: string;
  applicationId: string;
  templateId: string;
  contractId: string;
  leaseId: string;
}

/** Locação ativa com inquilino e proprietário, a partir de uma organização nova. */
export async function seedLease(label: string): Promise<LeaseSeed> {
  const { cookie } = await registerViaApi(label);
  const id = uniq();
  const propertyTitle = `Imóvel B2 ${label} ${id}`;
  const tenantName = `Inquilina B2 ${label} ${id}`;
  const landlordName = `Proprietário B2 ${label} ${id}`;
  const propertyId = await seedReadyProperty(cookie, propertyTitle);
  const landlordId = await seedParty(cookie, landlordName, VALID_CPFS[1]);
  const owner = await api('POST', `/properties/${propertyId}/owners`, {
    cookie,
    json: { partyId: landlordId },
  });
  expect(owner.status).toBeLessThan(300);
  const tenantId = await seedParty(cookie, tenantName, VALID_CPFS[0]);
  const applicationId = await seedApprovedApplication(cookie, propertyId, tenantId);
  const templateId = await seedApprovedTemplate(cookie, `Template B2 ${label} ${id}`);
  const contractId = await seedSignedContract(cookie, applicationId, templateId);
  const lease = await api<{ lease: IdBody }>('POST', '/leases', { cookie, json: { contractId } });
  expect(lease.status).toBe(201);
  return {
    cookie,
    propertyId,
    propertyTitle,
    tenantId,
    tenantName,
    landlordId,
    landlordName,
    applicationId,
    templateId,
    contractId,
    leaseId: lease.body.lease.id,
  };
}

/** Escolhe a opção de um combobox assíncrono digitando parte do texto. */
export async function pickComboboxOption(
  scope: Page | ReturnType<Page['getByRole']>,
  label: string,
  search: string,
  option: string,
): Promise<void> {
  const field = scope.getByLabel(label, { exact: true });
  await field.fill(search);
  await scope.getByRole('option', { name: option }).first().click();
}
