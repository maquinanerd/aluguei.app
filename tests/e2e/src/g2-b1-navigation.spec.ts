import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { api, DAY_MS, poll, registerViaApi, useSession, watchPage } from './g2-b1-support';

/**
 * P1-01 (auditoria 2026-09-10): 37 chamadas com `limit=200` (a API aceita até
 * 100) devolviam 400 em silêncio — dashboard zerado, selects vazios, nomes
 * "—". Os dados são semeados pela API (providers FAKE) e cada tela afetada é
 * aberta com a sessão do dono.
 */

interface IdBody {
  id: string;
}

interface Seed {
  cookie: string;
  propertyId: string;
  leadId: string;
  applicationId: string;
  contractId: string;
  leaseId: string;
  inspectionId: string;
}

const PROPERTY_TITLE = 'Imóvel Navegação B1';
const TENANT_NAME = 'Locatária Navegação B1';

async function seedJourney(): Promise<Seed> {
  const { cookie } = await registerViaApi('nav');
  const uniq = Date.now().toString(36);

  const property = await api<{ property: IdBody }>('POST', '/properties', {
    cookie,
    json: { title: PROPERTY_TITLE, propertyType: 'APARTMENT' },
  });
  expect(property.status).toBe(201);
  const propertyId = property.body.property.id;
  const terms = await api('PUT', `/properties/${propertyId}/financial-terms`, {
    cookie,
    json: { monthlyRentCents: 250_000 },
  });
  expect(terms.status).toBe(200);
  const address = await api('PUT', `/properties/${propertyId}/address`, {
    cookie,
    json: {
      publicAddress: {
        street: 'Rua das Palmeiras',
        number: '45',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000',
        country: 'BR',
      },
    },
  });
  expect(address.status).toBe(200);

  const owner = await api<{ party: IdBody }>('POST', '/parties', {
    cookie,
    json: {
      type: 'PERSON',
      name: 'Proprietário Navegação B1',
      identities: [{ kind: 'CPF', value: '11144477735' }],
    },
  });
  expect(owner.status).toBe(201);
  const ownerLink = await api('POST', `/properties/${propertyId}/owners`, {
    cookie,
    json: { partyId: owner.body.party.id },
  });
  expect(ownerLink.status).toBeLessThan(300);

  const listing = await api<{ listing: IdBody }>('POST', '/listings', {
    cookie,
    json: { propertyId, title: PROPERTY_TITLE, description: 'Anúncio de navegação' },
  });
  expect(listing.status).toBe(201);

  const tenant = await api<{ party: IdBody }>('POST', '/parties', {
    cookie,
    json: {
      type: 'PERSON',
      name: TENANT_NAME,
      identities: [{ kind: 'CPF', value: '52998224725' }],
    },
  });
  expect(tenant.status).toBe(201);
  const tenantId = tenant.body.party.id;

  const lead = await api<{ lead: IdBody }>('POST', '/leads', {
    cookie,
    json: { partyId: tenantId, source: 'PORTAL' },
  });
  expect(lead.status).toBe(201);
  const leadId = lead.body.lead.id;

  const visit = await api('POST', '/visits', {
    cookie,
    json: {
      leadId,
      partyId: tenantId,
      propertyId,
      scheduledAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    },
  });
  expect(visit.status).toBe(201);
  const proposal = await api('POST', '/proposals', {
    cookie,
    json: { leadId, partyId: tenantId, propertyId, monthlyRentCents: 240_000 },
  });
  expect(proposal.status).toBe(201);

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
  await api('PATCH', `/rental-applications/${applicationId}/status`, {
    cookie,
    json: { status: 'SUBMITTED' },
  });
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
    'worker deve aprovar a candidatura com screening FAKE',
  );

  const template = await api<{ template: IdBody }>('POST', '/contract-templates', {
    cookie,
    json: {
      name: `Template Navegação ${uniq}`,
      body: 'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}',
    },
  });
  expect(template.status).toBe(201);
  const templateId = template.body.template.id;
  await api('PATCH', `/contract-templates/${templateId}/approve`, { cookie, json: {} });
  const contract = await api<{ contract: IdBody }>('POST', '/contracts', {
    cookie,
    json: { applicationId, templateId },
  });
  expect(contract.status).toBe(201);
  const contractId = contract.body.contract.id;
  await api('POST', `/contracts/${contractId}/generate`, { cookie, json: {} });
  const send = await api<{ envelope: { providerEnvelopeId: string } }>(
    'POST',
    `/contracts/${contractId}/send-for-signature`,
    { cookie, json: {} },
  );
  expect(send.status).toBe(201);
  const envelopeId = send.body.envelope.providerEnvelopeId;
  for (const order of [1, 2]) {
    await api('POST', '/webhooks/signature', {
      json: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: `b1-nav-sig-${String(order)}-${uniq}`,
        providerEnvelopeId: envelopeId,
        signerOrder: order,
      },
    });
  }
  await api('POST', '/webhooks/signature', {
    json: {
      provider: 'FAKE',
      eventType: 'COMPLETED',
      providerEventId: `b1-nav-complete-${uniq}`,
      providerEnvelopeId: envelopeId,
    },
  });
  await poll(
    () => api<{ contract: { status: string } }>('GET', `/contracts/${contractId}`, { cookie }),
    (res) => res.body.contract.status === 'SIGNED',
    'assinatura FAKE deve levar o contrato a SIGNED',
  );

  const lease = await api<{ lease: IdBody }>('POST', '/leases', { cookie, json: { contractId } });
  expect(lease.status).toBe(201);
  const inspection = await api<{ inspection: IdBody }>('POST', '/inspections', {
    cookie,
    json: { propertyId, type: 'CHECKIN' },
  });
  expect(inspection.status).toBe(201);

  return {
    cookie,
    propertyId,
    leadId,
    applicationId,
    contractId,
    leaseId: lease.body.lease.id,
    inspectionId: inspection.body.inspection.id,
  };
}

