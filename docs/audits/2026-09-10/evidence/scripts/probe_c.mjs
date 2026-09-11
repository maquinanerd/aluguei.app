// Audit 2026-09-10 — Meta dry-run pipeline (fixed), AI suggestion resolution, cross-org consent read.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'http://127.0.0.1:4100';
const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const OUT = `${SP}/probe_c_results.jsonl`;
writeFileSync(OUT, '');
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const S = JSON.parse(readFileSync(`${SP}/probe_state.json`, 'utf8'));
const mediaId = String(S.mediaId).trim();
const U = Date.now().toString(36);
const G = (o, ...p) => p.reduce((a, k) => (a == null ? undefined : a[k]), o);
const t = (b) => {
  const s = typeof b === 'string' ? b : JSON.stringify(b);
  return s && s.length > 600 ? `${s.slice(0, 600)}…` : s;
};
function rec(step, expect, res, note = '') {
  const ok =
    typeof expect === 'function'
      ? Boolean(expect(res))
      : Array.isArray(expect)
        ? expect.includes(res.status)
        : res.status === expect;
  appendFileSync(
    OUT,
    `${JSON.stringify({ step, status: res.status, ok, note, body: t(res.body) })}\n`,
  );
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step} -> ${res.status} ${note} | ${t(res.body)}`);
  return res;
}
function info(step, v) {
  appendFileSync(OUT, `${JSON.stringify({ step, status: 'INFO', body: t(v) })}\n`);
  console.log(`INFO ${step}: ${t(v)}`);
}
async function api(method, path, { json, cookie } = {}) {
  const h = {};
  if (json !== undefined) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  const r = await fetch(API + path, {
    method,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const x = await r.text();
  let body;
  try {
    body = JSON.parse(x);
  } catch {
    body = x;
  }
  return { status: r.status, body, headers: r.headers };
}
const sql = (q) => {
  try {
    return execFileSync(
      PSQL,
      ['-h', 'localhost', '-p', '55432', '-U', 'postgres', '-d', 'aluguei_audit', '-tA', '-c', q],
      { encoding: 'utf8' },
    )
      .replace(/\r/g, '')
      .trim();
  } catch (e) {
    return `SQL_ERROR ${String(e.message).slice(0, 200)}`;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(email) {
  const r = await api('POST', '/auth/login', { json: { email, password: 'audit-pass-123' } });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
const A = await login(S.A.email);
const B = await login(S.B.email);
const orgId = S.A.orgId;

// ── P1-12 cross-org consent read
const bApps = await api('GET', '/rental-applications', { cookie: B });
const bApp = await api('GET', `/rental-applications/${G(bApps.body, 'applications', 0, 'id')}`, {
  cookie: B,
});
info('P1-12 B app (points to A party): consent field', G(bApp.body, 'consent'));
info(
  'P1-12 A consent row for that party',
  sql(
    `select id||' org='||org_id||' purpose='||purpose from party_consents where party_id='${G(bApp.body, 'application', 'partyId')}'`,
  ),
);

// ── P1-01 AI suggestion resolution
info(
  'suggestion columns',
  sql(
    `select string_agg(column_name||':'||data_type, ',' order by ordinal_position) from information_schema.columns where table_name='inspection_ai_suggestions'`,
  ),
);
const sug = sql(
  `insert into inspection_ai_suggestions (id, org_id, inspection_id, kind, category, severity, description, confidence, status) values (gen_random_uuid(), '${orgId}', '${S.insp}', 'VISUAL', 'DAMAGE', 'LOW', 'Sugestao IA auditoria', 0.8, 'PENDING') returning id`,
).split('\n')[0];
info('suggestion inserted', sug);
rec(
  'resolve suggestion ACCEPT',
  [200, 201],
  await api('PATCH', `/inspections/${S.insp}/ai-suggestions/${sug}`, {
    cookie: A,
    json: { action: 'ACCEPT' },
  }),
);
info(
  'suggestion status stored in DB',
  sql(`select status from inspection_ai_suggestions where id='${sug}'`),
);
rec(
  'P1-01 GET inspection after resolving',
  200,
  await api('GET', `/inspections/${S.insp}`, { cookie: A }),
);
rec(
  'P1-01 GET report after resolving',
  200,
  await api('GET', `/inspections/${S.insp}/report`, { cookie: A }),
);
rec(
  'P1-01 GET review after resolving',
  200,
  await api('GET', `/inspections/${S.insp}/review`, { cookie: A }),
);

// ── Meta dry-run pipeline
const conn = rec(
  'meta create FAKE connection',
  [200, 201],
  await api('POST', '/meta/connections', { cookie: A, json: { provider: 'FAKE' } }),
);
const connectionId = G(conn.body, 'connection', 'id');
info(
  'connection token column',
  sql(
    `select coalesce(left(access_token_encrypted,16),'NULL')||' status='||status from meta_connections where id='${connectionId}'`,
  ),
);
const base = {
  connectionId,
  propertyId: S.propA,
  listingId: S.listingA,
  name: `Campanha Audit ${U}`,
  objective: 'OUTCOME_LEADS',
  startAt: '2026-10-01T00:00:00Z',
  endAt: '2026-10-31T00:00:00Z',
  mediaSelection: [mediaId],
  landingUrl: 'https://example.com/imovel',
  copyPrimary: 'Apartamento 3 quartos nos Jardins. Agende sua visita.',
};
rec(
  'meta prepare EXCESSIVE daily budget',
  [400, 409, 422],
  await api('POST', '/meta/ad-profiles', {
    cookie: A,
    json: { ...base, dailyBudgetCents: 50_000_000, idempotencyKey: `cap-${U}-x` },
  }),
);
rec(
  'meta prepare BOTH budgets',
  [400, 422],
  await api('POST', '/meta/ad-profiles', {
    cookie: A,
    json: {
      ...base,
      dailyBudgetCents: 5000,
      lifetimeBudgetCents: 50000,
      idempotencyKey: `xor-${U}-x`,
    },
  }),
);
rec(
  'meta prepare PII (CPF/email) in copy',
  [400, 422],
  await api('POST', '/meta/ad-profiles', {
    cookie: A,
    json: {
      ...base,
      dailyBudgetCents: 5000,
      copyPrimary: `Ligue ${S.cpfL1} ou dono@example.com`,
      idempotencyKey: `pii-${U}-x`,
    },
  }),
);
rec(
  'meta prepare http landing (not https)',
  [400, 422],
  await api('POST', '/meta/ad-profiles', {
    cookie: A,
    json: {
      ...base,
      dailyBudgetCents: 5000,
      landingUrl: 'http://example.com',
      idempotencyKey: `http-${U}-x`,
    },
  }),
);
const prof = rec(
  'meta prepare valid',
  [200, 201],
  await api('POST', '/meta/ad-profiles', {
    cookie: A,
    json: { ...base, dailyBudgetCents: 5000, idempotencyKey: `prep-${U}-x` },
  }),
);
const profileId =
  G(prof.body, 'adProfile', 'id') ?? G(prof.body, 'profile', 'id') ?? G(prof.body, 'id');
info(
  'profile keys / special_ad_categories',
  `${Object.keys(prof.body ?? {})} | ${sql(`select coalesce(special_ad_categories::text,'-')||' status='||status from meta_ad_profiles where id='${profileId}'`)}`,
);
const cc = rec(
  'meta create campaign',
  [200, 201, 202],
  await api('POST', `/meta/ad-profiles/${profileId}/create-campaign`, {
    cookie: A,
    json: { idempotencyKey: `cc-${U}-001` },
  }),
);
const cc2 = await api('POST', `/meta/ad-profiles/${profileId}/create-campaign`, {
  cookie: A,
  json: { idempotencyKey: `cc-${U}-001` },
});
rec(
  'meta create campaign retry same key (idempotent)',
  (r) =>
    [200, 201, 202].includes(r.status) &&
    G(r.body, 'campaign', 'id') === G(cc.body, 'campaign', 'id'),
  cc2,
);
const campId = G(cc.body, 'campaign', 'id') ?? G(cc.body, 'campaignLink', 'id');
info(
  'campaign create body keys/status',
  `${Object.keys(cc.body ?? {})} | ${G(cc.body, 'campaign', 'status')}`,
);
const prev = await api('GET', `/meta/campaigns/${campId}/preview`, { cookie: A });
rec('meta preview', 200, prev);
info('preview HOUSING present', /HOUSING/.test(JSON.stringify(prev.body)));
rec(
  'meta publish',
  [200, 201, 202],
  await api('POST', `/meta/campaigns/${campId}/publish`, {
    cookie: A,
    json: { idempotencyKey: `pub-${U}-001` },
  }),
);
await sleep(12000);
info(
  'campaign status after publish + worker',
  G((await api('GET', `/meta/campaigns/${campId}`, { cookie: A })).body, 'campaign', 'status'),
);
rec(
  'meta budget above cap',
  [400, 409, 422],
  await api('POST', `/meta/campaigns/${campId}/budget`, {
    cookie: A,
    json: { dailyBudgetCents: 90_000_000, idempotencyKey: `bud-${U}-001` },
  }),
);
rec(
  'meta budget valid',
  [200, 201, 202],
  await api('POST', `/meta/campaigns/${campId}/budget`, {
    cookie: A,
    json: { dailyBudgetCents: 6000, idempotencyKey: `bud-${U}-002` },
  }),
);
rec(
  'meta pause',
  [200, 201, 202, 409],
  await api('POST', `/meta/campaigns/${campId}/pause`, {
    cookie: A,
    json: { idempotencyKey: `pau-${U}-001` },
  }),
);
rec(
  'meta resume',
  [200, 201, 202, 409],
  await api('POST', `/meta/campaigns/${campId}/resume`, {
    cookie: A,
    json: { idempotencyKey: `res-${U}-001` },
  }),
);
rec(
  'meta sync insights',
  [200, 201, 202],
  await api('POST', `/meta/campaigns/${campId}/sync-insights`, { cookie: A, json: {} }),
);
await sleep(12000);
info(
  'meta_sync_jobs',
  sql(
    `select string_agg(job_type||':'||status||':'||coalesce(left(last_error,70),'-'), ' | ' order by created_at) from meta_sync_jobs where org_id='${orgId}'`,
  ),
);
info(
  'insight snapshots',
  sql(
    `select count(*)||' rows; sample='||coalesce(left(max(insights::text),160),'-') from meta_insight_snapshots where org_id='${orgId}'`,
  ),
);
info(
  'meta_audit_events',
  sql(
    `select string_agg(coalesce(tool,'-')||'/'||action||':'||status, ', ') from meta_audit_events where org_id='${orgId}'`,
  ),
);
info(
  'campaign final',
  G((await api('GET', `/meta/campaigns/${campId}`, { cookie: A })).body, 'campaign'),
);
rec('reporting meta-spend', 200, await api('GET', '/reporting/meta-spend', { cookie: A }));
rec(
  'B reads A campaign (cross-tenant)',
  [403, 404],
  await api('GET', `/meta/campaigns/${campId}`, { cookie: B }),
);
rec(
  'B pauses A campaign (cross-tenant)',
  [403, 404],
  await api('POST', `/meta/campaigns/${campId}/pause`, {
    cookie: B,
    json: { idempotencyKey: `x-${U}-0001` },
  }),
);
console.log('DONE');
