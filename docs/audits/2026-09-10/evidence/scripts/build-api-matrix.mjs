// Builds 05_API_CONNECTION_MATRIX table rows from: routes.tsv (mechanical extraction),
// agent B endpoint table (auth/perm/tables/domain/audit/org-scope), agent C web calls,
// agent F mobile calls, integration/e2e test usage (grep), and api.log observed statuses.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const ROOT =
  'C:/Users/pablo/Documents/OpenCode/Aluguei-app/.claude/worktrees/aluguei-technical-audit-6cea11';

const routes = readFileSync(`${SP}/routes.tsv`, 'utf8')
  .trim()
  .split('\n')
  .map((l) => {
    const [method, path, file, perm] = l.split('\t');
    return { method, path, file, perm: perm.replace('perm=', '') };
  });
const key = (m, p) => `${m} ${p.replace(/\{[^}]+\}/g, ':x').replace(/:[A-Za-z]+/g, ':x')}`;
const toRegex = (p) => new RegExp(`^${p.replace(/:[A-Za-z]+/g, '[^/]+')}$`);

// agent B table
const bRows = {};
for (const f of ['agent_B_part5.md', 'agent_B_part6.md']) {
  for (const line of readFileSync(`${SP}/${f}`, 'utf8').split('\n')) {
    const m = line.match(
      /^\|\s*(\d+)\s*\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/,
    );
    if (m) {
      bRows[key(m[2], m[3])] = {
        auth: m[5],
        perm: m[6],
        tables: m[8],
        domain: m[9],
        audit: m[10],
        scope: m[11],
        obs: m[12],
      };
    }
  }
}

// agent C web calls (section 10 until **Total:**)
const cText = readFileSync(`${SP}/agent_C_web.md`, 'utf8');
const sec = cText.slice(cText.indexOf('## 10. (c)'), cText.indexOf('**Total:**'));
const web = {};
for (const line of sec.split('\n')) {
  const mm = line.match(
    /^- ((?:GET|POST|PUT|PATCH|DELETE)(?:\/(?:GET|POST|PUT|PATCH|DELETE))*|POST e GET|GET e POST) (.*)$/,
  );
  if (!mm) continue;
  const methods = mm[1].includes(' e ') ? mm[1].split(' e ') : mm[1].split('/');
  const paths = [...mm[2].matchAll(/`([^`]+)`/g)].map((x) => x[1].split('?')[0]);
  const broken = line.includes('✗');
  let base = null;
  for (const p of paths) {
    let full = p;
    if (!p.startsWith('/auth') && base && p.split('/').length === 2)
      full = base.replace(/\/[^/]+$/, '') + p;
    if (p.split('/').length > 2) base = p;
    for (const meth of methods) {
      const k = key(meth, full);
      web[k] = web[k] === 'sim' ? 'sim' : broken ? 'sim (✗)' : 'sim';
    }
  }
}

// mobile
const mobile = new Set(
  [
    'POST /auth/login',
    'GET /auth/me',
    'GET /visits',
    'GET /properties/:id',
    'POST /inspections',
    'GET /inspections/:id',
    'POST /inspections/:id/rooms',
    'POST /inspections/:id/observations',
    'PATCH /inspections/:id/status',
    'POST /inspections/:id/process',
    'GET /inspections/:id/review',
  ].map((s) => key(s.split(' ')[0], s.split(' ')[1])),
);

// worker relation (endpoint enqueues work consumed by apps/worker)
const workerRel = {
  'POST /webhooks/whatsapp': 'inbox WHATSAPP',
  'POST /webhooks/signature': 'inbox SIGNATURE',
  'POST /webhooks/payments': 'inbox PAYMENT',
  'POST /webhooks/meta': 'inbox META',
  'POST /rental-applications/:id/screening': 'inbox SCREENING',
  'POST /inspections/:id/process': 'inbox INSPECTION',
  'POST /reconciliations': 'inbox PAYMENT_RECONCILE',
  'POST /listings/:id/channels/:c/publish': 'channel job',
  'POST /listings/:id/channels/:c/update': 'channel job',
  'POST /listings/:id/channels/:c/remove': 'channel job',
  'POST /channels/:c/reconcile': 'channel job',
  'POST /channels/:c/import-leads': 'channel job',
  'POST /meta/campaigns/:id/publish': 'meta job',
  'POST /meta/campaigns/:id/pause': 'meta job',
  'POST /meta/campaigns/:id/resume': 'meta job',
  'POST /meta/campaigns/:id/archive': 'meta job',
  'POST /meta/campaigns/:id/budget': 'meta job',
  'POST /meta/campaigns/:id/schedule': 'meta job',
  'POST /meta/campaigns/:id/creative': 'meta job',
  'POST /meta/campaigns/:id/sync-insights': 'meta job',
  'PUT /properties/:id/address': 'channel update job',
  'PUT /properties/:id/financial-terms': 'channel update job',
  'POST /properties/:id/media/confirm': 'channel update job',
  'PATCH /listings/:id': 'channel update job',
};
const worker = {};
for (const [k, v] of Object.entries(workerRel)) worker[key(k.split(' ')[0], k.split(' ')[1])] = v;

// tests usage (integration + e2e + contract): collect literal urls
const testFiles = [];
for (const d of ['tests/integration/src', 'tests/e2e/src', 'tests/contract/src', 'apps/api/src']) {
  for (const f of readdirSync(join(ROOT, d)))
    if (f.endsWith('.ts') && (f.includes('test') || f.includes('spec')))
      testFiles.push(join(ROOT, d, f));
}
const testHits = {};
for (const f of testFiles) {
  const src = readFileSync(f, 'utf8');
  const short = f.replace(/\\/g, '/').split('/').slice(-1)[0];
  for (const m of src.matchAll(
    /method:\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*url:\s*[`']([^`'?]+)/g,
  )) {
    for (const r of routes)
      if (r.method === m[1] && toRegex(r.path).test(m[2].replace(/\$\{[^}]+\}/g, 'X')))
        (testHits[`${r.method} ${r.path}`] ??= new Set()).add(short);
  }
  for (const m of src.matchAll(
    /api(?:<[^>]*>)?\(\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*[`']([^`'?]+)/g,
  )) {
    for (const r of routes)
      if (r.method === m[1] && toRegex(r.path).test(m[2].replace(/\$\{[^}]+\}/g, 'X')))
        (testHits[`${r.method} ${r.path}`] ??= new Set()).add(short);
  }
}

