import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertPlanAllowsOneMore, buildApp } from '@aluguei/api';
import { createDb, properties } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { FakeStorageService } from './fakes.js';
import { testEnv } from './helpers.js';
import { dropTestDatabase } from './pg-test-database.js';
import { call, platformAdminSession, registerAgency } from './platform-fixtures.js';
import type { CallResult, RegisteredAgency } from './platform-fixtures.js';

/**
 * Limites do plano sob concorrência REAL (PostgreSQL, conexões distintas do pool).
 * O PGlite serializa transações: uma contagem sem trava passaria lá e estouraria
 * aqui. Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

describe('concorrência real (PostgreSQL): limites do plano', () => {
  const dbName = `aluguei_pl_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  async function agencyOnPlan(limits: {
    maxProperties?: number;
    maxPublishedListings?: number;
  }): Promise<RegisteredAgency> {
    const platformAdmin = await platformAdminSession(app);
    const code = `CONC_${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const plan = await call(app, 'POST', '/platform/plans', {
      cookie: platformAdmin.cookie,
      payload: {
        code,
        name: code,
        maxUsers: null,
        maxProperties: limits.maxProperties ?? null,
        maxPublishedListings: limits.maxPublishedListings ?? null,
      },
    });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    const agency = await registerAgency(app);
    const approve = await call(app, 'POST', `/platform/organizations/${agency.org.id}/approve`, {
      cookie: platformAdmin.cookie,
      payload: { planId: (plan.body.plan as { id: string }).id },
    });
    expect(approve.status, JSON.stringify(approve.body)).toBe(200);
    return agency;
  }

  function outcome(results: CallResult[]): { created: number; refused: number; other: string[] } {
    return {
      created: results.filter((r) => r.status === 201 || r.status === 200).length,
      refused: results.filter((r) => r.status === 409 && r.body.code === 'PLAN_LIMIT_REACHED')
        .length,
      other: results
        .filter((r) => r.status !== 201 && r.status !== 200 && r.status !== 409)
        .map((r) => `${String(r.status)} ${JSON.stringify(r.body)}`),
    };
  }

  it('trava da imobiliária: quem conta enquanto outra transação está no limite espera e é recusado', async () => {
    const agency = await agencyOnPlan({ maxProperties: 1 });
    const orgId = agency.org.id;
    let counted: () => void = () => undefined;
    const firstCounted = new Promise<void>((resolve) => {
      counted = resolve;
    });

    // A primeira conta, avisa e segura a transação aberta antes de gravar: sem a trava,
    // a segunda também conta zero e as duas gravam.
    const first = db.transaction(async (tx) => {
      await assertPlanAllowsOneMore(tx, orgId, 'properties');
      counted();
      await sleep(500);
      await tx.insert(properties).values({ orgId, title: 'Primeiro', propertyType: 'APARTMENT' });
    });
    await firstCounted;
    const second = db.transaction(async (tx) => {
      await assertPlanAllowsOneMore(tx, orgId, 'properties');
      await tx.insert(properties).values({ orgId, title: 'Segundo', propertyType: 'APARTMENT' });
    });

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);
    expect(firstResult.status).toBe('fulfilled');
    expect(secondResult.status).toBe('rejected');
    if (secondResult.status === 'rejected') {
      expect(secondResult.reason).toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    }
    const rows = await db.execute(
      sql`select count(*)::int as n from properties where org_id = ${orgId}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(1);
  });

  it('vinte cadastros simultâneos de imóvel com limite 3: exatamente 3 gravados e 17 recusados', async () => {
    const agency = await agencyOnPlan({ maxProperties: 3 });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        call(app, 'POST', '/properties', {
          cookie: agency.cookie,
          payload: { title: `Imóvel concorrente ${String(index)}`, propertyType: 'APARTMENT' },
        }),
      ),
    );

    expect(outcome(results)).toEqual({ created: 3, refused: 17, other: [] });
    const rows = await db.execute(
      sql`select count(*)::int as n from properties where org_id = ${agency.org.id}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(3);
  });

  it('quatro publicações simultâneas com limite 2 de anúncios: exatamente 2 publicados', async () => {
    const agency = await agencyOnPlan({ maxPublishedListings: 2 });
    const listingIds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const property = await call(app, 'POST', '/properties', {
        cookie: agency.cookie,
        payload: { title: `Imóvel anúncio ${String(index)}`, propertyType: 'APARTMENT' },
      });
      const propertyId = (property.body.property as { id: string }).id;
      await call(app, 'PUT', `/properties/${propertyId}/address`, {
        cookie: agency.cookie,
        payload: {
          privateAddress: { street: 'Rua Privada 1', city: 'São Paulo', state: 'SP' },
          publicAddress: { neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
        },
      });
      await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
        cookie: agency.cookie,
        payload: { monthlyRentCents: 350000, minimumLeaseMonths: 12 },
      });
      const listing = await call(app, 'POST', '/listings', {
        cookie: agency.cookie,
        payload: { propertyId, title: `Anúncio concorrente ${String(index)}` },
      });
      const listingId = (listing.body.listing as { id: string }).id;
      const ready = await call(app, 'PATCH', `/listings/${listingId}/status`, {
        cookie: agency.cookie,
        payload: { status: 'READY' },
      });
      expect(ready.status).toBe(200);
      listingIds.push(listingId);
    }

    const results = await Promise.all(
      listingIds.map((listingId) =>
        call(app, 'PATCH', `/listings/${listingId}/status`, {
          cookie: agency.cookie,
          payload: { status: 'PUBLISHED' },
        }),
      ),
    );

    expect(outcome(results)).toEqual({ created: 2, refused: 2, other: [] });
    const rows = await db.execute(
      sql`select count(*)::int as n from listings where org_id = ${agency.org.id} and status = 'PUBLISHED'`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(2);
  });
});