function summaryValue(page: Page, card: string, row: string) {
  return page
    .locator('.dash-summary')
    .filter({ has: page.getByRole('heading', { name: card, exact: true }) })
    .locator('.dash-summary__row')
    .filter({ hasText: row })
    .locator('.dash-summary__value');
}

test.describe('P1-01: telas que usavam limit=200', () => {
  let seed: Seed;

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    seed = await seedJourney();
  });

  test('as telas afetadas carregam sem resposta >= 400 do BFF e sem pageerror', async ({
    page,
  }) => {
    test.setTimeout(1_200_000);
    await useSession(page, seed.cookie);
    const watch = watchPage(page);
    const routes = [
      '/app',
      '/app/contracts',
      `/app/contracts/${seed.contractId}`,
      '/app/leases',
      `/app/leases/${seed.leaseId}`,
      '/app/marketing',
      '/app/visits',
      '/app/proposals',
      '/app/screening',
      `/app/screening/${seed.applicationId}`,
      '/app/inbox',
      '/app/crm/pipeline',
      '/app/crm/leads',
      `/app/crm/leads/${seed.leadId}`,
      '/app/listings',
      '/app/inspections',
      `/app/inspections/${seed.inspectionId}`,
      `/app/properties/${seed.propertyId}`,
    ];
    for (const route of routes) {
      watch.route = route;
      await page.goto(route, { waitUntil: 'networkidle', timeout: 240_000 });
      await page.waitForTimeout(1_000);
    }
    expect(watch.backendFailures).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
  });

  test('nomes de pessoa e imóvel aparecem nas listas e detalhes', async ({ page }) => {
    test.setTimeout(600_000);
    await useSession(page, seed.cookie);
    const expectations: Array<[string, string[]]> = [
      ['/app/leases', [PROPERTY_TITLE, TENANT_NAME]],
      ['/app/proposals', [PROPERTY_TITLE, TENANT_NAME]],
      ['/app/visits', [PROPERTY_TITLE, TENANT_NAME]],
      ['/app/screening', [PROPERTY_TITLE, TENANT_NAME]],
      ['/app/contracts', [TENANT_NAME]],
      ['/app/inspections', [PROPERTY_TITLE]],
      ['/app/crm/leads', [TENANT_NAME]],
      [`/app/inspections/${seed.inspectionId}`, [PROPERTY_TITLE]],
      [`/app/leases/${seed.leaseId}`, [TENANT_NAME]],
      [`/app/screening/${seed.applicationId}`, [PROPERTY_TITLE, TENANT_NAME]],
    ];
    for (const [route, texts] of expectations) {
      await page.goto(route, { timeout: 240_000 });
      for (const text of texts) {
        await expect(page.getByText(text).first(), `${route} deve mostrar "${text}"`).toBeVisible({
          timeout: 30_000,
        });
      }
    }
  });

  test('Visão Geral mostra os números reais da organização', async ({ page }) => {
    test.setTimeout(300_000);
    await useSession(page, seed.cookie);
    await page.goto('/app', { timeout: 240_000 });
    await expect(summaryValue(page, 'Imóveis', 'Disponíveis')).toHaveText('1');
    await expect(summaryValue(page, 'Imóveis', 'Reservados')).toHaveText('1');
    await expect(summaryValue(page, 'CRM', 'Aguardando resposta')).toHaveText('1');
    await expect(summaryValue(page, 'Operação', 'Vistorias em aberto')).toHaveText('1');
    await expect(summaryValue(page, 'Operação', 'Locações ativas')).toHaveText('1');
  });

  test('os modais de criação oferecem o imóvel da organização', async ({ page }) => {
    test.setTimeout(600_000);
    await useSession(page, seed.cookie);
    const modals: Array<[route: string, trigger: string]> = [
      ['/app/listings', 'Novo listing'],
      ['/app/proposals', 'Nova proposta'],
      ['/app/inspections', 'Nova vistoria'],
    ];
    for (const [route, trigger] of modals) {
      await page.goto(route, { timeout: 240_000 });
      await page.getByRole('button', { name: trigger }).first().click();
      const dialog = page.getByRole('dialog', { name: trigger });
      const field = dialog.getByLabel('Imóvel', { exact: true });
      await expect(field).toBeVisible();
      // Vale para <select> nativo e para combobox: só o combobox recebe a busca.
      if ((await field.getAttribute('role')) === 'combobox') {
        await field.fill('Navegação');
      }
      await expect(
        dialog.getByRole('option', { name: PROPERTY_TITLE, includeHidden: true }).first(),
        `${route}: o imóvel da organização deve estar entre as opções`,
      ).toBeAttached({ timeout: 30_000 });
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
    }
  });
});
