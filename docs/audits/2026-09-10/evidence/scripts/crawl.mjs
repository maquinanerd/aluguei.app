// Audit 2026-09-10 — crawl every web route (prod build on :3210) with a real session.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT =
  'C:/Users/pablo/Documents/OpenCode/Aluguei-app/.claude/worktrees/aluguei-technical-audit-6cea11';
const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const require = createRequire(`${ROOT}/tests/e2e/package.json`);
const { chromium } = require('@playwright/test');

const WEB = process.env.CRAWL_WEB ?? 'http://localhost:3417';
const API = 'http://127.0.0.1:4100';
const S = JSON.parse(readFileSync(`${SP}/probe_state.json`, 'utf8'));

async function apiLogin(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'audit-pass-123' }),
  });
  const sc = res.headers.getSetCookie();
  const tok = sc.map((c) => c.split(';')[0]).find((c) => c.startsWith('aluguei_session='));
  return { status: res.status, value: tok ? tok.split('=')[1] : null };
}

const routes = [
  '/',
  '/login',
  '/register',
  '/imoveis',
  `/imoveis/${S.listingSlug}`,
  `/imoveis/${S.listingSlug}?org=${S.A.orgSlug}`,
  '/inquilino',
  '/proprietario',
  '/dev/calibration',
  '/dashboard',
  '/app',
  '/app/admin/integrations',
  '/app/admin/members',
  '/app/channels',
  '/app/charges',
  '/app/contract-templates',
  '/app/contracts',
  `/app/contracts/${S.contract}`,
  '/app/crm/calendar',
  '/app/crm/contacts',
  '/app/crm/leads',
  `/app/crm/leads/${S.lead}`,
  '/app/crm/pipeline',
  '/app/crm/tasks',
  '/app/finance',
  '/app/inbox',
  '/app/inspections',
  `/app/inspections/${S.insp}`,
  '/app/leases',
  `/app/leases/${S.lease}`,
  '/app/ledger',
  '/app/listings',
  '/app/marketing',
  '/app/payments',
  '/app/payouts',
  '/app/properties',
  `/app/properties/${S.propA}`,
  '/app/properties/new',
  '/app/proposals',
  '/app/reconciliation',
  '/app/reporting',
  '/app/screening',
  `/app/screening/${S.app}`,
  '/app/settings',
  '/app/visits',
  '/app/rota-inexistente',
];

const markers = [
  'Application error',
  'Something went wrong',
  'Unhandled Runtime Error',
  'Internal Server Error',
  'This page could not be found',
  '404',
  'Erro',
  'erro',
  'Não foi possível',
  'Nenhum',
  'Nenhuma',
  'em breve',
  'Em breve',
  'mock',
  'Mock',
  'fictício',
  'sandbox',
  'Sandbox',
  'demo',
  'Demo',
  'Lorem',
];

const results = [];
const login = await apiLogin(S.A.email);
console.log('api login', login.status, Boolean(login.value));
const browser = await chromium.launch({ headless: true });
for (const auth of [true, false]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  if (auth && login.value) {
    await ctx.addCookies([
      {
        name: 'aluguei_session',
        value: login.value,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  }
  const list = auth
    ? routes
    : [
        '/app',
        '/app/properties',
        '/app/charges',
        '/dev/calibration',
        '/inquilino',
        '/proprietario',
      ];
  for (const r of list) {
    const page = await ctx.newPage();
    const errors = [];
    const consoleErrors = [];
    const failed = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    page.on('response', (resp) => {
      const u = resp.url();
      if (resp.status() >= 400 && (u.includes('/api/') || u.startsWith(WEB)))
        failed.push(
          `${resp.status()} ${resp.request().method()} ${u.replace(WEB, '')}`.slice(0, 200),
        );
    });
    let status = null;
    let finalUrl = null;
    try {
      const resp = await page.goto(WEB + r, { waitUntil: 'networkidle', timeout: 120000 });
      status = resp ? resp.status() : null;
      finalUrl = page.url().replace(WEB, '');
      await page.waitForTimeout(800);
    } catch (e) {
      errors.push(`NAV: ${String(e.message).slice(0, 150)}`);
    }
    const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    const found = markers.filter((m) => text.includes(m));
    const title = await page.title().catch(() => '');
    results.push({
      auth,
      route: r,
      status,
      finalUrl,
      title,
      textLen: text.length,
      pageErrors: errors,
      consoleErrors: consoleErrors.slice(0, 5),
      failedRequests: failed.slice(0, 8),
      markers: found,
      snippet: text.replace(/\s+/g, ' ').slice(0, 260),
    });
    console.log(
      `${auth ? 'AUTH' : 'ANON'} ${r} -> ${status} ${finalUrl} pe=${errors.length} ce=${consoleErrors.length} fail=${failed.length} markers=${found.join('|')}`,
    );
    await page.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${SP}/crawl_results.json`, JSON.stringify(results, null, 2));
console.log('DONE');
