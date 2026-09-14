// Audit 2026-09-10 — HTTP verification of API-agent findings (isolated stack, FAKE providers).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const API = 'http://127.0.0.1:4100';
const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const OUT = `${SP}/probe_b_results.jsonl`;
writeFileSync(OUT, '');
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const S = JSON.parse(readFileSync(`${SP}/probe_state.json`, 'utf8'));
const G = (o, ...p) => p.reduce((a, k) => (a == null ? undefined : a[k]), o);
const t = (b) => {
  const s = typeof b === 'string' ? b : JSON.stringify(b);
  return s && s.length > 500 ? `${s.slice(0, 500)}…` : s;
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
    ).trim();
  } catch (e) {
    return `SQL_ERROR ${String(e.message).slice(0, 200)}`;
  }
};
function cpf() {
  const b = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const d = (a, f) => {
    const r = (a.reduce((s, n, i) => s + n * (f - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = d(b, 10);
  return [...b, d1, d([...b, d1], 11)].join('');
}
async function login(email) {
  const r = await api('POST', '/auth/login', { json: { email, password: 'audit-pass-123' } });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

const A = await login(S.A.email);
const B = await login(S.B.email);

// P0-02: regenerate a SIGNED contract
const before = sql(
  `select status||' | hash='||coalesce(content_hash,'-')||' | signed_at='||coalesce(signed_at::text,'-') from contracts where id='${S.contract}'`,
);
info('contract BEFORE regenerate', before);
const regen = await api('POST', `/contracts/${S.contract}/generate`, { cookie: A, json: {} });
rec('P0-02 regenerate SIGNED contract (must be rejected)', [409, 400, 422], regen);
info(
  'contract AFTER regenerate',
  sql(
    `select status||' | hash='||coalesce(content_hash,'-')||' | signed_at='||coalesce(signed_at::text,'-') from contracts where id='${S.contract}'`,
  ),
);
info(
  'lease still linked to contract',
  sql(`select status from leases where contract_id='${S.contract}'`),
);

// P2-12: PATCH contract status to VOID then read
const t2 = await api('POST', '/parties', {
  cookie: A,
  json: { type: 'PERSON', name: 'Void Test', identities: [{ kind: 'CPF', value: cpf() }] },
});
await api('POST', `/parties/${G(t2.body, 'party', 'id')}/consents`, {
  cookie: A,
  json: { purpose: 'CREDIT_SCREENING' },
});
const app2 = await api('POST', '/rental-applications', {
  cookie: A,
  json: { partyId: G(t2.body, 'party', 'id'), propertyId: S.propA },
});
const appId = G(app2.body, 'application', 'id');
rec(
  'app -> SUBMITTED',
  200,
  await api('PATCH', `/rental-applications/${appId}/status`, {
    cookie: A,
    json: { status: 'SUBMITTED' },
  }),
);
// P1-03: skip credit screening via PATCH
rec(
  'P1-03 SUBMITTED -> SCREENING via PATCH (no screening request)',
  [409, 400, 422],
  await api('PATCH', `/rental-applications/${appId}/status`, {
    cookie: A,
    json: { status: 'SCREENING' },
  }),
);
rec(
  'P1-03 SCREENING -> APPROVED via PATCH without result/reason',
  [409, 400, 422],
  await api('PATCH', `/rental-applications/${appId}/status`, {
    cookie: A,
    json: { status: 'APPROVED' },
  }),
);
info(
  'application final state',
  sql(
    `select status||' reason='||coalesce(decision_reason,'-')||' results='||(select count(*) from screening_results r where r.application_id=a.id) from rental_applications a where id='${appId}'`,
  ),
);

// P1-12 consent read cross-org via B's application pointing to A's party
const bApps = await api('GET', '/rental-applications', { cookie: B });
const bAppId = G(bApps.body, 'applications', 0, 'id');
const bApp = await api('GET', `/rental-applications/${bAppId}`, { cookie: B });
const txt = JSON.stringify(bApp.body);
rec(
  'P1-12 B reads its app pointing to A party: exposes A consent?',
  () => !/consent/i.test(txt) || /"consent":null/.test(txt),
  { status: bApp.status, body: bApp.body },
  'FAIL = consent data of other org visible',
);

// P1-01: AI suggestion resolution breaks inspection read
const inspId = S.insp;
const sug = sql(
  `insert into inspection_ai_suggestions (id, org_id, inspection_id, kind, category, severity, description, confidence, status) values (gen_random_uuid(), '${S.A.orgId}', '${inspId}', 'VISUAL', 'DAMAGE', 'LOW', 'Sugestão IA (auditoria)', 0.8, 'PENDING') returning id`,
).split('\n')[0];
info('suggestion inserted (SQL, isolated DB)', sug);
rec(
  'GET inspection before resolving',
  200,
  await api('GET', `/inspections/${inspId}`, { cookie: A }),
);
rec(
  'resolve suggestion ACCEPT',
  [200, 201, 409],
  await api('PATCH', `/inspections/${inspId}/ai-suggestions/${sug}`, {
    cookie: A,
    json: { action: 'ACCEPT' },
  }),
);
info(
  'suggestion status stored',
  sql(`select status from inspection_ai_suggestions where id='${sug}'`),
);
rec(
  'P1-01 GET inspection after resolving (must stay 200)',
  200,
  await api('GET', `/inspections/${inspId}`, { cookie: A }),
);
rec(
  'P1-01 GET report after resolving (must stay 200)',
  200,
  await api('GET', `/inspections/${inspId}/report`, { cookie: A }),
);

// P2-04: tenant portal sees INTERMEDIATE inspections / other leases
const inter = await api('POST', '/inspections', {
  cookie: A,
  json: { propertyId: S.propA, type: 'INTERMEDIATE' },
});
const acc = await api('POST', '/portal/access', {
  cookie: A,
  json: { partyId: S.tenant, kind: 'TENANT' },
});
const cons = await api('POST', '/portal/auth/consume', {
  json: { token: G(acc.body, 'oneTimeToken') },
});
const pc = (cons.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const pi = await api('GET', '/portal/tenant/inspections', { cookie: pc });
rec(
  'P2-04 tenant portal hides INTERMEDIATE inspections',
  () => !JSON.stringify(pi.body).includes(G(inter.body, 'inspection', 'id')),
  { status: pi.status, body: pi.body },
);

// P2-03: public list includes ARCHIVED property listing?
const pa = await api('POST', '/properties', {
  cookie: A,
  json: { title: 'Casa Arquivada Publica', propertyType: 'HOUSE' },
});
const paId = G(pa.body, 'property', 'id');
const l = await api('POST', '/listings', {
  cookie: A,
  json: { propertyId: paId, title: 'Casa Arquivada Publica', description: 'x' },
});
const lid = G(l.body, 'listing', 'id');
await api('PATCH', `/listings/${lid}/status`, { cookie: A, json: { status: 'READY' } });
await api('PATCH', `/listings/${lid}/status`, { cookie: A, json: { status: 'PUBLISHED' } });
await api('PATCH', `/properties/${paId}`, { cookie: A, json: { status: 'ARCHIVED' } });
const pub = await api('GET', `/public/organizations/${S.A.orgSlug}/listings`);
rec(
  'P2-03 public list hides listing of ARCHIVED property',
  () => !JSON.stringify(pub.body).includes('Casa Arquivada Publica'),
  { status: pub.status, body: pub.body },
);
const media = JSON.stringify(pub.body).match(/"media":\[[^\]]*\]/);
info('public media entries (url present?)', media ? media[0].slice(0, 300) : 'none');

// Channel publication of a DRAFT listing (P2-01)
const l2 = await api('POST', '/listings', {
  cookie: A,
  json: { propertyId: S.propA, title: 'Draft listing', description: 'draft' },
});
rec(
  'P2-01 publish DRAFT listing to channel (must be rejected)',
  [400, 409, 422],
  await api('POST', `/listings/${G(l2.body, 'listing', 'id')}/channels/fake/publish`, {
    cookie: A,
    json: {},
  }),
);
console.log('DONE');
