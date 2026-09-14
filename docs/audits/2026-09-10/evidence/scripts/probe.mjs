// Audit 2026-09-10 — HTTP probes against the isolated stack (API :4100, worker, PG :55432).
// All providers FAKE / dry-run. No external effects. Results -> probe_results.jsonl
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const API = process.env.PROBE_API ?? 'http://127.0.0.1:4100';
const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const OUT = `${SP}/probe_results.jsonl`;
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
writeFileSync(OUT, '');
const U = Date.now().toString(36);
const S = {}; // shared state (ids)

function trunc(b) {
  const s = typeof b === 'string' ? b : JSON.stringify(b);
  return s && s.length > 700 ? `${s.slice(0, 700)}…` : s;
}
function rec(section, step, expect, res, note = '') {
  let ok;
  if (typeof expect === 'function') ok = Boolean(expect(res));
  else if (Array.isArray(expect)) ok = expect.includes(res.status);
  else ok = res.status === expect;
  const row = {
    section,
    step,
    status: res.status,
    ok,
    expect: typeof expect === 'function' ? 'custom' : String(expect),
    note,
    body: trunc(res.body),
  };
  appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${step} -> ${res.status} ${note}`);
  return res;
}
function info(section, step, value) {
  const row = {
    section,
    step,
    status: 'INFO',
    ok: true,
    expect: '-',
    note: '',
    body: trunc(value),
  };
  appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  console.log(`INFO [${section}] ${step}: ${trunc(value)}`);
}
async function api(method, path, { json, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (json !== undefined) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  try {
    const res = await fetch(API + path, {
      method,
      headers: h,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  } catch (err) {
    return { status: 'NETWORK_ERROR', body: String(err), headers: new Headers() };
  }
}
function cookieFrom(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}
function sql(q) {
  try {
    return execFileSync(
      PSQL,
      ['-h', 'localhost', '-p', '55432', '-U', 'postgres', '-d', 'aluguei_audit', '-tA', '-c', q],
      { encoding: 'utf8' },
    ).trim();
  } catch (err) {
    return `SQL_ERROR ${String(err.message).slice(0, 300)}`;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, cond, tries = 25, ms = 1000) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (cond(last)) return { ok: true, last, tries: i + 1 };
    await sleep(ms);
  }
  return { ok: false, last, tries };
}
function cpf() {
  const b = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const d = (arr, f) => {
    const s = arr.reduce((acc, n, i) => acc + n * (f - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = d(b, 10);
  const d2 = d([...b, d1], 11);
  return [...b, d1, d2].join('');
}
const G = (obj, ...path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

async function register(label) {
  const email = `audit-${label}-${U}@example.com`;
  const res = await api('POST', '/auth/register', {
    json: {
      name: `Audit ${label}`,
      email,
      password: 'audit-pass-123',
      organizationName: `Imob ${label} ${U}`,
    },
  });
  rec('auth', `register ${label}`, 201, res);
  info('auth', `set-cookie attrs ${label}`, (res.headers.getSetCookie?.() ?? []).join(' || '));
  return {
    email,
    cookie: cookieFrom(res),
    userId: G(res.body, 'user', 'id'),
    orgId: G(res.body, 'org', 'id'),
    orgSlug: G(res.body, 'org', 'slug'),
  };
}

async function main() {
  // ───────────── S1 AUTH ─────────────
  const A = await register('A');
  const B = await register('B');
  const C = await register('C'); // will be viewer in org A
  const D = await register('D'); // will be agent in org A
  S.A = A;
  S.B = B;
  rec('auth', 'GET /auth/me (A)', 200, await api('GET', '/auth/me', { cookie: A.cookie }));
  rec('auth', 'GET /auth/me without cookie', 401, await api('GET', '/auth/me'));
  const dupReg = await api('POST', '/auth/register', {
    json: { name: 'dup', email: A.email, password: 'audit-pass-123', organizationName: 'dup' },
  });
  rec(
    'auth',
    'register duplicate email',
    [409, 400, 201],
    dupReg,
    'anti-enumeration behaviour recorded',
  );
  rec(
    'auth',
    'login wrong password',
    401,
    await api('POST', '/auth/login', { json: { email: A.email, password: 'wrong-pass-000' } }),
  );
  const loginA2 = await api('POST', '/auth/login', {
    json: { email: A.email, password: 'audit-pass-123' },
  });
  rec('auth', 'login A (second session)', 200, loginA2);
  const cookieA2 = cookieFrom(loginA2);
  rec('auth', 'logout A2', 200, await api('POST', '/auth/logout', { cookie: cookieA2, json: {} }));
  rec(
    'auth',
    'reuse cookie after logout -> revoked',
    401,
    await api('GET', '/auth/me', { cookie: cookieA2 }),
  );
  rec(
    'auth',
    'ORIGINAL session of A after logging out ANOTHER session',
    [200, 401],
    await api('GET', '/auth/me', { cookie: A.cookie }),
    '401 = logout revokes all sessions of user in org',
  );
  const reloginA = await api('POST', '/auth/login', {
    json: { email: A.email, password: 'audit-pass-123' },
  });
  rec('auth', 'relogin A', 200, reloginA);
  A.cookie = cookieFrom(reloginA);
  rec(
    'auth',
    'switch-org B -> orgA (no membership)',
    [403, 404],
    await api('POST', '/auth/switch-org', { cookie: B.cookie, json: { orgId: A.orgId } }),
  );

  // ───────────── S2 MEMBERS / RBAC ─────────────
  rec(
    'rbac',
    'B adds itself as owner of orgA',
    [403, 404],
    await api('POST', `/organizations/${A.orgId}/members`, {
      cookie: B.cookie,
      json: { userId: B.userId, role: 'owner' },
    }),
  );
  rec(
    'rbac',
    'B lists members of orgA',
    [403, 404],
    await api('GET', `/organizations/${A.orgId}/members`, { cookie: B.cookie }),
  );
  rec(
    'rbac',
    'A adds C as viewer',
    201,
    await api('POST', `/organizations/${A.orgId}/members`, {
      cookie: A.cookie,
      json: { userId: C.userId, role: 'viewer' },
    }),
  );
  rec(
    'rbac',
    'A adds D as agent',
    201,
    await api('POST', `/organizations/${A.orgId}/members`, {
      cookie: A.cookie,
      json: { userId: D.userId, role: 'agent' },
    }),
  );
  rec(
    'rbac',
    'C switch-org -> A',
    200,
    await api('POST', '/auth/switch-org', { cookie: C.cookie, json: { orgId: A.orgId } }),
  );
  rec(
    'rbac',
    'D switch-org -> A',
    200,
    await api('POST', '/auth/switch-org', { cookie: D.cookie, json: { orgId: A.orgId } }),
  );
  rec(
    'rbac',
    'viewer C POST /properties',
    403,
    await api('POST', '/properties', {
      cookie: C.cookie,
      json: { title: 'x', propertyType: 'HOUSE' },
    }),
  );
  rec(
    'rbac',
    'viewer C GET /properties',
    200,
    await api('GET', '/properties', { cookie: C.cookie }),
  );
  rec(
    'rbac',
    'viewer C self-promote to owner',
    403,
    await api('PATCH', `/organizations/${A.orgId}/members/${C.userId}`, {
      cookie: C.cookie,
      json: { role: 'owner' },
    }),
  );
  rec(
    'rbac',
    'agent D promotes C to admin',
    403,
    await api('PATCH', `/organizations/${A.orgId}/members/${C.userId}`, {
      cookie: D.cookie,
      json: { role: 'admin' },
    }),
  );
  rec(
    'rbac',
    'agent D GET /charges (finance:read)',
    [403, 200],
    await api('GET', '/charges', { cookie: D.cookie }),
    'recorded',
  );
  rec(
    'rbac',
    'agent D GET /ledger/entries',
    [403, 200],
    await api('GET', '/ledger/entries', { cookie: D.cookie }),
    'recorded',
  );
  rec(
    'rbac',
    'viewer C GET /reporting/export/leads',
    [403, 200, 400],
    await api('GET', '/reporting/export/leads', { cookie: C.cookie }),
    'recorded',
  );

  // ───────────── S3 PARTIES + PROPERTY CRUD ─────────────
  const cpfL1 = cpf();
  const cpfL2 = cpf();
  const cpfT = cpf();
  S.cpfL1 = cpfL1;
  const l1 = rec(
    'crud-party',
    'create landlord1 (OWNER, address)',
    201,
    await api('POST', '/parties', {
      cookie: A.cookie,
      json: {
        type: 'PERSON',
        name: 'Proprietario Um Audit',
        roles: ['OWNER'],
        identities: [
          { kind: 'CPF', value: cpfL1 },
          { kind: 'EMAIL', value: `l1-${U}@example.com` },
          { kind: 'PHONE', value: '+5511999990001' },
        ],
        addresses: [{ street: 'Rua Privada do Dono', number: '9', city: 'São Paulo', state: 'SP' }],
      },
    }),
  );
  S.landlord1 = G(l1.body, 'party', 'id');
  const l2 = rec(
    'crud-party',
    'create landlord2',
    201,
    await api('POST', '/parties', {
      cookie: A.cookie,
      json: {
        type: 'PERSON',
        name: 'Proprietario Dois Audit',
        roles: ['OWNER'],
        identities: [{ kind: 'CPF', value: cpfL2 }],
      },
    }),
  );
  S.landlord2 = G(l2.body, 'party', 'id');
  const dupParty = await api('POST', '/parties', {
    cookie: A.cookie,
    json: { type: 'PERSON', name: 'Duplicado', identities: [{ kind: 'CPF', value: cpfL1 }] },
  });
  rec(
    'crud-party',
    'create party with SAME CPF (dedupe)',
    [201, 409],
    dupParty,
    `duplicate=${G(dupParty.body, 'duplicate')} matched=${G(dupParty.body, 'matchedPartyId')}`,
  );
  info(
    'crud-party',
    'parties rows with landlord1 CPF',
    sql(`select count(*) from party_identities where kind='CPF' and value='${cpfL1}'`),
  );
  rec(
    'crud-party',
    'POST /parties/dedupe CPF',
    200,
    await api('POST', '/parties/dedupe', {
      cookie: A.cookie,
      json: { identities: [{ kind: 'CPF', value: cpfL1 }] },
    }),
  );
  rec(
    'crud-party',
    'create party invalid CPF',
    [400, 422],
    await api('POST', '/parties', {
      cookie: A.cookie,
      json: {
        type: 'PERSON',
        name: 'CPF invalido',
        identities: [{ kind: 'CPF', value: '12345678900' }],
      },
    }),
  );
  rec(
    'crud-party',
    'GET /parties/:id (detail endpoint exists?)',
    [200, 404],
    await api('GET', `/parties/${S.landlord1}`, { cookie: A.cookie }),
    'no route expected',
  );
  rec(
    'crud-party',
    'PATCH /parties/:id (update endpoint exists?)',
    [200, 404],
    await api('PATCH', `/parties/${S.landlord1}`, { cookie: A.cookie, json: { name: 'x' } }),
    'no route expected',
  );

  rec(
    'validation',
    'POST /properties with unknown field (strictness)',
    [400, 201],
    await api('POST', '/properties', {
      cookie: A.cookie,
      json: { title: 'Strict test', propertyType: 'HOUSE', hackerField: 'x' },
    }),
    '400 = strict; 201 = unknown keys stripped/accepted',
  );
  const prop = rec(
    'crud-property',
    'create property',
    201,
    await api('POST', '/properties', {
      cookie: A.cookie,
      json: {
        title: `Apto Audit ${U}`,
        propertyType: 'APARTMENT',
        bedrooms: 2,
        bathrooms: 1,
        parkingSpots: 1,
        totalAreaSqm: 70.5,
        furnished: false,
        petsAllowed: true,
      },
    }),
  );
  S.propA = G(prop.body, 'property', 'id');
  rec(
    'crud-property',
    'GET property',
    200,
    await api('GET', `/properties/${S.propA}`, { cookie: A.cookie }),
  );
  const patched = await api('PATCH', `/properties/${S.propA}`, {
    cookie: A.cookie,
    json: { title: `Apto Audit Editado ${U}`, bedrooms: 3 },
  });
  rec('crud-property', 'PATCH property', 200, patched);
  const reloaded = await api('GET', `/properties/${S.propA}`, { cookie: A.cookie });
  rec(
    'crud-property',
    'reload reflects edit',
    (r) => G(r.body, 'property', 'bedrooms') === 3,
    reloaded,
  );
  rec(
    'crud-property',
    'PUT address (private+public)',
    200,
    await api('PUT', `/properties/${S.propA}/address`, {
      cookie: A.cookie,
      json: {
        privateAddress: {
          street: 'Rua Secreta Privada',
          number: '1500',
          complement: 'Apto 71',
          neighborhood: 'Jardins',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01415-000',
          country: 'BR',
        },
        publicAddress: { neighborhood: 'Jardins', city: 'São Paulo', state: 'SP', country: 'BR' },
      },
    }),
  );
  rec(
    'crud-property',
    'PUT financial terms (full)',
    200,
    await api('PUT', `/properties/${S.propA}/financial-terms`, {
      cookie: A.cookie,
      json: {
        monthlyRentCents: 250000,
        condoFeeCents: 50000,
        iptuCents: 12000,
        securityDepositCents: 750000,
        minimumLeaseMonths: 30,
        availableFrom: '2026-10-01',
      },
    }),
  );
  rec(
    'validation',
    'financial terms float cents',
    400,
    await api('PUT', `/properties/${S.propA}/financial-terms`, {
      cookie: A.cookie,
      json: { monthlyRentCents: 2500.5 },
    }),
  );
  rec(
    'validation',
    'financial terms string cents',
    400,
    await api('PUT', `/properties/${S.propA}/financial-terms`, {
      cookie: A.cookie,
      json: { monthlyRentCents: '250000' },
    }),
  );
  rec(
    'crud-property',
    'add feature',
    [200, 201],
    await api('POST', `/properties/${S.propA}/features`, {
      cookie: A.cookie,
      json: { feature: 'piscina' },
    }),
  );
  rec(
    'crud-property',
    'remove feature',
    [200, 204],
    await api('DELETE', `/properties/${S.propA}/features/piscina`, { cookie: A.cookie }),
  );
  rec(
    'crud-property',
    'media upload-url (storage not configured)',
    [400, 200, 201],
    await api('POST', `/properties/${S.propA}/media/upload-url`, {
      cookie: A.cookie,
      json: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    }),
    'documents dev behaviour without STORAGE_BUCKET',
  );
  // Regression test (owners + media, Date->string): insert a media row directly (isolated DB).
  const mediaId = sql(
    `insert into property_media (id, org_id, property_id, kind, storage_key, mime_type, size_bytes, is_public) values (gen_random_uuid(), '${A.orgId}', '${S.propA}', 'PHOTO', 'orgs/${A.orgId}/properties/${S.propA}/audit-${U}.jpg', 'image/jpeg', 2048, true) returning id`,
  ).split('\n')[0];
  S.mediaId = mediaId;
  info('regression', 'media row inserted via SQL', mediaId);
  const own1 = rec(
    'regression',
    'POST owners on property WITH media (historic P1 bug)',
    201,
    await api('POST', `/properties/${S.propA}/owners`, {
      cookie: A.cookie,
      json: { partyId: S.landlord1, ownershipSharePct: 60 },
    }),
  );
  info(
    'regression',
    'media.createdAt type in owners response',
    typeof G(own1.body, 'property', 'media', 0, 'createdAt'),
  );
  const own2 = await api('POST', `/properties/${S.propA}/owners`, {
    cookie: A.cookie,
    json: { partyId: S.landlord2, ownershipSharePct: 60 },
  });
  rec(
    'crud-property',
    'second owner making total 120% (should be rejected)',
    [400, 409, 422],
    own2,
    'ownership share sum validation',
  );
  info(
    'crud-property',
    'owners rows + share sum',
    sql(
      `select count(*)||' owners, sum='||coalesce(sum(ownership_share_pct),0) from property_owners where property_id='${S.propA}'`,
    ),
  );
  rec(
    'crud-property',
    'GET property after owners',
    200,
    await api('GET', `/properties/${S.propA}`, { cookie: A.cookie }),
  );
  rec(
    'crud-property',
    'DELETE owner landlord2',
    [200, 204, 404],
    await api('DELETE', `/properties/${S.propA}/owners/${S.landlord2}`, { cookie: A.cookie }),
  );
  const p2 = await api('POST', '/properties', {
    cookie: A.cookie,
    json: { title: `Casa Arquivar ${U}`, propertyType: 'HOUSE' },
  });
  S.propArchive = G(p2.body, 'property', 'id');
  rec(
    'crud-property',
    'archive property (PATCH status ARCHIVED)',
    200,
    await api('PATCH', `/properties/${S.propArchive}`, {
      cookie: A.cookie,
      json: { status: 'ARCHIVED' },
    }),
  );
  rec(
    'crud-property',
    'DELETE /properties/:id (hard delete exists?)',
    [404, 405, 200],
    await api('DELETE', `/properties/${S.propArchive}`, { cookie: A.cookie }),
    'no route expected',
  );

  // ───────────── S4 LISTING + PUBLIC SITE ─────────────
  const lst = rec(
    'listing',
    'create listing',
    201,
    await api('POST', '/listings', {
      cookie: A.cookie,
      json: { propertyId: S.propA, title: `Apto Audit ${U}`, description: 'Lindo apto 3 quartos' },
    }),
  );
  S.listingA = G(lst.body, 'listing', 'id');
  S.listingSlug = G(lst.body, 'listing', 'slug');
  rec(
    'listing',
    'invalid transition DRAFT -> PUBLISHED',
    [409, 400, 422],
    await api('PATCH', `/listings/${S.listingA}/status`, {
      cookie: A.cookie,
      json: { status: 'PUBLISHED' },
    }),
  );
  rec(
    'listing',
    'DRAFT -> READY',
    200,
    await api('PATCH', `/listings/${S.listingA}/status`, {
      cookie: A.cookie,
      json: { status: 'READY' },
    }),
  );
  rec(
    'listing',
    'READY -> PUBLISHED',
    200,
    await api('PATCH', `/listings/${S.listingA}/status`, {
      cookie: A.cookie,
      json: { status: 'PUBLISHED' },
    }),
  );
  const pubList = await api('GET', `/public/organizations/${A.orgSlug}/listings`);
  rec('public', 'public list', 200, pubList);
  const pubDet = await api('GET', `/public/organizations/${A.orgSlug}/listings/${S.listingSlug}`);
  rec('public', 'public detail', 200, pubDet);
  const leakText = JSON.stringify(pubList.body) + JSON.stringify(pubDet.body);
  const leaks = [
    'Rua Secreta Privada',
    '1500',
    'Apto 71',
    'Proprietario Um',
    cpfL1,
    'storage_key',
    'storageKey',
    `l1-${U}`,
    'orgs/',
  ].filter((s) => leakText.includes(s));
  rec('public', 'public payload leaks private data?', () => leaks.length === 0, {
    status: leaks.length ? 'LEAK' : 'CLEAN',
    body: leaks,
  });
  info('public', 'public detail keys', Object.keys(G(pubDet.body, 'listing') ?? pubDet.body ?? {}));
  rec(
    'public',
    'public unknown slug',
    404,
    await api('GET', `/public/organizations/${A.orgSlug}/listings/nao-existe-${U}`),
  );
  rec(
    'public',
    'public listing via other org slug',
    404,
    await api('GET', `/public/organizations/${B.orgSlug}/listings/${S.listingSlug}`),
  );
  rec(
    'listing',
    'PUBLISHED -> PAUSED',
    200,
    await api('PATCH', `/listings/${S.listingA}/status`, {
      cookie: A.cookie,
      json: { status: 'PAUSED' },
    }),
  );
  rec(
    'public',
    'paused listing hidden from public',
    404,
    await api('GET', `/public/organizations/${A.orgSlug}/listings/${S.listingSlug}`),
  );
  rec(
    'listing',
    'PAUSED -> PUBLISHED',
    200,
    await api('PATCH', `/listings/${S.listingA}/status`, {
      cookie: A.cookie,
      json: { status: 'PUBLISHED' },
    }),
  );
  rec(
    'public',
    'POST public lead endpoint exists?',
    [404, 201, 200],
    await api('POST', `/public/organizations/${A.orgSlug}/listings/${S.listingSlug}/leads`, {
      json: { name: 'Visitante', email: 'v@example.com' },
    }),
    'no route expected',
  );
  rec(
    'channels',
    'publish listing to fake channel',
    [200, 201, 202],
    await api('POST', `/listings/${S.listingA}/channels/fake/publish`, {
      cookie: A.cookie,
      json: {},
    }),
  );
  rec(
    'channels',
    'publish listing to zap (no adapter)',
    [400, 409, 422, 501, 200, 201, 202],
    await api('POST', `/listings/${S.listingA}/channels/zap/publish`, {
      cookie: A.cookie,
      json: {},
    }),
    'recorded',
  );
  await sleep(6000);
  rec(
    'channels',
    'GET listing channels',
    200,
    await api('GET', `/listings/${S.listingA}/channels`, { cookie: A.cookie }),
  );
  info(
    'channels',
    'publication rows',
    sql(
      `select channel||':'||status||':'||coalesce(last_error,'-') from listing_channel_publications where listing_id='${S.listingA}'`,
    ),
  );

  // ───────────── S5 CRM ─────────────
  const ten = rec(
    'crm',
    'create tenant party',
    201,
    await api('POST', '/parties', {
      cookie: A.cookie,
      json: {
        type: 'PERSON',
        name: 'Locataria Audit',
        roles: ['TENANT'],
        identities: [
          { kind: 'CPF', value: cpfT },
          { kind: 'EMAIL', value: `t-${U}@example.com` },
        ],
      },
    }),
  );
  S.tenant = G(ten.body, 'party', 'id');
  const lead = rec(
    'crm',
    'create lead with interest + budget',
    201,
    await api('POST', '/leads', {
      cookie: A.cookie,
      json: {
        partyId: S.tenant,
        source: 'SITE',
        channel: 'web',
        interestedPropertyIds: [S.propA],
        budgetMinCents: 200000,
        budgetMaxCents: 300000,
        notes: 'lead audit',
      },
    }),
  );
  S.lead = G(lead.body, 'lead', 'id');
  rec(
    'crm',
    'GET /leads/:id (detail endpoint exists?)',
    [200, 404],
    await api('GET', `/leads/${S.lead}`, { cookie: A.cookie }),
    'no route expected',
  );
  rec(
    'crm',
    'lead invalid jump NEW -> WON',
    [409, 400, 422],
    await api('PATCH', `/leads/${S.lead}/status`, { cookie: A.cookie, json: { status: 'WON' } }),
  );
  for (const st of ['QUALIFYING', 'QUALIFIED', 'VISIT']) {
    rec(
      'crm',
      `lead -> ${st}`,
      200,
      await api('PATCH', `/leads/${S.lead}/status`, { cookie: A.cookie, json: { status: st } }),
    );
  }
  const task = rec(
    'crm',
    'create task',
    201,
    await api('POST', '/tasks', {
      cookie: A.cookie,
      json: {
        title: 'Ligar para locataria',
        dueAt: '2026-09-15T12:00:00Z',
        assigneeUserId: A.userId,
        relatedEntityType: 'lead',
        relatedEntityId: S.lead,
      },
    }),
  );
  S.task = G(task.body, 'task', 'id');
  rec(
    'crm',
    'task -> DONE',
    200,
    await api('PATCH', `/tasks/${S.task}/status`, { cookie: A.cookie, json: { status: 'DONE' } }),
  );
  rec(
    'crm',
    'task assignee from other org (B user)',
    [400, 404, 422, 201],
    await api('POST', '/tasks', {
      cookie: A.cookie,
      json: { title: 'x', assigneeUserId: B.userId },
    }),
    'cross-org assignee should be rejected',
  );
  const visit = rec(
    'crm',
    'create visit',
    201,
    await api('POST', '/visits', {
      cookie: A.cookie,
      json: { leadId: S.lead, propertyId: S.propA, scheduledAt: '2026-09-20T15:00:00Z' },
    }),
  );
  S.visit = G(visit.body, 'visit', 'id');
  rec(
    'crm',
    'PATCH /visits/:id (reschedule/cancel exists?)',
    [200, 404],
    await api('PATCH', `/visits/${S.visit}`, { cookie: A.cookie, json: { status: 'CANCELLED' } }),
    'no route expected',
  );
  rec(
    'crm',
    'PATCH /visits/:id/status exists?',
    [200, 404],
    await api('PATCH', `/visits/${S.visit}/status`, { cookie: A.cookie, json: { status: 'DONE' } }),
    'no route expected',
  );
  const prp = rec(
    'crm',
    'create proposal',
    201,
    await api('POST', '/proposals', {
      cookie: A.cookie,
      json: {
        leadId: S.lead,
        partyId: S.tenant,
        propertyId: S.propA,
        monthlyRentCents: 240000,
        terms: 'Garantia: seguro fiança',
        validUntil: '2026-09-30',
      },
    }),
  );
  S.proposal = G(prp.body, 'proposal', 'id');
  rec(
    'crm',
    'PATCH /proposals/:id/status (accept exists?)',
    [200, 404],
    await api('PATCH', `/proposals/${S.proposal}/status`, {
      cookie: A.cookie,
      json: { status: 'ACCEPTED' },
    }),
    'no route expected',
  );
  rec('crm', 'GET /timeline', 200, await api('GET', '/timeline', { cookie: A.cookie }));
  info(
    'crm',
    'timeline event types (org A)',
    sql(
      `select string_agg(distinct event_type, ',') from timeline_events where org_id='${A.orgId}'`,
    ),
  );

  // ───────────── S6 SCREENING ─────────────
  // LGPD gate on a separate party without consent
  const nc = await api('POST', '/parties', {
    cookie: A.cookie,
    json: {
      type: 'PERSON',
      name: 'Sem Consentimento',
      identities: [{ kind: 'CPF', value: cpf() }],
    },
  });
  const ncApp = await api('POST', '/rental-applications', {
    cookie: A.cookie,
    json: { partyId: G(nc.body, 'party', 'id'), propertyId: S.propA },
  });
  rec(
    'screening',
    'no-consent application -> SUBMITTED (LGPD gate)',
    [409, 400, 422],
    await api('PATCH', `/rental-applications/${G(ncApp.body, 'application', 'id')}/status`, {
      cookie: A.cookie,
      json: { status: 'SUBMITTED' },
    }),
  );
  rec(
    'screening',
    'no-consent application screening (LGPD gate)',
    [409, 400, 422, 403],
    await api('POST', `/rental-applications/${G(ncApp.body, 'application', 'id')}/screening`, {
      cookie: A.cookie,
      json: { provider: 'FAKE' },
    }),
  );
  rec(
    'screening',
    'create consent CREDIT_SCREENING',
    201,
    await api('POST', `/parties/${S.tenant}/consents`, {
      cookie: A.cookie,
      json: { purpose: 'CREDIT_SCREENING' },
    }),
  );
  const app = rec(
    'screening',
    'create rental application',
    201,
    await api('POST', '/rental-applications', {
      cookie: A.cookie,
      json: { partyId: S.tenant, propertyId: S.propA, leadId: S.lead, proposalId: S.proposal },
    }),
  );
  S.app = G(app.body, 'application', 'id');
  rec(
    'screening',
    'invalid transition DRAFT -> APPROVED (manual bypass)',
    [409, 400, 422],
    await api('PATCH', `/rental-applications/${S.app}/status`, {
      cookie: A.cookie,
      json: { status: 'APPROVED' },
    }),
  );
  rec(
    'screening',
    'application -> SUBMITTED',
    200,
    await api('PATCH', `/rental-applications/${S.app}/status`, {
      cookie: A.cookie,
      json: { status: 'SUBMITTED' },
    }),
  );
  rec(
    'screening',
    'screening WITH consent',
    [200, 201, 202],
    await api('POST', `/rental-applications/${S.app}/screening`, {
      cookie: A.cookie,
      json: { provider: 'FAKE' },
    }),
  );
  const pollApp = await poll(
    () => api('GET', `/rental-applications/${S.app}`, { cookie: A.cookie }),
    (r) => ['APPROVED', 'REJECTED', 'MANUAL_REVIEW'].includes(G(r.body, 'application', 'status')),
  );
  rec(
    'screening',
    'worker processed screening (poll)',
    () => pollApp.ok,
    { status: G(pollApp.last?.body, 'application', 'status'), body: pollApp.last?.body },
    `tries=${pollApp.tries}`,
  );
  if (G(pollApp.last?.body, 'application', 'status') === 'MANUAL_REVIEW') {
    rec(
      'screening',
      'HUMAN decision MANUAL_REVIEW -> APPROVED with reason',
      200,
      await api('PATCH', `/rental-applications/${S.app}/status`, {
        cookie: A.cookie,
        json: {
          status: 'APPROVED',
          decisionReason: 'Aprovado manualmente pelo analista (auditoria)',
        },
      }),
    );
  }
  info(
    'screening',
    'application decision fields',
    sql(
      `select status||' decidedBy='||coalesce(decided_by::text,'-')||' reason='||coalesce(decision_reason,'-') from rental_applications where id='${S.app}'`,
    ),
  );
  info(
    'screening',
    'screening_results',
    sql(
      `select coalesce(string_agg(coalesce(score::text,'-')||'/'||coalesce(decision,'-'),','),'none') from screening_results where application_id='${S.app}'`,
    ),
  );

  // ───────────── S7 CONTRACT + SIGNATURE ─────────────
  const tpl = rec(
    'contract',
    'create template',
    201,
    await api('POST', '/contract-templates', {
      cookie: A.cookie,
      json: {
        name: `Tpl ${U}`,
        body: 'LOCADOR {{landlordName}} LOCATARIO {{tenantName}} IMOVEL {{propertyTitle}} ALUGUEL {{monthlyRentCents}}',
      },
    }),
  );
  S.tpl = G(tpl.body, 'template', 'id');
  rec(
    'contract',
    'contract with DRAFT template (should fail)',
    [400, 409, 422],
    await api('POST', '/contracts', {
      cookie: A.cookie,
      json: { applicationId: S.app, templateId: S.tpl },
    }),
  );
  rec(
    'contract',
    'approve template',
    200,
    await api('PATCH', `/contract-templates/${S.tpl}/approve`, { cookie: A.cookie, json: {} }),
  );
  const ctr = rec(
    'contract',
    'create contract',
    201,
    await api('POST', '/contracts', {
      cookie: A.cookie,
      json: { applicationId: S.app, templateId: S.tpl },
    }),
  );
  S.contract = G(ctr.body, 'contract', 'id');
  const gen = rec(
    'contract',
    'generate contract',
    [200, 201],
    await api('POST', `/contracts/${S.contract}/generate`, { cookie: A.cookie, json: {} }),
  );
  info('contract', 'generated contract aggregate', gen.body);
  const snd = rec(
    'contract',
    'send for signature (FAKE)',
    201,
    await api('POST', `/contracts/${S.contract}/send-for-signature`, {
      cookie: A.cookie,
      json: {},
    }),
  );
  S.envelope = G(snd.body, 'envelope', 'providerEnvelopeId');
  rec(
    'webhook',
    'signature webhook WITHOUT token in dev',
    200,
    await api('POST', '/webhooks/signature', {
      json: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: `sig1-${U}`,
        providerEnvelopeId: S.envelope,
        signerOrder: 1,
      },
    }),
    'dev accepts unauthenticated',
  );
  rec(
    'webhook',
    'signature webhook replay same eventId',
    200,
    await api('POST', '/webhooks/signature', {
      json: {
        provider: 'FAKE',
        eventType: 'SIGNER_SIGNED',
        providerEventId: `sig1-${U}`,
        providerEnvelopeId: S.envelope,
        signerOrder: 1,
      },
    }),
  );
  info(
    'webhook',
    'webhook_inbox rows for sig1',
    sql(`select count(*) from webhook_inbox where provider_event_id='sig1-${U}'`),
  );
  await api('POST', '/webhooks/signature', {
    json: {
      provider: 'FAKE',
      eventType: 'SIGNER_SIGNED',
      providerEventId: `sig2-${U}`,
      providerEnvelopeId: S.envelope,
      signerOrder: 2,
    },
  });
  await api('POST', '/webhooks/signature', {
    json: {
      provider: 'FAKE',
      eventType: 'COMPLETED',
      providerEventId: `sigc-${U}`,
      providerEnvelopeId: S.envelope,
    },
  });
  const pollSig = await poll(
    () => api('GET', `/contracts/${S.contract}`, { cookie: A.cookie }),
    (r) => G(r.body, 'contract', 'status') === 'SIGNED',
  );
  rec(
    'contract',
    'contract reaches SIGNED via worker',
    () => pollSig.ok,
    { status: G(pollSig.last?.body, 'contract', 'status'), body: pollSig.last?.body },
    `tries=${pollSig.tries}`,
  );
  info(
    'contract',
    'signature_events',
    sql(
      `select coalesce(string_agg(event_type,','),'none') from signature_events se join signature_envelopes e on e.id=se.envelope_id where e.contract_id='${S.contract}'`,
    ),
  );

  // ───────────── S8 LEASE + FINANCE ─────────────
  const ls = rec(
    'finance',
    'create lease from SIGNED contract',
    201,
    await api('POST', '/leases', { cookie: A.cookie, json: { contractId: S.contract } }),
  );
  S.lease = G(ls.body, 'lease', 'id');
  rec(
    'finance',
    'duplicate lease same contract',
    [409, 400],
    await api('POST', '/leases', { cookie: A.cookie, json: { contractId: S.contract } }),
  );
  const leaseAgg = rec(
    'finance',
    'GET lease aggregate',
    200,
    await api('GET', `/leases/${S.lease}`, { cookie: A.cookie }),
  );
  info('finance', 'split rule on lease', G(leaseAgg.body, 'splitRule'));
  info('finance', 'lease core', {
    status: G(leaseAgg.body, 'lease', 'status'),
    rent: G(leaseAgg.body, 'lease', 'monthlyRentCents'),
    landlord: G(leaseAgg.body, 'lease', 'landlordPartyId'),
    tenant: G(leaseAgg.body, 'lease', 'tenantPartyId'),
  });
  const ch1 = rec(
    'finance',
    'create charge 2026-11',
    201,
    await api('POST', '/charges', {
      cookie: A.cookie,
      json: { leaseId: S.lease, periodStart: '2026-11-01' },
    }),
  );
  S.charge1 = G(ch1.body, 'charge', 'id');
  info('finance', 'charge1 breakdown', G(ch1.body, 'charge'));
  rec(
    'finance',
    'duplicate charge same period',
    [409, 400],
    await api('POST', '/charges', {
      cookie: A.cookie,
      json: { leaseId: S.lease, periodStart: '2026-11-01' },
    }),
  );
  const pay1 = rec(
    'finance',
    'initiate PIX payment charge1',
    201,
    await api('POST', `/charges/${S.charge1}/payment`, {
      cookie: A.cookie,
      json: { method: 'PIX' },
    }),
  );
  S.provCharge1 = G(pay1.body, 'providerChargeId');
  const pay1b = await api('POST', `/charges/${S.charge1}/payment`, {
    cookie: A.cookie,
    json: { method: 'PIX' },
  });
  rec(
    'finance',
    'initiate payment AGAIN (idempotency)',
    [200, 201, 409],
    pay1b,
    `sameProviderId=${G(pay1b.body, 'providerChargeId') === S.provCharge1}`,
  );
  info(
    'finance',
    'payments rows for charge1',
    sql(
      `select count(*)||' rows; statuses='||string_agg(status,',') from payments where charge_id='${S.charge1}'`,
    ),
  );
  rec(
    'webhook',
    'payment webhook FAKE confirmed (dev, no token)',
    200,
    await api('POST', '/webhooks/payments', {
      json: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `pay1-${U}`,
        providerChargeId: S.provCharge1,
        amountCents: 250000,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    }),
  );
  rec(
    'webhook',
    'payment webhook replay same eventId',
    200,
    await api('POST', '/webhooks/payments', {
      json: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `pay1-${U}`,
        providerChargeId: S.provCharge1,
        amountCents: 250000,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    }),
  );
  rec(
    'webhook',
    'payment webhook same payment NEW eventId',
    200,
    await api('POST', '/webhooks/payments', {
      json: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `pay1b-${U}`,
        providerChargeId: S.provCharge1,
        amountCents: 250000,
        paidAt: '2026-11-05T00:00:00.000Z',
      },
    }),
  );
  const pollPaid = await poll(
    () => api('GET', `/charges/${S.charge1}`, { cookie: A.cookie }),
    (r) => G(r.body, 'charge', 'status') === 'PAID',
    15,
  );
  rec(
    'finance',
    'charge1 PAID cross-process (API fake vs worker fake)',
    () => pollPaid.ok,
    { status: G(pollPaid.last?.body, 'charge', 'status'), body: G(pollPaid.last?.body, 'charge') },
    `tries=${pollPaid.tries}`,
  );
  info(
    'finance',
    'webhook_inbox payment rows',
    sql(
      `select string_agg(provider_event_id||':'||status||':'||attempts||':'||coalesce(left(last_error,120),'-'), ' | ') from webhook_inbox where provider_event_id like 'pay1%-${U}'`,
    ),
  );
  info(
    'finance',
    'payments after webhooks',
    sql(
      `select string_agg(status||':'||amount_cents, ',') from payments where charge_id='${S.charge1}'`,
    ),
  );
  info(
    'finance',
    'ledger entries (org A)',
    sql(`select count(*) from ledger_entries where org_id='${A.orgId}'`),
  );
  const ch2 = rec(
    'finance',
    'create charge 2026-12',
    201,
    await api('POST', '/charges', {
      cookie: A.cookie,
      json: { leaseId: S.lease, periodStart: '2026-12-01' },
    }),
  );
  S.charge2 = G(ch2.body, 'charge', 'id');
  const man = await api('POST', `/charges/${S.charge2}/payment`, {
    cookie: A.cookie,
    json: { method: 'MANUAL' },
  });
  rec(
    'finance',
    'MANUAL payment method (manual credit path?)',
    [201, 400, 409, 422],
    man,
    'recorded',
  );
  info(
    'finance',
    'charge2 status after MANUAL',
    sql(`select status from charges where id='${S.charge2}'`),
  );
  rec(
    'finance',
    'refund on unpaid charge2',
    [409, 400, 422],
    await api('POST', `/charges/${S.charge2}/refund`, { cookie: A.cookie, json: {} }),
  );
  const ch3 = await api('POST', '/charges', {
    cookie: A.cookie,
    json: { leaseId: S.lease, periodStart: '2027-01-01' },
  });
  S.charge3 = G(ch3.body, 'charge', 'id');
  rec(
    'finance',
    'cancel charge3',
    200,
    await api('POST', `/charges/${S.charge3}/cancel`, { cookie: A.cookie, json: {} }),
  );
  rec(
    'finance',
    'payment on CANCELLED charge3',
    [409, 400, 422],
    await api('POST', `/charges/${S.charge3}/payment`, {
      cookie: A.cookie,
      json: { method: 'PIX' },
    }),
  );
  rec(
    'finance',
    'charge override negative amount',
    400,
    await api('POST', '/charges', {
      cookie: A.cookie,
      json: { leaseId: S.lease, periodStart: '2027-02-01', amountOverrideCents: -100 },
    }),
  );
  rec('finance', 'GET /payments', 200, await api('GET', '/payments', { cookie: A.cookie }));
  rec('finance', 'GET /payouts', 200, await api('GET', '/payouts', { cookie: A.cookie }));
  rec(
    'finance',
    'GET /ledger/accounts',
    200,
    await api('GET', '/ledger/accounts', { cookie: A.cookie }),
  );
  rec(
    'finance',
    'GET /ledger/entries',
    200,
    await api('GET', '/ledger/entries', { cookie: A.cookie }),
  );
  rec(
    'finance',
    'POST /reconciliations',
    [200, 201, 202, 400],
    await api('POST', '/reconciliations', {
      cookie: A.cookie,
      json: { provider: 'FAKE', periodStart: '2026-11-01', periodEnd: '2026-11-30' },
    }),
    'recorded',
  );
  rec(
    'finance',
    'GET /reconciliations',
    200,
    await api('GET', '/reconciliations', { cookie: A.cookie }),
  );
  rec(
    'finance',
    'create bank account landlord1',
    [201, 200],
    await api('POST', '/bank-accounts', {
      cookie: A.cookie,
      json: {
        partyId: S.landlord1,
        bankCode: '001',
        branch: '1234',
        accountNumber: '123456',
        accountDigit: '7',
        holderName: 'Proprietario Um Audit',
        holderDocument: S.cpfL1,
      },
    }),
  );
  rec(
    'finance',
    'bank account invalid holder document',
    [400, 422],
    await api('POST', '/bank-accounts', {
      cookie: A.cookie,
      json: { partyId: S.landlord1, bankCode: '001', holderName: 'X', holderDocument: '111' },
    }),
  );
  rec(
    'finance',
    'GET /bank-accounts (list exists?)',
    [200, 404],
    await api('GET', '/bank-accounts', { cookie: A.cookie }),
    'no route expected',
  );
  rec(
    'finance',
    'split rule endpoint exists? (POST /leases/:id/split-rule)',
    [404, 200, 201],
    await api('POST', `/leases/${S.lease}/split-rule`, {
      cookie: A.cookie,
      json: { agencyShareBps: 1000 },
    }),
    'no route expected',
  );

  // ───────────── S9 PORTAL ─────────────
  const acc = rec(
    'portal',
    'grant TENANT portal access',
    201,
    await api('POST', '/portal/access', {
      cookie: A.cookie,
      json: { partyId: S.tenant, kind: 'TENANT' },
    }),
  );
  const tok = G(acc.body, 'oneTimeToken');
  info(
    'portal',
    'grant response keys (token exposed to backoffice user?)',
    Object.keys(acc.body ?? {}),
  );
  const cons = rec(
    'portal',
    'consume one-time token',
    200,
    await api('POST', '/portal/auth/consume', { json: { token: tok } }),
  );
  const portalT = cookieFrom(cons);
  info('portal', 'portal set-cookie attrs', (cons.headers.getSetCookie?.() ?? []).join(' || '));
  rec(
    'portal',
    'consume same token again (one-time)',
    [401, 403, 404, 410],
    await api('POST', '/portal/auth/consume', { json: { token: tok } }),
  );
  rec('portal', 'GET /portal/me', 200, await api('GET', '/portal/me', { cookie: portalT }));
  const stmt = rec(
    'portal',
    'tenant statement',
    200,
    await api('GET', '/portal/tenant/statement', { cookie: portalT }),
  );
  info('portal', 'tenant statement totals', G(stmt.body, 'totals'));
  rec(
    'portal',
    'tenant charges',
    200,
    await api('GET', '/portal/tenant/charges', { cookie: portalT }),
  );
  rec(
    'portal',
    'tenant contracts',
    200,
    await api('GET', '/portal/tenant/contracts', { cookie: portalT }),
  );
  rec(
    'portal',
    'tenant contract detail',
    200,
    await api('GET', `/portal/tenant/contracts/${S.contract}`, { cookie: portalT }),
  );
  rec(
    'portal',
    'tenant inspections',
    200,
    await api('GET', '/portal/tenant/inspections', { cookie: portalT }),
  );
  rec(
    'portal',
    'tenant QR payment via portal',
    [200, 201, 409],
    await api('POST', `/portal/tenant/charges/${S.charge1}/payment`, {
      cookie: portalT,
      json: { method: 'PIX' },
    }),
    'recorded',
  );
  rec(
    'portal',
    'tenant cookie -> landlord endpoint',
    [401, 403],
    await api('GET', '/portal/landlord/properties', { cookie: portalT }),
  );
  rec(
    'portal',
    'portal cookie -> backoffice /properties',
    401,
    await api('GET', '/properties', { cookie: portalT }),
  );
  rec(
    'portal',
    'backoffice cookie -> /portal/tenant/statement',
    401,
    await api('GET', '/portal/tenant/statement', { cookie: A.cookie }),
  );
  const accL = rec(
    'portal',
    'grant LANDLORD access landlord1',
    201,
    await api('POST', '/portal/access', {
      cookie: A.cookie,
      json: { partyId: S.landlord1, kind: 'LANDLORD' },
    }),
  );
  const consL = await api('POST', '/portal/auth/consume', {
    json: { token: G(accL.body, 'oneTimeToken') },
  });
  const portalL = cookieFrom(consL);
  const lprops = rec(
    'portal',
    'landlord properties',
    200,
    await api('GET', '/portal/landlord/properties', { cookie: portalL }),
  );
  info('portal', 'landlord sees properties', lprops.body);
  rec(
    'portal',
    'landlord statement',
    200,
    await api('GET', '/portal/landlord/statement', { cookie: portalL }),
  );
  rec(
    'portal',
    'landlord contracts',
    200,
    await api('GET', '/portal/landlord/contracts', { cookie: portalL }),
  );
  rec(
    'portal',
    'landlord inspections',
    200,
    await api('GET', '/portal/landlord/inspections', { cookie: portalL }),
  );
  // second tenant in same org, must not see tenant1 contract
  const t2 = await api('POST', '/parties', {
    cookie: A.cookie,
    json: { type: 'PERSON', name: 'Outra Locataria', identities: [{ kind: 'CPF', value: cpf() }] },
  });
  const acc2 = await api('POST', '/portal/access', {
    cookie: A.cookie,
    json: { partyId: G(t2.body, 'party', 'id'), kind: 'TENANT' },
  });
  const cons2 = await api('POST', '/portal/auth/consume', {
    json: { token: G(acc2.body, 'oneTimeToken') },
  });
  const portalT2 = cookieFrom(cons2);
  rec(
    'portal',
    'tenant2 reads tenant1 contract',
    [403, 404],
    await api('GET', `/portal/tenant/contracts/${S.contract}`, { cookie: portalT2 }),
  );
  rec(
    'portal',
    'tenant2 pays tenant1 charge',
    [403, 404],
    await api('POST', `/portal/tenant/charges/${S.charge1}/payment`, {
      cookie: portalT2,
      json: { method: 'PIX' },
    }),
  );
  rec(
    'portal',
    'tenant2 statement is empty',
    (r) => r.status === 200 && G(r.body, 'totals', 'billedCents') === 0,
    await api('GET', '/portal/tenant/statement', { cookie: portalT2 }),
  );
  rec(
    'portal',
    'portal logout',
    200,
    await api('POST', '/portal/auth/logout', { cookie: portalT2, json: {} }),
  );
  rec(
    'portal',
    'portal cookie after logout',
    401,
    await api('GET', '/portal/me', { cookie: portalT2 }),
  );

  // ───────────── S10 INSPECTION ─────────────
  const ins = rec(
    'inspection',
    'create CHECKIN inspection',
    201,
    await api('POST', '/inspections', {
      cookie: A.cookie,
      json: {
        propertyId: S.propA,
        type: 'CHECKIN',
        scheduledAt: '2026-10-01T10:00:00Z',
        notes: 'entrada',
      },
    }),
  );
  S.insp = G(ins.body, 'inspection', 'id');
  const room = rec(
    'inspection',
    'add room',
    201,
    await api('POST', `/inspections/${S.insp}/rooms`, { cookie: A.cookie, json: { name: 'Sala' } }),
  );
  S.room = G(room.body, 'room', 'id');
  rec(
    'inspection',
    'invalid transition DRAFT -> COMPLETED',
    [409, 400, 422],
    await api('PATCH', `/inspections/${S.insp}/status`, {
      cookie: A.cookie,
      json: { status: 'COMPLETED' },
    }),
  );
  rec(
    'inspection',
    'DRAFT -> CAPTURING',
    200,
    await api('PATCH', `/inspections/${S.insp}/status`, {
      cookie: A.cookie,
      json: { status: 'CAPTURING' },
    }),
  );
  rec(
    'inspection',
    'add observation',
    201,
    await api('POST', `/inspections/${S.insp}/observations`, {
      cookie: A.cookie,
      json: { roomId: S.room, category: 'DAMAGE', severity: 'LOW', description: 'Risco na parede' },
    }),
  );
  rec(
    'inspection',
    'media upload-url (storage not configured)',
    [400, 200, 201],
    await api('POST', `/inspections/${S.insp}/media/upload-url`, {
      cookie: A.cookie,
      json: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 1000, roomId: S.room },
    }),
    'recorded',
  );
  rec(
    'inspection',
    'process (AI pipeline)',
    [200, 201, 202, 409],
    await api('POST', `/inspections/${S.insp}/process`, { cookie: A.cookie, json: {} }),
    'recorded',
  );
  await sleep(4000);
  const insAfter = await api('GET', `/inspections/${S.insp}`, { cookie: A.cookie });
  info('inspection', 'status after process', G(insAfter.body, 'inspection', 'status'));
  for (const st of ['REVIEW', 'COMPLETED']) {
    rec(
      'inspection',
      `-> ${st}`,
      [200, 409],
      await api('PATCH', `/inspections/${S.insp}/status`, {
        cookie: A.cookie,
        json: { status: st },
      }),
      'recorded',
    );
  }
  rec(
    'inspection',
    'review',
    200,
    await api('GET', `/inspections/${S.insp}/review`, { cookie: A.cookie }),
  );
  rec(
    'inspection',
    'report',
    [200, 409],
    await api('GET', `/inspections/${S.insp}/report`, { cookie: A.cookie }),
  );
  const out = await api('POST', '/inspections', {
    cookie: A.cookie,
    json: { propertyId: S.propA, type: 'CHECKOUT' },
  });
  S.inspOut = G(out.body, 'inspection', 'id');
  rec(
    'inspection',
    'compare checkin x checkout',
    [200, 201, 409],
    await api('POST', `/inspections/${S.insp}/compare`, {
      cookie: A.cookie,
      json: { checkoutInspectionId: S.inspOut },
    }),
    'recorded',
  );

  // ───────────── S11 CROSS-TENANT (B attacks A) ─────────────
  const x = async (step, method, path, json, expect = [403, 404]) =>
    rec('cross-tenant', step, expect, await api(method, path, { cookie: B.cookie, json }));
  await x('GET property A', 'GET', `/properties/${S.propA}`);
  await x('PATCH property A', 'PATCH', `/properties/${S.propA}`, { title: 'HACKED' });
  await x('PUT financial terms A', 'PUT', `/properties/${S.propA}/financial-terms`, {
    monthlyRentCents: 1,
  });
  await x('PUT address A', 'PUT', `/properties/${S.propA}/address`, {
    publicAddress: { city: 'HACK' },
  });
  await x('POST owner on A', 'POST', `/properties/${S.propA}/owners`, { partyId: S.landlord1 });
  await x('DELETE owner of A', 'DELETE', `/properties/${S.propA}/owners/${S.landlord1}`);
  await x('DELETE media of A', 'DELETE', `/properties/${S.propA}/media/${S.mediaId}`);
  await x('POST feature on A', 'POST', `/properties/${S.propA}/features`, { feature: 'hack' });
  await x('GET listing A', 'GET', `/listings/${S.listingA}`);
  await x('PATCH listing A status', 'PATCH', `/listings/${S.listingA}/status`, {
    status: 'ARCHIVED',
  });
  await x('PATCH listing A', 'PATCH', `/listings/${S.listingA}`, { title: 'HACKED' });
  await x(
    'publish listing A to channel',
    'POST',
    `/listings/${S.listingA}/channels/fake/publish`,
    {},
  );
  await x('GET listing A channels', 'GET', `/listings/${S.listingA}/channels`);
  await x('GET lease A', 'GET', `/leases/${S.lease}`);
  await x('GET charge A', 'GET', `/charges/${S.charge1}`);
  await x('pay charge A', 'POST', `/charges/${S.charge1}/payment`, { method: 'PIX' });
  await x('cancel charge A', 'POST', `/charges/${S.charge2}/cancel`, {});
  await x('refund charge A', 'POST', `/charges/${S.charge1}/refund`, {});
  await x('GET contract A', 'GET', `/contracts/${S.contract}`);
  await x('generate contract A', 'POST', `/contracts/${S.contract}/generate`, {});
  await x('PATCH contract A status', 'PATCH', `/contracts/${S.contract}/status`, {
    status: 'VOID',
  });
  await x(
    'send contract A for signature',
    'POST',
    `/contracts/${S.contract}/send-for-signature`,
    {},
  );
  await x('GET application A', 'GET', `/rental-applications/${S.app}`);
  await x('PATCH application A status', 'PATCH', `/rental-applications/${S.app}/status`, {
    status: 'REJECTED',
  });
  await x('screening on application A', 'POST', `/rental-applications/${S.app}/screening`, {
    provider: 'FAKE',
  });
  await x('GET inspection A', 'GET', `/inspections/${S.insp}`);
  await x('add room to inspection A', 'POST', `/inspections/${S.insp}/rooms`, { name: 'hack' });
  await x('PATCH inspection A status', 'PATCH', `/inspections/${S.insp}/status`, {
    status: 'SIGNED',
  });
  await x('PATCH lead A status', 'PATCH', `/leads/${S.lead}/status`, { status: 'LOST' });
  await x('PATCH task A status', 'PATCH', `/tasks/${S.task}/status`, { status: 'CANCELLED' });
  await x('GET consents of party A', 'GET', `/parties/${S.tenant}/consents`);
  await x('create consent for party A', 'POST', `/parties/${S.tenant}/consents`, {
    purpose: 'CREDIT_SCREENING',
  });
  await x('approve template A', 'PATCH', `/contract-templates/${S.tpl}/approve`, {});
  await x('new version of template A', 'POST', `/contract-templates/${S.tpl}/versions`, {
    body: 'hack',
  });
  // IDOR by reference (B creates resources pointing at A ids)
  await x(
    'REF: lead with partyId of A',
    'POST',
    '/leads',
    { partyId: S.tenant, interestedPropertyIds: [S.propA] },
    [400, 403, 404, 422],
  );
  await x(
    'REF: visit on A lead/property',
    'POST',
    '/visits',
    { leadId: S.lead, propertyId: S.propA, scheduledAt: '2026-09-21T10:00:00Z' },
    [400, 403, 404, 422],
  );
  await x(
    'REF: proposal on A property',
    'POST',
    '/proposals',
    { propertyId: S.propA, partyId: S.tenant, monthlyRentCents: 1000 },
    [400, 403, 404, 422],
  );
  await x(
    'REF: listing on A property',
    'POST',
    '/listings',
    { propertyId: S.propA, title: 'hack', description: 'hack' },
    [400, 403, 404, 422],
  );
  await x(
    'REF: application on A party/property',
    'POST',
    '/rental-applications',
    { partyId: S.tenant, propertyId: S.propA },
    [400, 403, 404, 422],
  );
  await x(
    'REF: inspection on A property',
    'POST',
    '/inspections',
    { propertyId: S.propA, type: 'CHECKIN' },
    [400, 403, 404, 422],
  );
  await x(
    'REF: contract from A application+template',
    'POST',
    '/contracts',
    { applicationId: S.app, templateId: S.tpl },
    [400, 403, 404, 422],
  );
  await x(
    'REF: lease from A contract',
    'POST',
    '/leases',
    { contractId: S.contract },
    [400, 403, 404, 409, 422],
  );
  await x(
    'REF: charge on A lease',
    'POST',
    '/charges',
    { leaseId: S.lease, periodStart: '2027-03-01' },
    [400, 403, 404, 422],
  );
  await x(
    'REF: bank account for A party',
    'POST',
    '/bank-accounts',
    { partyId: S.landlord1, bankCode: '001', holderName: 'hack', holderDocument: S.cpfL1 },
    [400, 403, 404, 422],
  );
  await x(
    'REF: portal access for A party',
    'POST',
    '/portal/access',
    { partyId: S.tenant, kind: 'TENANT' },
    [400, 403, 404, 422],
  );
  await x(
    'REF: task assigned to A user',
    'POST',
    '/tasks',
    { title: 'x', assigneeUserId: A.userId },
    [400, 403, 404, 422],
  );
  await x('REF: compare with A inspection', 'POST', `/inspections/${S.insp}/compare`, {
    checkoutInspectionId: S.inspOut,
  });
  // ── Impact of IDOR-by-reference: can B READ A's data through B-owned rows? ──
  const secrets = [
    'Locataria Audit',
    cpfT,
    `t-${U}@example.com`,
    'Apto Audit',
    'Rua Secreta Privada',
    'Proprietario Um',
  ];
  const leakCheck = (label, res) => {
    const txt = JSON.stringify(res.body);
    const found = secrets.filter((s) => txt.includes(s));
    rec('idor-impact', label, () => found.length === 0, {
      status: found.length ? `LEAK(${res.status})` : res.status,
      body: { found, sample: txt.slice(0, 400) },
    });
  };
  const bApp = await api('POST', '/rental-applications', {
    cookie: B.cookie,
    json: { partyId: S.tenant, propertyId: S.propA },
  });
  S.bApp = G(bApp.body, 'application', 'id');
  leakCheck(
    'B GET own application pointing to A party',
    await api('GET', `/rental-applications/${S.bApp}`, { cookie: B.cookie }),
  );
  leakCheck('B list applications', await api('GET', '/rental-applications', { cookie: B.cookie }));
  leakCheck('B list visits', await api('GET', '/visits', { cookie: B.cookie }));
  leakCheck('B list proposals', await api('GET', '/proposals', { cookie: B.cookie }));
  leakCheck('B list leads', await api('GET', '/leads', { cookie: B.cookie }));
  const bInsp = await api('POST', '/inspections', {
    cookie: B.cookie,
    json: { propertyId: S.propA, type: 'CHECKIN' },
  });
  S.bInsp = G(bInsp.body, 'inspection', 'id');
  leakCheck(
    'B GET own inspection on A property',
    await api('GET', `/inspections/${S.bInsp}`, { cookie: B.cookie }),
  );
  leakCheck(
    'B GET own inspection report',
    await api('GET', `/inspections/${S.bInsp}/report`, { cookie: B.cookie }),
  );
  leakCheck('B list inspections', await api('GET', '/inspections', { cookie: B.cookie }));
  const bSub = await api('PATCH', `/rental-applications/${S.bApp}/status`, {
    cookie: B.cookie,
    json: { status: 'SUBMITTED' },
  });
  rec(
    'idor-impact',
    'B submits application for A party (uses A consent?)',
    [409, 400, 422, 403, 404],
    bSub,
    'LGPD consent must be org-scoped',
  );
  const bScr = await api('POST', `/rental-applications/${S.bApp}/screening`, {
    cookie: B.cookie,
    json: { provider: 'FAKE' },
  });
  rec(
    'idor-impact',
    'B requests CREDIT SCREENING of A party',
    [409, 400, 422, 403, 404],
    bScr,
    'P0 if accepted',
  );
  if (bScr.status >= 200 && bScr.status < 300) {
    await sleep(8000);
    leakCheck(
      'B reads screening result of A party',
      await api('GET', `/rental-applications/${S.bApp}`, { cookie: B.cookie }),
    );
  }
  const bTpl = await api('POST', '/contract-templates', {
    cookie: B.cookie,
    json: {
      name: `TplB ${U}`,
      body: 'LOCATARIO {{tenantName}} DOC {{tenantDocument}} IMOVEL {{propertyTitle}} END {{propertyAddress}}',
    },
  });
  await api('PATCH', `/contract-templates/${G(bTpl.body, 'template', 'id')}/approve`, {
    cookie: B.cookie,
    json: {},
  });
  const bCtr = await api('POST', '/contracts', {
    cookie: B.cookie,
    json: { applicationId: S.bApp, templateId: G(bTpl.body, 'template', 'id') },
  });
  rec(
    'idor-impact',
    'B creates contract from app pointing to A party',
    [409, 400, 422, 403, 404],
    bCtr,
    'recorded',
  );
  if (G(bCtr.body, 'contract', 'id')) {
    const bGen = await api('POST', `/contracts/${G(bCtr.body, 'contract', 'id')}/generate`, {
      cookie: B.cookie,
      json: {},
    });
    leakCheck('B generated contract body renders A data', bGen);
  }
  const bProps = await api('GET', '/properties', { cookie: B.cookie });
  rec(
    'cross-tenant',
    'B property list contains no A data',
    (r) => !JSON.stringify(r.body).includes(S.propA),
    bProps,
  );
  const bLeads = await api('GET', '/leads', { cookie: B.cookie });
  rec(
    'cross-tenant',
    'B lead list contains no A data',
    (r) => !JSON.stringify(r.body).includes(S.lead),
    bLeads,
  );
  const bExport = await api('GET', '/reporting/export/leads', { cookie: B.cookie });
  rec(
    'cross-tenant',
    'B export contains no A data',
    (r) => !JSON.stringify(r.body).includes(S.lead) && !String(r.body).includes(S.lead),
    bExport,
    `status ${bExport.status}`,
  );
  info(
    'cross-tenant',
    'DB state of A after attacks',
    sql(
      `select 'title='||title from properties where id='${S.propA}' union all select 'owners='||count(*) from property_owners where property_id='${S.propA}' union all select 'listing='||status from listings where id='${S.listingA}' union all select 'contract='||status from contracts where id='${S.contract}' union all select 'app='||status from rental_applications where id='${S.app}' union all select 'lead='||status from leads where id='${S.lead}' union all select 'charge2='||status from charges where id='${S.charge2}' union all select 'B-created leases='||count(*) from leases where org_id='${B.orgId}' union all select 'B-created charges='||count(*) from charges where org_id='${B.orgId}' union all select 'B rows referencing A property='||count(*) from visits where org_id='${B.orgId}'`,
    ),
  );

  // ───────────── S12 WEBHOOK SURFACE ─────────────
  rec(
    'webhook',
    'whatsapp verify without configured token',
    [403, 400, 401, 500],
    await api('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123'),
  );
  rec(
    'webhook',
    'whatsapp POST unsigned (dev)',
    [200, 401, 403],
    await api('POST', '/webhooks/whatsapp', {
      json: { object: 'whatsapp_business_account', entry: [] },
    }),
    'recorded',
  );
  rec(
    'webhook',
    'meta POST unsigned (dev)',
    [200, 401, 403],
    await api('POST', '/webhooks/meta', { json: { object: 'page', entry: [] } }),
    'recorded',
  );
  rec(
    'webhook',
    'payment webhook malformed',
    400,
    await api('POST', '/webhooks/payments', { json: { provider: 'FAKE' } }),
  );
  rec(
    'webhook',
    'payment webhook unknown provider charge',
    [200, 202],
    await api('POST', '/webhooks/payments', {
      json: {
        provider: 'FAKE',
        eventType: 'PAYMENT_CONFIRMED',
        providerEventId: `ghost-${U}`,
        providerChargeId: 'fake_ch_does_not_exist',
        amountCents: 999999,
      },
    }),
  );

  // ───────────── S13 AUDIT TRAIL ─────────────
  info(
    'audit',
    'audit_events by action (org A)',
    sql(
      `select string_agg(action||'='||n, ', ') from (select action, count(*) n from audit_events where org_id='${A.orgId}' group by action order by action) t`,
    ),
  );
  info(
    'audit',
    'audit_events metadata sample (PII?)',
    sql(
      `select left(payload::text, 400) from audit_events where org_id='${A.orgId}' and payload is not null order by occurred_at desc limit 3`,
    ),
  );

  // ───────────── S14 LAST OWNER / RATE LIMIT (destructive-ish, last) ─────────────
  rec(
    'rbac',
    'owner A demotes itself (last owner)',
    [400, 409, 422, 403],
    await api('PATCH', `/organizations/${A.orgId}/members/${A.userId}`, {
      cookie: A.cookie,
      json: { role: 'viewer' },
    }),
    'last-owner protection',
  );
  rec(
    'rbac',
    'owner A removes itself (last owner)',
    [400, 409, 422, 403],
    await api('DELETE', `/organizations/${A.orgId}/members/${A.userId}`, { cookie: A.cookie }),
    'last-owner protection',
  );
  let limited = null;
  for (let i = 0; i < 12; i++) {
    const r = await api('POST', '/auth/login', {
      json: { email: `nobody-${U}@example.com`, password: 'x-wrong-pass' },
    });
    if (r.status === 429) {
      limited = i + 1;
      break;
    }
  }
  rec('auth', 'login rate limit triggers 429', () => limited !== null, {
    status: limited ? 429 : 'none',
    body: { attemptsUntil429: limited },
  });

  writeFileSync(`${SP}/probe_state.json`, JSON.stringify(S, null, 2));
  console.log('DONE');
}

main().catch((err) => {
  console.error('PROBE CRASH', err);
  writeFileSync(`${SP}/probe_state.json`, JSON.stringify(S, null, 2));
  process.exit(1);
});
