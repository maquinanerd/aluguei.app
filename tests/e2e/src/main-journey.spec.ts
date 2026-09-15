import { test, expect } from '@playwright/test';

/**
 * Jornada principal E2E (browser + API, providers FAKE):
 *   register → login(implícito) → property → listing → lead → visita →
 *   proposta → candidatura → screening FAKE → contrato → assinatura FAKE →
 *   locação → cobrança → pagamento PIX (FAKE) → portal.
 *
 * API e worker rodam em processos separados e compartilham o estado do provider
 * FAKE pelo banco (tabela fake_provider_charges): o pagador é simulado pela rota
 * de desenvolvimento e a jornada chega a PAID, com repasse e extrato
 * (auditoria 2026-09-10, P1-13).
 */

const API = `http://127.0.0.1:${process.env.API_PORT ?? '4000'}`;
const uniq = Date.now().toString(36);
const email = `e2e-${uniq}@teste.com`;
const password = 'e2e-password-123';
const orgName = `Imob E2E ${uniq}`;

/**
 * O backoffice recalcula multa/juros com o relógio real ao iniciar o pagamento e
 * o vencimento é o período + 10 dias: um mês fixo no calendário vira
 * bomba-relógio. O mês seguinte nunca está vencido.
 */
function nextMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

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

    // Proprietário do imóvel: sem dono não há regra de split nem repasse.
    const owner = await api<{ party: IdBody }>('POST', '/parties', {
      cookie,
      json: {
        type: 'PERSON',
        name: 'Proprietário E2E',
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
    const submitted = await api('PATCH', `/rental-applications/${applicationId}/status`, {
      cookie,
      json: { status: 'SUBMITTED' },
    });
    expect(submitted.status).toBe(200);
    // P1-06: a análise de crédito só começa pelo pedido de screening.
    const skipScreening = await api('PATCH', `/rental-applications/${applicationId}/status`, {
      cookie,
      json: { status: 'SCREENING' },
    });
    expect(skipScreening.status, 'PATCH não pode pular o screening').toBe(409);
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
    expect(contract.status).toBe(201);
    contractId = contract.body.contract.id;
    // P1-06: o contrato criado leva a candidatura a CONTRACTING.
    const contracting = await api<{ application: { status: string } }>(
      'GET',
      `/rental-applications/${applicationId}`,
      { cookie },
    );
    expect(contracting.body.application.status).toBe('CONTRACTING');

    const generated = await api<{
      contract: { contract: { content: string; currentVersion: number } };
    }>('POST', `/contracts/${contractId}/generate`, { cookie, json: {} });
    expect(generated.status).toBe(200);
    // P2-08: aluguel em R$ no corpo do contrato (antes "ALUGUEL: 250000").
    expect(generated.body.contract.contract.content).toContain('ALUGUEL: R$ 2.500,00');
    expect(generated.body.contract.contract.currentVersion).toBe(1);

    const send = await api<{
      envelope: {
        providerEnvelopeId: string;
        provider: string;
        contractVersion: number;
        documentHash: string;
      };
    }>('POST', `/contracts/${contractId}/send-for-signature`, { cookie, json: {} });
    expect(send.status).toBe(201);
    // P1-11: envelope com o provider configurado e o hash do PDF enviado.
    expect(send.body.envelope).toMatchObject({ provider: 'FAKE', contractVersion: 1 });
    expect(send.body.envelope.documentHash).toMatch(/^[a-f0-9]{64}$/);
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

    // P0-04: contrato assinado não é regenerado — nem com pedido explícito — e o
    // texto assinado continua sendo a única versão.
    const signedContract = await api<{ contract: object }>('GET', `/contracts/${contractId}`, {
      cookie,
    });
    for (const json of [{}, { regenerate: true }]) {
      const regenerate = await api('POST', `/contracts/${contractId}/generate`, { cookie, json });
      expect(regenerate.status, `regenerar SIGNED com ${JSON.stringify(json)}`).toBe(409);
    }
    const afterRegenerate = await api<{ contract: object }>('GET', `/contracts/${contractId}`, {
      cookie,
    });
    expect(afterRegenerate.body.contract).toEqual(signedContract.body.contract);
    const versions = await api<{ versions: Array<{ version: number }> }>(
      'GET',
      `/contracts/${contractId}/versions`,
      { cookie },
    );
    expect(versions.body.versions.map((v) => v.version)).toEqual([1]);

    const lease = await api<{ lease: IdBody }>('POST', '/leases', { cookie, json: { contractId } });
    expect(lease.status).toBe(201);
    const leaseId = lease.body.lease.id;
    const charge = await api<{ charge: IdBody & { rentCents: number } }>('POST', '/charges', {
      cookie,
      json: { leaseId, periodStart: nextMonthStart() },
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

    // O pagador quita a cobrança NO PROVIDER (simulação do FAKE); o webhook só
    // notifica — quem credita é o worker, que roda em outro processo.
    const confirm = await api(
      'POST',
      `/dev/fake-payments/${encodeURIComponent(payment.body.providerChargeId)}/confirm`,
      { cookie, json: {} },
    );
    expect(confirm.status).toBe(200);

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

    let paid = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = await api<{ charge: { status: string } }>('GET', `/charges/${chargeId}`, {
        cookie,
      });
      if (current.body.charge.status === 'PAID') {
        paid = true;
        break;
      }
    }
    expect(paid, 'worker em processo separado deve liquidar a cobrança (PAID)').toBe(true);

    const payouts = await api<{ payouts: Array<{ amountCents: number; status: string }> }>(
      'GET',
      '/payouts',
      { cookie },
    );
    expect(payouts.body.payouts.length, 'liquidação deve gerar repasse ao proprietário').toBe(1);
    expect(payouts.body.payouts[0]?.amountCents).toBe(225000);

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
    const statementBody = (await statement.json()) as {
      totals: { billedCents: number; paidCents: number };
    };
    expect(statementBody.totals.billedCents).toBe(250000);
    expect(statementBody.totals.paidCents).toBe(250000);
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
