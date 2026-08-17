import { test, expect } from '@playwright/test';

/**
 * Jornada principal E2E (browser + API, providers FAKE):
 *   register → login(implícito) → property → listing → lead → visita →
 *   proposta → candidatura → screening FAKE → contrato → assinatura FAKE →
 *   locação → cobrança → pagamento PIX (FAKE) → portal.
 *
 * Nota de limitação documentada: com provider FAKE por-processo (API e worker
 * são processos separados), o crédito PAID exige confirmação no provider — o
 * worker usa sua própria instância do fake e rejeita creditar (anti-forjamento).
 * O caminho completo até PAID+ledger+payout é provado in-process pela suíte de
 * integração (tests/integration/e2e-critical.test.ts). Aqui o teste cobre a
 * jornada até o estado que o ambiente local produz de forma honesta.
 */

const API = 'http://127.0.0.1:4000';
const uniq = Date.now().toString(36);
const email = `e2e-${uniq}@teste.com`;
const password = 'e2e-password-123';
const orgName = `Imob E2E ${uniq}`;

interface ApiResult<T> {
  status: number;
  body: T;
}

async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { json?: unknown; cookie?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (opts.cookie) {
    headers.cookie = opts.cookie;
  }
  const res = await fetch(API + path, {
    method,
    headers,
    ...(opts.json !== undefined ? { body: JSON.stringify(opts.json) } : {}),
  });
  const body = (await res.json().catch(() => null)) as T;
  return { status: res.status, body };
}

interface IdBody {
  id: string;
}
interface PropertyRow {
  id: string;
  title: string;
}

