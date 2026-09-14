// Audit 2026-09-10 — responsive crawl (375x812) of authenticated web routes; detects horizontal overflow.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT =
  'C:/Users/pablo/Documents/OpenCode/Aluguei-app/.claude/worktrees/aluguei-technical-audit-6cea11';
const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const require = createRequire(`${ROOT}/tests/e2e/package.json`);
const { chromium, devices } = require('@playwright/test');
const WEB = 'http://localhost:3417';
const API = 'http://127.0.0.1:4100';
const S = JSON.parse(readFileSync(`${SP}/probe_state.json`, 'utf8'));

const res = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: S.A.email, password: 'audit-pass-123' }),
});
const tok = res.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .find((c) => c.startsWith('aluguei_session='));
const routes = [
  '/',
  '/login',
  '/imoveis',
  `/imoveis/${S.listingSlug}`,
  '/app',
  '/app/crm/leads',
  '/app/crm/contacts',
  '/app/crm/pipeline',
  '/app/crm/tasks',
  '/app/crm/calendar',
  '/app/properties',
  `/app/properties/${S.propA}`,
  '/app/properties/new',
  '/app/listings',
  '/app/channels',
  '/app/inbox',
  '/app/visits',
  '/app/proposals',
  '/app/screening',
  '/app/contracts',
  `/app/contracts/${S.contract}`,
  '/app/inspections',
  '/app/leases',
  `/app/leases/${S.lease}`,
  '/app/finance',
  '/app/charges',
  '/app/payments',
  '/app/payouts',
  '/app/reconciliation',
  '/app/ledger',
  '/app/marketing',
  '/app/reporting',
  '/app/admin/members',
  '/app/admin/integrations',
  '/app/settings',
];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  viewport: { width: 375, height: 812 },
});
await ctx.addCookies([
  {
    name: 'aluguei_session',
    value: tok.split('=')[1],
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  },
]);
const out = [];
for (const r of routes) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  let status = null;
  try {
    const resp = await page.goto(WEB + r, { waitUntil: 'networkidle', timeout: 120000 });
    status = resp ? resp.status() : null;
    await page.waitForTimeout(600);
  } catch (e) {
    errors.push(`NAV ${String(e.message).slice(0, 100)}`);
  }
  const m = await page
    .evaluate(() => {
      const de = document.documentElement;
      const over = de.scrollWidth - window.innerWidth;
      const offenders = [];
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 2 && rect.width > 40) {
          offenders.push(
            `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`,
          );
          if (offenders.length >= 3) break;
        }
      }
      const nav = !!document.querySelector('nav, [role="navigation"]');
      return { overflowPx: over, offenders, hasNav: nav };
    })
    .catch(() => ({ overflowPx: null, offenders: [], hasNav: null }));
  out.push({ route: r, status, final: page.url().replace(WEB, ''), ...m, pageErrors: errors });
  console.log(
    `${r} -> ${status} overflow=${m.overflowPx}px ${m.offenders.join(',')} pe=${errors.length}`,
  );
  await page.close();
}
await browser.close();
writeFileSync(`${SP}/crawl_mobile_results.json`, JSON.stringify(out, null, 2));
console.log('DONE');
