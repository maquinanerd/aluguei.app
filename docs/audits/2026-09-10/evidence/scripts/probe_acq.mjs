// Audit 2026-09-10 — acquisition journeys (WhatsApp inbound FAKE, channel FAKE import, Meta dry-run).
// No external effects: META_MODE=dry_run, FakeWhatsAppMessenger, FakeChannel.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'http://127.0.0.1:4100';
const SP =
  'C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad';
const OUT = `${SP}/probe_acq_results.jsonl`;
const PSQL = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
writeFileSync(OUT, '');
const S = JSON.parse(readFileSync(`${SP}/probe_state.json`, 'utf8'));
const U = Date.now().toString(36);
const G = (o, ...p) => p.reduce((a, k) => (a == null ? undefined : a[k]), o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function trunc(b) {
  const s = typeof b === 'string' ? b : JSON.stringify(b);
  return s && s.length > 600 ? `${s.slice(0, 600)}…` : s;
}
function rec(section, step, expect, res, note = '') {
  const ok =
    typeof expect === 'function'
      ? Boolean(expect(res))
      : Array.isArray(expect)
        ? expect.includes(res.status)
        : res.status === expect;
  appendFileSync(
    OUT,
    `${JSON.stringify({ section, step, status: res.status, ok, note, body: trunc(res.body) })}\n`,
  );
  console.log(
    `${ok ? 'PASS' : 'FAIL'} [${section}] ${step} -> ${res.status} ${note} ${ok ? '' : trunc(res.body)}`,
  );
  return res;
}
function info(section, step, v) {
  appendFileSync(
    OUT,
    `${JSON.stringify({ section, step, status: 'INFO', ok: true, body: trunc(v) })}\n`,
  );
  console.log(`INFO [${section}] ${step}: ${trunc(v)}`);
}
async function api(method, path, { json, cookie } = {}) {
  const h = {};
  if (json !== undefined) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  const res = await fetch(API + path, {
    method,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const t = await res.text();
  let body;
  try {
    body = JSON.parse(t);
  } catch {
    body = t;
  }
  return { status: res.status, body, headers: res.headers };
}
function sql(q) {
  try {
    return execFileSync(
      PSQL,
      ['-h', 'localhost', '-p', '55432', '-U', 'postgres', '-d', 'aluguei_audit', '-tA', '-c', q],
      { encoding: 'utf8' },
    ).trim();
  } catch (e) {
    return `SQL_ERROR ${String(e.message).slice(0, 200)}`;
  }
}

async function main() {
  const login = await api('POST', '/auth/login', {
    json: { email: S.A.email, password: 'audit-pass-123' },
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  rec('acq', 'login A', 200, login);
  const orgId = S.A.orgId;

  // ── A) WhatsApp inbound (FAKE messenger, unsigned in dev) → conversation → intent → lead
  const phone = `audit-${U}`;
  rec(
    'whatsapp',
    'create WhatsApp connection',
    [200, 201],
    await api('POST', '/whatsapp/connections', { cookie, json: { phoneNumberId: phone } }),
  );
  const leadsBefore = Number(sql(`select count(*) from leads where org_id='${orgId}'`));
  const partiesBefore = Number(sql(`select count(*) from parties where org_id='${orgId}'`));
  const wa = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phone },
              contacts: [{ profile: { name: 'Lead WhatsApp Audit' }, wa_id: '5511988887777' }],
              messages: [
                {
                  from: '5511988887777',
                  id: `wamid.audit.${U}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: {
                    body: 'Olá! Quero alugar apartamento de 2 quartos em São Paulo, orçamento até R$ 3.000. Posso visitar sábado?',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  rec(
    'whatsapp',
    'inbound webhook (unsigned, dev)',
    200,
    await api('POST', '/webhooks/whatsapp', { json: wa }),
  );
  rec(
    'whatsapp',
    'same webhook replay (dedup)',
    200,
    await api('POST', '/webhooks/whatsapp', { json: wa }),
  );
  info(
    'whatsapp',
    'inbox rows for message',
    sql(
      `select count(*)||' rows; status='||string_agg(status,',') from webhook_inbox where provider='WHATSAPP' and provider_event_id='wamid.audit.${U}'`,
    ),
  );
  await sleep(12000);
  info(
    'whatsapp',
    'inbox after worker',
    sql(
      `select status||' attempts='||attempts||' err='||coalesce(left(last_error,150),'-') from webhook_inbox where provider='WHATSAPP' and provider_event_id='wamid.audit.${U}'`,
    ),
  );
  const conv = await api('GET', '/conversations', { cookie });
  rec('whatsapp', 'GET /conversations', 200, conv);
  const convId = G(conv.body, 'conversations', 0, 'id');
  info(
    'whatsapp',
    'conversation rows',
    sql(
      `select status||' lead='||coalesce(lead_id::text,'-')||' party='||coalesce(party_id::text,'-') from conversations where org_id='${orgId}' order by created_at desc limit 1`,
    ),
  );
  info(
    'whatsapp',
    'messages (direction/body)',
    sql(
      `select string_agg(direction||':'||left(coalesce(body,''),80), ' || ' order by created_at) from messages where org_id='${orgId}'`,
    ),
  );
  info(
    'whatsapp',
    'intents',
    sql(
      `select string_agg(coalesce(intent,'-')||' conf='||coalesce(confidence::text,'-')||' budgetMax='||coalesce(budget_max_cents::text,'-'), ' | ') from conversation_intents where org_id='${orgId}'`,
    ),
  );
  info(
    'whatsapp',
    'leads delta / parties delta',
    `${Number(sql(`select count(*) from leads where org_id='${orgId}'`)) - leadsBefore} / ${Number(sql(`select count(*) from parties where org_id='${orgId}'`)) - partiesBefore}`,
  );
  info(
    'whatsapp',
    'visits auto-created by bot',
    sql(
      `select count(*) from visits where org_id='${orgId}' and created_at > now() - interval '5 minutes'`,
    ),
  );
  if (convId) {
    rec(
      'whatsapp',
      'GET messages',
      200,
      await api('GET', `/conversations/${convId}/messages`, { cookie }),
    );
    rec(
      'whatsapp',
      'GET intents',
      200,
      await api('GET', `/conversations/${convId}/intents`, { cookie }),
    );
    rec(
      'whatsapp',
      'send message (FAKE messenger)',
      [200, 201],
      await api('POST', `/conversations/${convId}/messages`, {
        cookie,
        json: { body: 'Olá! Podemos agendar sábado às 10h.' },
      }),
    );
    rec(
      'whatsapp',
      'handoff to human',
      [200, 201],
      await api('POST', `/conversations/${convId}/handoff`, { cookie, json: {} }),
    );
  }

  // ── B) Channel FAKE import leads → CRM
  const before = Number(sql(`select count(*) from leads where org_id='${orgId}'`));
  rec(
    'channels',
    'import leads from fake channel',
    [200, 201, 202],
    await api('POST', '/channels/fake/import-leads', { cookie, json: {} }),
  );
  await sleep(8000);
  info(
    'channels',
    'leads created by import',
    Number(sql(`select count(*) from leads where org_id='${orgId}'`)) - before,
  );
  info(
    'channels',
    'LEAD_IMPORT consents',
    sql(`select count(*) from party_consents where org_id='${orgId}' and purpose='LEAD_IMPORT'`),
  );
  info(
    'channels',
    'channel jobs',
    sql(`select string_agg(type||':'||status, ',') from channel_sync_jobs where org_id='${orgId}'`),
  );
  rec('channels', 'channels summary', 200, await api('GET', '/channels/summary', { cookie }));

  // ── C) Meta Ads dry-run pipeline
  const conn = rec(
    'meta',
    'create FAKE connection',
    [200, 201],
    await api('POST', '/meta/connections', { cookie, json: { provider: 'FAKE' } }),
  );
  const connectionId = G(conn.body, 'connection', 'id');
  info(
    'meta',
    'stored token column sample',
    sql(
      `select left(coalesce(access_token_encrypted,'-'),24) from meta_connections where org_id='${orgId}' order by created_at desc limit 1`,
    ),
  );
  const assets = await api('GET', `/meta/connections/${connectionId}/assets`, { cookie });
  rec('meta', 'list assets', 200, assets);
  const base = {
    connectionId,
    propertyId: S.propA,
    listingId: S.listingA,
    name: `Campanha Audit ${U}`,
    objective: 'OUTCOME_LEADS',
    startAt: '2026-10-01T00:00:00Z',
    endAt: '2026-10-31T00:00:00Z',
    mediaSelection: [S.mediaId],
    landingUrl: 'https://example.com/imovel',
    copyPrimary: 'Apartamento 3 quartos nos Jardins. Agende sua visita.',
  };
  rec(
    'meta',
    'prepare with EXCESSIVE daily budget (cap)',
    [400, 409, 422],
    await api('POST', '/meta/ad-profiles', {
      cookie,
      json: { ...base, dailyBudgetCents: 50_000_000, idempotencyKey: `cap-${U}` },
    }),
  );
  rec(
    'meta',
    'prepare with BOTH budgets (XOR)',
    [400, 422],
    await api('POST', '/meta/ad-profiles', {
      cookie,
      json: {
        ...base,
        dailyBudgetCents: 5000,
        lifetimeBudgetCents: 50000,
        idempotencyKey: `xor-${U}`,
      },
    }),
  );
  rec(
    'meta',
    'prepare with PII in copy',
    [400, 422, 201],
    await api('POST', '/meta/ad-profiles', {
      cookie,
      json: {
        ...base,
        dailyBudgetCents: 5000,
        copyPrimary: `Ligue para ${S.cpfL1} ou email dono@example.com`,
        idempotencyKey: `pii-${U}`,
      },
    }),
    'recorded',
  );
  const prof = rec(
    'meta',
    'prepare ad profile (valid)',
    [200, 201],
    await api('POST', '/meta/ad-profiles', {
      cookie,
      json: { ...base, dailyBudgetCents: 5000, idempotencyKey: `prep-${U}` },
    }),
  );
  const profileId = G(prof.body, 'profile', 'id') ?? G(prof.body, 'adProfile', 'id');
  info('meta', 'profile body keys', Object.keys(prof.body ?? {}));
  const cc = rec(
    'meta',
    'create campaign (PAUSED)',
    [200, 201, 202],
    await api('POST', `/meta/ad-profiles/${profileId}/create-campaign`, {
      cookie,
      json: { idempotencyKey: `cc-${U}-001` },
    }),
  );
  rec(
    'meta',
    'create campaign same idempotency key',
    [200, 201, 202, 409],
    await api('POST', `/meta/ad-profiles/${profileId}/create-campaign`, {
      cookie,
      json: { idempotencyKey: `cc-${U}-001` },
    }),
    'idempotency',
  );
  const campId = G(cc.body, 'campaign', 'id');
  info('meta', 'campaign status after create', G(cc.body, 'campaign', 'status'));
  const prev = await api('GET', `/meta/campaigns/${campId}/preview`, { cookie });
  rec('meta', 'preview', 200, prev);
  info(
    'meta',
    'preview special ad category/targeting',
    JSON.stringify(prev.body).match(/HOUSING|special_ad_categor[a-z_]*|age|gender/gi),
  );
  rec(
    'meta',
    'publish (intent)',
    [200, 201, 202],
    await api('POST', `/meta/campaigns/${campId}/publish`, {
      cookie,
      json: { idempotencyKey: `pub-${U}-001` },
    }),
  );
  await sleep(10000);
  const afterPub = await api('GET', `/meta/campaigns/${campId}`, { cookie });
  info('meta', 'status after publish+worker', G(afterPub.body, 'campaign', 'status'));
  rec(
    'meta',
    'budget above cap',
    [400, 409, 422],
    await api('POST', `/meta/campaigns/${campId}/budget`, {
      cookie,
      json: { dailyBudgetCents: 90_000_000, idempotencyKey: `bud-${U}-001` },
    }),
  );
  rec(
    'meta',
    'budget valid',
    [200, 201, 202],
    await api('POST', `/meta/campaigns/${campId}/budget`, {
      cookie,
      json: { dailyBudgetCents: 6000, idempotencyKey: `bud-${U}-002` },
    }),
  );
  rec(
    'meta',
    'pause',
    [200, 201, 202, 409],
    await api('POST', `/meta/campaigns/${campId}/pause`, {
      cookie,
      json: { idempotencyKey: `pau-${U}-001` },
    }),
  );
  rec(
    'meta',
    'sync insights',
    [200, 201, 202],
    await api('POST', `/meta/campaigns/${campId}/sync-insights`, { cookie, json: {} }),
  );
  await sleep(8000);
  info(
    'meta',
    'meta_sync_jobs',
    sql(
      `select string_agg(type||':'||status||':'||coalesce(left(last_error,60),'-'), ' | ' order by created_at) from meta_sync_jobs where org_id='${orgId}'`,
    ),
  );
  info(
    'meta',
    'insight snapshots',
    sql(
      `select count(*)||' rows; spend='||coalesce(sum(spend_cents),0)||' leads='||coalesce(sum(leads),0) from meta_insight_snapshots where org_id='${orgId}'`,
    ),
  );
  info(
    'meta',
    'meta_audit_events',
    sql(
      `select string_agg(action||':'||status, ', ') from meta_audit_events where org_id='${orgId}'`,
    ),
  );
  rec('meta', 'reporting meta-spend', 200, await api('GET', '/reporting/meta-spend', { cookie }));
  rec(
    'meta',
    'reporting leads-funnel',
    200,
    await api('GET', '/reporting/leads-funnel', { cookie }),
  );
  info(
    'meta',
    'Meta lead -> CRM path exists? (leads with source meta)',
    sql(
      `select count(*) from leads where org_id='${orgId}' and (source ilike '%meta%' or channel ilike '%meta%')`,
    ),
  );
  console.log('DONE');
}
main().catch((e) => {
  console.error('CRASH', e);
  process.exit(1);
});
