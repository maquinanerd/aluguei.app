import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { buildTestApp, registerUser } from './helpers.js';
import { call } from './platform-fixtures.js';

/**
 * Gate G2, Track B2 (auditoria 2026-09-10): o que a interface precisa da API para
 * P1-16 (portal alcançável pela UI), P1-03 no portal (logout encerra a sessão) e
 * P1-17 parcial (candidatura com busca de pessoa; primeira publicação em canal).
 */

let app: FastifyInstance;
let db: AppDb;

beforeAll(async () => {
  app = await buildTestApp();
  db = app.db as AppDb;
});

afterAll(async () => {
  await app.close();
});

interface AccessRow {
  id: string;
  partyId: string;
  kind: string;
  createdAt: string;
  revokedAt: string | null;
  linkActive: boolean;
  activeSessions: number;
}

async function createParty(cookie: string, name: string, cpf: string): Promise<string> {
  const res = await call(app, 'POST', '/parties', {
    cookie,
    payload: { type: 'PERSON', name, identities: [{ kind: 'CPF', value: cpf }] },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body.party as { id: string }).id;
}

async function grantTenantAccess(cookie: string, partyId: string): Promise<string> {
  const res = await call(app, 'POST', '/portal/access', {
    cookie,
    payload: { partyId, kind: 'TENANT' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.oneTimeToken as string;
}

async function consume(token: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/portal/auth/consume', payload: { token } });
  expect(res.statusCode, res.body).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const portal = raw.map((c) => c.split(';')[0] ?? '').find((c) => c.startsWith('aluguei_portal='));
  expect(portal, 'cookie do portal').toBeTruthy();
  return portal ?? '';
}

describe('P1-03 no portal: "Sair" encerra a sessão no servidor', () => {
  it('um cookie do portal copiado antes do logout deixa de valer', async () => {
    const { cookie } = await registerUser(app);
    const partyId = await createParty(cookie, 'Locatária Logout Portal', '52998224725');
    const portalCookie = await consume(await grantTenantAccess(cookie, partyId));

    expect((await call(app, 'GET', '/portal/me', { cookie: portalCookie })).status).toBe(200);
    const logout = await call(app, 'POST', '/portal/auth/logout', { cookie: portalCookie });
    expect(logout.status).toBe(200);

    const reused = await call(app, 'GET', '/portal/me', { cookie: portalCookie });
    expect(reused.status).toBe(401);
    const open = await db.execute(sql`
      select count(*)::int as n from portal_sessions
      where party_id = ${partyId} and revoked_at is null
    `);
    expect((open.rows[0] as { n: number }).n).toBe(0);
  });
});

describe('P1-16: acessos ao portal de uma pessoa, para a tela de concessão', () => {
  it('lista o acesso com a situação do link e das sessões; revogado aparece revogado; outra organização não vê', async () => {
    const { cookie } = await registerUser(app);
    const partyId = await createParty(cookie, 'Locatário Acessos Portal', '11144477735');
    const token = await grantTenantAccess(cookie, partyId);

    const list = async (asCookie: string) =>
      call(app, 'GET', `/portal/access?partyId=${partyId}`, { cookie: asCookie });

    const fresh = await list(cookie);
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(200);
    expect(fresh.body.accesses).toEqual([
      expect.objectContaining({
        partyId,
        kind: 'TENANT',
        revokedAt: null,
        linkActive: true,
        activeSessions: 0,
      }),
    ]);

    await consume(token);
    const used = (await list(cookie)).body.accesses as AccessRow[];
    expect(used[0]).toMatchObject({ linkActive: false, activeSessions: 1 });

    const accessId = used[0]?.id ?? '';
    const revoke = await call(app, 'POST', `/portal/access/${accessId}/revoke`, { cookie });
    expect(revoke.status).toBe(200);
    const revoked = (await list(cookie)).body.accesses as AccessRow[];
    expect(revoked[0]?.revokedAt).not.toBeNull();
    expect(revoked[0]).toMatchObject({ linkActive: false, activeSessions: 0 });

    const other = await registerUser(app);
    expect((await list(other.cookie)).status).toBe(404);
  });
});

describe('P1-17: busca de pessoas para a candidatura', () => {
  it('q filtra por nome ou por documento (com ou sem máscara), só na organização', async () => {
    const { cookie } = await registerUser(app);
    const mariana = await createParty(cookie, 'Mariana Souza Busca', '52998224725');
    await createParty(cookie, 'Carlos Lima Busca', '11144477735');
    const other = await registerUser(app);
    await createParty(other.cookie, 'Mariana de Outra Org', '52998224725');

    const byName = await call(app, 'GET', '/parties?q=mariana', { cookie });
    expect(byName.status, JSON.stringify(byName.body)).toBe(200);
    expect((byName.body.parties as Array<{ id: string }>).map((p) => p.id)).toEqual([mariana]);

    const byDocument = await call(app, 'GET', `/parties?q=${encodeURIComponent('529.982.247')}`, {
      cookie,
    });
    expect((byDocument.body.parties as Array<{ id: string }>).map((p) => p.id)).toEqual([mariana]);

    const none = await call(app, 'GET', '/parties?q=inexistente-xyz', { cookie });
    expect(none.body.parties).toEqual([]);
  });
});

describe('P1-17: canais disponíveis para a primeira publicação', () => {
  it('GET /channels informa quais canais têm integração configurada', async () => {
    const { cookie } = await registerUser(app);
    const res = await call(app, 'GET', '/channels', { cookie });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const channels = res.body.channels as Array<{ channel: string; available: boolean }>;
    expect(channels.map((c) => c.channel).sort()).toEqual(
      ['canalpro', 'fake', 'imovelweb', 'olx', 'vivareal', 'zap'].sort(),
    );
    expect(channels.find((c) => c.channel === 'fake')?.available).toBe(true);
    expect(channels.find((c) => c.channel === 'olx')?.available).toBe(false);

    const anonymous = await call(app, 'GET', '/channels');
    expect(anonymous.status).toBe(401);
  });
});