// observed today in api.log
const obs = {};
const reqs = {};
for (const l of readFileSync(`${SP}/api.log`, 'utf8').split('\n')) {
  if (!l.startsWith('{')) continue;
  let j;
  try {
    j = JSON.parse(l);
  } catch {
    continue;
  }
  if (j.req && j.reqId) reqs[j.reqId] = { m: j.req.method, u: j.req.url.split('?')[0] };
  if (j.res && j.reqId && reqs[j.reqId]) {
    const { m, u } = reqs[j.reqId];
    const r = routes.find((x) => x.method === m && toRegex(x.path).test(u));
    if (!r) continue;
    const k = `${r.method} ${r.path}`;
    obs[k] ??= { '2xx': 0, '4xx': 0, '5xx': 0 };
    const c = j.res.statusCode;
    obs[k][c >= 500 ? '5xx' : c >= 400 ? '4xx' : '2xx'] += 1;
  }
}

const esc = (s) => String(s ?? '—').replace(/\|/g, '\\|');
const lines = [];
let withWeb = 0,
  withMobile = 0,
  withTest = 0,
  orphan = 0,
  exercised = 0,
  only4xx = 0,
  any5xx = 0;
for (const r of routes) {
  const k = key(r.method, r.path);
  const b = bRows[k] ?? {};
  const w = web[k] ?? '—';
  const mo = mobile.has(k) ? 'sim' : '—';
  const wk = worker[k] ?? '—';
  const t = testHits[`${r.method} ${r.path}`]
    ? [...testHits[`${r.method} ${r.path}`]].join(', ')
    : '—';
  const o = obs[`${r.method} ${r.path}`];
  const res = o ? `${o['2xx']}×2xx ${o['4xx']}×4xx ${o['5xx']}×5xx` : 'não exercido';
  if (w !== '—') withWeb++;
  if (mo !== '—') withMobile++;
  if (t !== '—') withTest++;
  if (o) exercised++;
  if (o && o['2xx'] === 0 && o['5xx'] === 0) only4xx++;
  if (o && o['5xx'] > 0) any5xx++;
  const isInfra = /^\/(health|webhooks|public)/.test(r.path);
  if (w === '—' && mo === '—' && wk === '—' && !isInfra) orphan++;
  const dom = esc(b.domain ?? '—');
  const db = esc((b.tables ?? '—').slice(0, 90));
  const ep =
    `\`${r.path}\` · ${esc(b.auth ?? '?')} ${b.perm && b.perm !== '—' ? esc(b.perm) : ''}`.trim();
  lines.push(
    `| ${r.method} | ${ep} | ${dom} | ${db} | ${w} | ${mo} | ${wk} | — | ${esc(t)} | ${res} |`,
  );
}
const header =
  '| Método | Endpoint · auth/permissão | Domain | DB | Consumer Web | Consumer Mobile | Worker | MCP | Teste (arquivo) | Resultado executado hoje (log da API) |\n|---|---|---|---|---|---|---|---|---|---|';
writeFileSync(`${SP}/api_matrix_rows.md`, `${header}\n${lines.join('\n')}\n`);
console.log(
  JSON.stringify({
    total: routes.length,
    withWeb,
    withMobile,
    withTest,
    orphanNoConsumer: orphan,
    exercisedToday: exercised,
    only4xxToday: only4xx,
    any5xxToday: any5xx,
    webKeys: Object.keys(web).length,
    bRows: Object.keys(bRows).length,
  }),
);