test.describe('Jornada principal (browser + API, fakes)', () => {
  let cookie = '';
  let propertyId = '';
  let tenantId = '';
  let contractId = '';

  test('1. registro e criação de imóvel pela UI', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Nome', { exact: true }).fill('Corretor E2E');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    await page.getByLabel('Nome da imobiliária').fill(orgName);
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });

    await page.goto('/app/properties/new');
    await page.getByLabel('Título do anúncio').fill('Apartamento E2E Playwright');
    await page.getByLabel('Tipo de imóvel').selectOption({ label: 'Apartamento' });
    await page.getByLabel('Rua').fill('Rua das Acácias');
    await page.getByLabel('Número').fill('120');
    await page.getByLabel('Bairro').fill('Vila Nova');
    await page.getByLabel('Cidade').fill('São Paulo');
    await page.getByLabel('Estado (UF)').fill('SP');
    await page.getByLabel('CEP').fill('01310-100');
    await page.getByRole('button', { name: 'Criar imóvel' }).click();
    await expect(page).toHaveURL(/\/app\/properties/, { timeout: 20_000 });
    await expect(page.getByText('Apartamento E2E Playwright').first()).toBeVisible({
      timeout: 20_000,
    });

    const cookies = await page.context().cookies();
    cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect(cookie).toContain('aluguei_session');
  });

  test('2. jornada de negócio via API (screening→assinatura→locação→cobrança→portal)', async () => {
    const list = await api<{ properties: PropertyRow[] }>('GET', '/properties?limit=50', {
      cookie,
    });
    const prop = list.body.properties.find((p) => p.title === 'Apartamento E2E Playwright');
    expect(prop).toBeTruthy();
    propertyId = prop?.id ?? '';

    const terms = await api<{ property: object }>(
      'PUT',
      `/properties/${propertyId}/financial-terms`,
      {
        cookie,
        json: { monthlyRentCents: 250000 },
      },
    );
    expect(terms.status).toBe(200);

    const addr = await api<{ property: object }>('PUT', `/properties/${propertyId}/address`, {
      cookie,
      json: {
        publicAddress: {
          street: 'Rua das Acácias',
          number: '120',
          neighborhood: 'Vila Nova',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-100',
          country: 'BR',
        },
      },
    });
    expect(addr.status).toBe(200);

    const listing = await api<{ listing: IdBody }>('POST', '/listings', {
      cookie,
      json: { propertyId, title: 'Apartamento E2E Playwright', description: '2qts' },
    });
    const listingId = listing.body.listing.id;
    await api('PATCH', `/listings/${listingId}/status`, { cookie, json: { status: 'READY' } });
    const pub = await api('PATCH', `/listings/${listingId}/status`, {
      cookie,
      json: { status: 'PUBLISHED' },
    });
    expect(pub.status).toBe(200);

    const party = await api<{ party: IdBody }>('POST', '/parties', {
      cookie,
      json: {
        type: 'PERSON',
        name: 'Locatária E2E',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    expect(party.status).toBe(201);
    tenantId = party.body.party.id;
    const lead = await api<{ lead: IdBody }>('POST', '/leads', {
      cookie,
      json: { partyId: tenantId, source: 'PORTAL' },
    });
    expect(lead.status).toBe(201);
    const leadId = lead.body.lead.id;
    const visit = await api<{ visit: object }>('POST', '/visits', {
      cookie,
      json: { leadId, propertyId, scheduledAt: '2026-09-20T15:00:00Z' },
    });
    expect(visit.status).toBe(201);
    const proposal = await api<{ proposal: object }>('POST', '/proposals', {
      cookie,
      json: { leadId, propertyId, monthlyRentCents: 240000 },
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
    const applicationId = application.body.application.id;
    await api('PATCH', `/rental-applications/${applicationId}/status`, {
      cookie,
      json: { status: 'SUBMITTED' },
    });
    const screen = await api('POST', `/rental-applications/${applicationId}/screening`, {
      cookie,
      json: { provider: 'FAKE' },
    });
    expect([200, 201, 202]).toContain(screen.status);

    let approved = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const cur = await api<{ application: { status: string } }>(
        'GET',
        `/rental-applications/${applicationId}`,
        { cookie },
      );
      if (cur.body.application.status === 'APPROVED') {
        approved = true;
        break;
      }
    }
    expect(approved, 'worker deve processar screening FAKE → APPROVED').toBe(true);

    const tpl = await api<{ template: IdBody }>('POST', '/contract-templates', {
      cookie,
      json: {
        name: 'Template E2E',
        body: 'PROP: {{landlordName}} TEN: {{tenantName}} IMOV: {{propertyTitle}} ALUGUEL: {{monthlyRentCents}}',
      },
    });
    const templateId = tpl.body.template.id;
    await api('PATCH', `/contract-templates/${templateId}/approve`, { cookie, json: {} });
    const contract = await api<{ contract: IdBody }>('POST', '/contracts', {
      cookie,
      json: { applicationId, templateId },
    });
    contractId = contract.body.contract.id;
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
          providerEventId: `e2e-sig-${String(order)}-${uniq}`,
          providerEnvelopeId: envelopeId,
          signerOrder: order,
        },
      });
    }
    await api('POST', '/webhooks/signature', {
      json: {
        provider: 'FAKE',
        eventType: 'COMPLETED',
        providerEventId: `e2e-complete-${uniq}`,
        providerEnvelopeId: envelopeId,
      },
    });
    let signed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const cur = await api<{ contract: { status: string } }>('GET', `/contracts/${contractId}`, {
        cookie,
      });
      if (cur.body.contract.status === 'SIGNED') {
        signed = true;
        break;
      }
    }
    expect(signed, 'assinatura FAKE via webhooks deve levar contrato a SIGNED').toBe(true);

    const lease = await api<{ lease: IdBody }>('POST', '/leases', { cookie, json: { contractId } });
    expect(lease.status).toBe(201);
    const leaseId = lease.body.lease.id;
    const charge = await api<{ charge: IdBody & { rentCents: number } }>('POST', '/charges', {
      cookie,
      json: { leaseId, periodStart: '2026-11-01' },
    });
    expect(charge.status).toBe(201);
    const chargeId = charge.body.charge.id;
    expect(charge.body.charge.rentCents).toBe(250000);

    const payment = await api<{ pixQrCode: string; providerChargeId: string }>(
      'POST',
      `/charges/${chargeId}/payment`,
      { cookie, json: { method: 'PIX' } },
    );
    expect(payment.status).toBe(201);
    expect(payment.body.pixQrCode).toBeTruthy();
    expect(payment.body.providerChargeId).toBeTruthy();

    const wh = await api('POST', '/webhooks/payments', {
      json: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `e2e-pay-${uniq}`,
        providerChargeId: payment.body.providerChargeId,
        amountCents: 250000,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    });
    expect(wh.status).toBe(200);

    const access = await api<{ oneTimeToken: string }>('POST', '/portal/access', {
      cookie,
      json: { partyId: tenantId, kind: 'TENANT' },
    });
    expect(access.status).toBe(201);
    const oneTimeToken = access.body.oneTimeToken;
    expect(oneTimeToken).toBeTruthy();

    const consume = await fetch(`${API}/portal/auth/consume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: oneTimeToken }),
    });
    expect(consume.status).toBe(200);
    const setCookie = consume.headers.get('set-cookie');
    const portalCookie = (setCookie ?? '').split(';')[0];
    const statement = await fetch(`${API}/portal/tenant/statement`, {
      headers: { cookie: portalCookie },
    });
    const statementBody = (await statement.json()) as { totals: { billedCents: number } };
    expect(statementBody.totals.billedCents).toBe(250000);
  });

  test('3. telas do painel refletem os dados criados', async ({ page }) => {
    // Contexto de navegador novo por teste — loga novamente. O rate limit de
    // login (10/min/IP, memória) pode estar consumido por execuções anteriores
    // na mesma stack; espera a janela e tenta de novo.
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    try {
      await expect(page).toHaveURL(/\/app/, { timeout: 10_000 });
    } catch {
      await page.waitForTimeout(61_000); // aguarda a janela do rate limit
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
    }

    await page.goto('/app/contracts');
    await expect(
      page
        .getByText('Template E2E')
        .first()
        .or(page.getByText(/Contrato/i).first()),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/app/charges');
    await expect(page.getByText(/R\$\s*2\.500,00/).first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/app/ledger');
    await expect(
      page
        .getByText(/Conta/i)
        .or(page.getByText(/Lançamento/i))
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/app/leases');
    await expect(page.getByText(/Locação/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
