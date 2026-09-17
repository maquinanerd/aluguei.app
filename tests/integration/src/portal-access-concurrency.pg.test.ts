import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { buildApp } from '@aluguei/api';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { FakeStorageService } from './fakes.js';
import { registerUser, testEnv } from './helpers.js';
import { dropTestDatabase } from './pg-test-database.js';
import { call } from './platform-fixtures.js';

/**
 * Concessão de acesso ao portal sob concorrência REAL (PostgreSQL, conexões distintas
 * do pool): a tela de acesso ao portal (P1-16) gera links de uso único, e pedidos
 * simultâneos não podem criar duas concessões ativas para a mesma pessoa — o link de
 * uma delas continuaria valendo depois de a imobiliária gerar outro. O índice único de
 * `portal_access` inclui `revoked_at` e não impede duas linhas com `revoked_at` nulo.
 * Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

describe('concorrência real (PostgreSQL): concessão de acesso ao portal', () => {
  const dbName = `aluguei_pa_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let admin: AppDb;
  let db: AppDb;
  let app: FastifyInstance;

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });
    app = await buildApp({
      db,
      env: testEnv,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      logger: { level: 'error' },
    });
  });

  afterAll(async () => {
    await app.close();
    await db.$client.end();
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
  });

  async function createParty(cookie: string, name: string): Promise<string> {
    const party = await call(app, 'POST', '/parties', {
      cookie,
      payload: { type: 'PERSON', name, identities: [{ kind: 'CPF', value: '52998224725' }] },
    });
    expect(party.status, JSON.stringify(party.body)).toBe(201);
    return (party.body.party as { id: string }).id;
  }

  it('concessão ainda não confirmada por outra transação: o pedido espera e reaproveita, sem criar a segunda', async () => {
    const { cookie, body } = await registerUser(app);
    const partyId = await createParty(cookie, 'Locatário Concessão em Andamento');

    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted: () => void = () => undefined;
    const rowInserted = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    // Outra concessão da mesma pessoa gravada e ainda não confirmada (outro pedido no
    // meio da transação). Sem esperar por ela, a rota não a enxerga e grava outra ativa.
    const inFlight = db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into portal_access (id, org_id, party_id, kind, created_by)
        values (${randomUUID()}, ${body.org.id}, ${partyId}, 'TENANT', ${body.user.id})
      `);
      inserted();
      await released;
    });
    await rowInserted;

    const grant = call(app, 'POST', '/portal/access', {
      cookie,
      payload: { partyId, kind: 'TENANT' },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await inFlight;
    const granted = await grant;
    expect(granted.status, JSON.stringify(granted.body)).toBe(201);

    const active = await db.execute(sql`
      select count(*)::int as n from portal_access
      where party_id = ${partyId} and kind = 'TENANT' and revoked_at is null
    `);
    expect((active.rows[0] as { n: number }).n).toBe(1);
  });

  it('dez pedidos de link simultâneos: uma concessão ativa e um único link válido', async () => {
    const { cookie } = await registerUser(app);
    const partyId = await createParty(cookie, 'Locatária Concorrência Portal');

    const grants = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(app, 'POST', '/portal/access', { cookie, payload: { partyId, kind: 'TENANT' } }),
      ),
    );
    expect(grants.map((g) => g.status)).toEqual(Array.from({ length: 10 }, () => 201));

    const active = await db.execute(sql`
      select count(*)::int as n from portal_access
      where party_id = ${partyId} and kind = 'TENANT' and revoked_at is null
    `);
    expect((active.rows[0] as { n: number }).n).toBe(1);

    const statuses: number[] = [];
    for (const grant of grants) {
      const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/consume',
        payload: { token: grant.body.oneTimeToken },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 401)).toHaveLength(9);
  });
});
