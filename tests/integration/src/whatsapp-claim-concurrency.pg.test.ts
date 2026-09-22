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
import { testEnv } from './helpers.js';
import { dropTestDatabase } from './pg-test-database.js';
import { call, registerAgency, approveAgency } from './platform-fixtures.js';

/**
 * Reivindicação do número do WhatsApp sob concorrência REAL (PostgreSQL, conexões distintas do
 * pool) — G3, trilha E2 (auditoria 2026-09-10, P1-18, segunda parte). Duas imobiliárias pedindo
 * o mesmo número ao mesmo tempo não podem sair as duas com ele, e a tomada de uma reivindicação
 * vencida tem de ter um único vencedor. Verificador FAKE (dry_run): nenhuma chamada à Graph API.
 * Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));
const ownerToken = (phoneNumberId: string): string => `fake-wa-owner:${phoneNumberId}`;

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

describe('concorrência real (PostgreSQL): reivindicação do número do WhatsApp', () => {
  const dbName = `aluguei_wa_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  async function agencies(n: number): Promise<Array<{ cookie: string; orgId: string }>> {
    const out: Array<{ cookie: string; orgId: string }> = [];
    for (let i = 0; i < n; i += 1) {
      const agency = await registerAgency(app);
      await approveAgency(app, agency.org.id);
      out.push({ cookie: agency.cookie, orgId: agency.org.id });
    }
    return out;
  }

  const claim = (cookie: string, phoneNumberId: string, accessToken: string) =>
    call(app, 'POST', '/whatsapp/connections', {
      cookie,
      payload: { phoneNumberId, accessToken },
    });

  it('quatro imobiliárias pedem o mesmo número livre ao mesmo tempo: uma fica com ele, as outras recebem 409', async () => {
    const orgs = await agencies(4);
    const phoneNumberId = `7${String(Date.now()).slice(-9)}`;
    const results = await Promise.all(
      orgs.map((org) => claim(org.cookie, phoneNumberId, ownerToken(phoneNumberId))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409]);
    const rows = await db.execute(sql`
      select org_id from whatsapp_connections where phone_number_id = ${phoneNumberId}
    `);
    expect(rows.rows).toHaveLength(1);
    const winner = results.findIndex((r) => r.status === 201);
    expect((rows.rows[0] as { org_id: string }).org_id).toBe(orgs[winner]?.orgId);
  });

  it('reivindicação vencida tomada ao mesmo tempo por duas organizações com a prova: um único vencedor', async () => {
    const [squatter, first, second] = await agencies(3);
    if (!squatter || !first || !second) {
      throw new Error('organizações não criadas');
    }
    const phoneNumberId = `6${String(Date.now()).slice(-9)}`;
    const squat = await claim(squatter.cookie, phoneNumberId, 'token-sem-posse');
    expect(squat.status).toBe(201);
    await db.execute(sql`
      update whatsapp_connections set claim_expires_at = now() - interval '1 minute'
      where phone_number_id = ${phoneNumberId}
    `);

    const results = await Promise.all([
      claim(first.cookie, phoneNumberId, ownerToken(phoneNumberId)),
      claim(second.cookie, phoneNumberId, ownerToken(phoneNumberId)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const rows = await db.execute(sql`
      select org_id, status from whatsapp_connections where phone_number_id = ${phoneNumberId}
    `);
    expect(rows.rows).toHaveLength(1);
    const winner = results[0]?.status === 201 ? first : second;
    expect(rows.rows[0]).toEqual({ org_id: winner.orgId, status: 'VERIFIED' });

    // A posseira recebeu o aviso de perda uma única vez.
    const lost = await db.execute(sql`
      select count(*)::int as n from audit_events
      where org_id = ${squatter.orgId} and action = 'whatsapp.connection_claim_expired'
    `);
    expect((lost.rows[0] as { n: number }).n).toBe(1);
  });
});
