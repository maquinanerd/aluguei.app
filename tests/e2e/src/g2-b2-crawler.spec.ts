import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { API, api, WEB } from './g2-b1-support';
import { seedLease } from './g2-b2-support';
import type { LeaseSeed } from './g2-b2-support';

/**
 * Critério do G2 (auditoria 2026-09-10, Fase 4): crawler de todas as telas sem resposta
 * 4xx inesperada nem erro de página. Versão permanente do `evidence/scripts/crawl.mjs`
 * da auditoria: sessão do dono da imobiliária, sessões dos portais do inquilino e do
 * proprietário e visitante anônimo, com dados semeados pela API (providers FAKE).
 */

interface Visit {
  route: string;
  /** Status HTTP esperado da navegação (padrão: 200). */
  status?: number;
  /** URL final esperada quando a rota redireciona. */
  finalPath?: string;
}

interface CrawlSeed extends LeaseSeed {
  leadId: string;
  inspectionId: string;
  tenantPortalCookie: string;
  landlordPortalCookie: string;
}

async function portalCookie(cookie: string, partyId: string, kind: 'TENANT' | 'LANDLORD') {
  const access = await api<{ oneTimeToken: string }>('POST', '/portal/access', {
    cookie,
    json: { partyId, kind },
  });
  expect(access.status).toBe(201);
  const res = await fetch(`${API}/portal/auth/consume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: access.body.oneTimeToken }),
  });
  expect(res.status, `sessão do portal (${kind})`).toBe(200);
  const value = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .find((c) => c.startsWith('aluguei_portal='));
  return (value ?? '').slice('aluguei_portal='.length);
}

async function crawl(context: BrowserContext, visits: Visit[], who: string): Promise<string[]> {
  const problems: string[] = [];
  for (const visit of visits) {
    const page: Page = await context.newPage();
    const where = `${who} ${visit.route}`;
    page.on('pageerror', (err) => {
      problems.push(`${where}: pageerror ${err.message.slice(0, 160)}`);
    });
    page.on('response', (res) => {
      const url = res.url();
      if (res.status() >= 400 && url.includes('/api/')) {
        problems.push(
          `${where}: ${String(res.status())} ${res.request().method()} ${url.replace(WEB, '')}`,
        );
      }
    });
    const response = await page.goto(visit.route, { waitUntil: 'networkidle', timeout: 240_000 });
    const status = response?.status() ?? 0;
    const expected = visit.status ?? 200;
    if (status !== expected) {
      problems.push(`${where}: navegação ${String(status)} (esperado ${String(expected)})`);
    }
    if (visit.finalPath !== undefined && new URL(page.url()).pathname !== visit.finalPath) {
      problems.push(
        `${where}: terminou em ${new URL(page.url()).pathname} (esperado ${visit.finalPath})`,
      );
    }
    const text = await page.locator('body').innerText();
    for (const marker of [
      'Application error',
      'Unhandled Runtime Error',
      'Internal Server Error',
    ]) {
      if (text.includes(marker)) {
        problems.push(`${where}: "${marker}" na página`);
      }
    }
    await page.close();
  }
  return problems;
}

test.describe('Crawler: todas as telas sem 4xx inesperado nem erro de página', () => {
  let seed: CrawlSeed;

  test.beforeAll(async () => {
    test.setTimeout(400_000);
    const lease = await seedLease('crawler');
    const lead = await api<{ lead: { id: string } }>('POST', '/leads', {
      cookie: lease.cookie,
      json: { partyId: lease.tenantId, source: 'PORTAL' },
    });
    expect(lead.status).toBe(201);
    const inspection = await api<{ inspection: { id: string } }>('POST', '/inspections', {
      cookie: lease.cookie,
      json: { propertyId: lease.propertyId, type: 'CHECKIN' },
    });
    expect(inspection.status).toBe(201);
    seed = {
      ...lease,
      leadId: lead.body.lead.id,
      inspectionId: inspection.body.inspection.id,
      tenantPortalCookie: await portalCookie(lease.cookie, lease.tenantId, 'TENANT'),
      landlordPortalCookie: await portalCookie(lease.cookie, lease.landlordId, 'LANDLORD'),
    };
  });

  test('painel, portais e visitante', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const problems: string[] = [];

    const owner = await browser.newContext();
    await owner.addCookies([
      {
        name: 'aluguei_session',
        value: seed.cookie.slice('aluguei_session='.length),
        url: WEB,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const panel: Visit[] = [
      '/app',
      '/app/admin/integrations',
      '/app/admin/members',
      '/app/channels',
      '/app/charges',
      '/app/contract-templates',
      '/app/contracts',
      `/app/contracts/${seed.contractId}`,
      '/app/crm/calendar',
      '/app/crm/contacts',
      '/app/crm/leads',
      `/app/crm/leads/${seed.leadId}`,
      '/app/crm/pipeline',
      '/app/crm/tasks',
      '/app/finance',
      '/app/inbox',
      '/app/inspections',
      `/app/inspections/${seed.inspectionId}`,
      '/app/leases',
      `/app/leases/${seed.leaseId}`,
      '/app/ledger',
      '/app/listings',
      '/app/marketing',
      '/app/payments',
      '/app/payouts',
      '/app/properties',
      `/app/properties/${seed.propertyId}`,
      '/app/properties/new',
      '/app/proposals',
      '/app/reconciliation',
      '/app/reporting',
      '/app/screening',
      `/app/screening/${seed.applicationId}`,
      '/app/settings',
      '/app/visits',
      '/dashboard',
    ].map((route) => ({ route }));
    panel.push(
      { route: '/situacao-da-conta', finalPath: '/app' },
      // Dono de imobiliária não é admin da plataforma: 404 é a resposta desenhada.
      { route: '/plataforma', status: 404 },
      { route: '/app/rota-inexistente', status: 404 },
    );
    problems.push(...(await crawl(owner, panel, 'painel')));
    await owner.close();

    for (const [kind, value, route] of [
      ['inquilino', seed.tenantPortalCookie, '/inquilino'],
      ['proprietário', seed.landlordPortalCookie, '/proprietario'],
    ] as const) {
      const portal = await browser.newContext();
      await portal.addCookies([
        { name: 'aluguei_portal', value, url: WEB, httpOnly: true, sameSite: 'Lax' },
      ]);
      problems.push(...(await crawl(portal, [{ route }], `portal do ${kind}`)));
      await portal.close();
    }

    const anonymous = await browser.newContext();
    problems.push(
      ...(await crawl(
        anonymous,
        [
          { route: '/' },
          { route: '/login' },
          { route: '/register' },
          { route: '/imoveis' },
          { route: '/app', finalPath: '/login' },
          { route: '/app/properties', finalPath: '/login' },
          { route: '/plataforma', finalPath: '/login' },
          { route: '/inquilino', finalPath: '/' },
          { route: '/proprietario', finalPath: '/' },
        ],
        'anônimo',
      )),
    );
    await anonymous.close();

    expect(problems).toEqual([]);
  });
});
