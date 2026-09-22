import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
 * Migration 0021 (G3, trilha E2) contra PostgreSQL real.
 *
 * Portal (pendência do ADR-061): o índice `portal_access_org_party_kind_active_unique` incluía
 * `revoked_at`, e o PostgreSQL trata nulos como distintos — o banco aceitava duas concessões
 * ativas da mesma pessoa, e só a trava da rota impedia. A 0021 troca por índice parcial
 * `WHERE revoked_at IS NULL`; o pré-voo aborta sem aplicar nada se já houver duplicata ativa.
 *
 * WhatsApp (P1-18, segunda parte): a conexão ganha token cifrado, prazo da reivindicação e
 * `CHECK` de status; as conexões antigas (ACTIVE, sem prova de posse) viram PENDING vencidas.
 * Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));
const LAST_BEFORE = '0020_party_visit_proposal_identity';
const tempDirs: string[] = [];

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Cópia das migrations com o journal cortado em `lastTag` (banco "de antes"). */
function migrationsUpTo(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'aluguei-0021-'));
  tempDirs.push(folder);
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last < 0) {
    throw new Error(`migration ${lastTag} não encontrada`);
  }
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

function errorMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(' | ');
}

function pgCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code;
    }
    current = candidate.cause;
  }
  return null;
}

async function count(db: AppDb, statement: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(statement);
  return (result.rows[0] as { n: number }).n;
}

async function seedGrantOwner(db: AppDb): Promise<{ org: string; user: string; party: string }> {
  const org = randomUUID();
  const user = randomUUID();
  const party = randomUUID();
  await db.execute(
    sql`insert into organizations (id, name, slug) values (${org}, 'Org 0021', ${`org-${org}`})`,
  );
  await db.execute(sql`
    insert into users (id, email, name, password_hash)
    values (${user}, ${`u-${user}@example.com`}, 'Usuária 0021', 'x')
  `);
  await db.execute(
    sql`insert into parties (id, org_id, type, name) values (${party}, ${org}, 'PERSON', 'Locatária')`,
  );
  return { org, user, party };
}

async function insertGrant(
  db: AppDb,
  owner: { org: string; user: string; party: string },
  revokedAt: Date | null = null,
): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`
    insert into portal_access (id, org_id, party_id, kind, created_by, revoked_at)
    values (${id}, ${owner.org}, ${owner.party}, 'TENANT', ${owner.user}, ${revokedAt})
  `);
  return id;
}

describe('migration 0021 (PostgreSQL real): pré-voo do índice parcial do portal', () => {
  const dbName = `aluguei_m21_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let admin: AppDb;
  let db: AppDb;

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: migrationsUpTo(LAST_BEFORE) });
  });

  afterAll(async () => {
    await db.$client.end();
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
    for (const folder of tempDirs) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('duplicata ativa aborta sem aplicar nada; revogada a sobra, migra e converte o WhatsApp legado', async () => {
    const owner = await seedGrantOwner(db);
    const kept = await insertGrant(db, owner);
    const duplicate = await insertGrant(db, owner);
    await insertGrant(db, owner, new Date()); // revogada: nunca conta como duplicata
    const legacyNumber = `legado-${randomUUID().slice(0, 8)}`;
    await db.execute(sql`
      insert into whatsapp_connections (id, org_id, phone_number_id, status)
      values (${randomUUID()}, ${owner.org}, ${legacyNumber}, 'ACTIVE')
    `);

    let failure: string | null = null;
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS });
    } catch (error) {
      failure = errorMessages(error);
    }
    expect(failure, 'o pré-voo tem de abortar a 0021').not.toBeNull();
    expect(failure).toContain('Migracao 0021 abortada');
    expect(failure).toContain(owner.party);

    // Nada aplicado: coluna nova ausente, índice antigo no lugar, WhatsApp intocado.
    expect(
      await count(
        db,
        sql`select count(*)::int as n from information_schema.columns
            where table_name = 'whatsapp_connections' and column_name = 'access_token_encrypted'`,
      ),
    ).toBe(0);
    const before = await db.execute(sql`
      select indexdef from pg_indexes where indexname = 'portal_access_org_party_kind_active_unique'
    `);
    expect((before.rows[0] as { indexdef: string }).indexdef).toContain('revoked_at)');

    // A imobiliária resolve a duplicata (revoga a sobra) e a migração conclui.
    await db.execute(sql`update portal_access set revoked_at = now() where id = ${duplicate}`);
    await migrate(db, { migrationsFolder: MIGRATIONS });

    const after = await db.execute(sql`
      select indexdef from pg_indexes where indexname = 'portal_access_org_party_kind_active_unique'
    `);
    const indexdef = (after.rows[0] as { indexdef: string }).indexdef;
    expect(indexdef).toContain('UNIQUE');
    expect(indexdef).toContain('WHERE (revoked_at IS NULL)');
    expect(indexdef).not.toContain('kind, revoked_at');
    expect(
      await count(
        db,
        sql`select count(*)::int as n from portal_access where id = ${kept} and revoked_at is null`,
      ),
    ).toBe(1);

    // A conexão antiga do WhatsApp não tinha prova de posse: vira PENDING vencida, sem token.
    const legacy = await db.execute(sql`
      select status, claim_expires_at <= now() as expired, access_token_encrypted
      from whatsapp_connections where phone_number_id = ${legacyNumber}
    `);
    expect(legacy.rows[0]).toEqual({
      status: 'PENDING',
      expired: true,
      access_token_encrypted: null,
    });
  });
});

describe('0021 aplicada (PostgreSQL real): o banco garante uma concessão ativa e o status do WhatsApp', () => {
  const dbName = `aluguei_i21_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  it('segunda concessão ativa da mesma pessoa é recusada pelo banco (23505); revogadas repetem à vontade', async () => {
    const owner = await seedGrantOwner(db);
    await insertGrant(db, owner, new Date());
    await insertGrant(db, owner, new Date());
    await insertGrant(db, owner);
    let code: string | null = null;
    try {
      await insertGrant(db, owner);
    } catch (error) {
      code = pgCode(error);
    }
    expect(code, 'o índice parcial recusa a segunda ativa').toBe('23505');
  });

  it('duas transações gravando a concessão ativa ao mesmo tempo, sem a trava da rota: uma só confirma', async () => {
    const owner = await seedGrantOwner(db);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted: () => void = () => undefined;
    const firstInserted = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const first = db.transaction(async (tx) => {
      await insertGrant(tx as unknown as AppDb, owner);
      inserted();
      await released;
    });
    await firstInserted;
    // A segunda espera a primeira no índice único e, quando ela confirma, recebe 23505.
    const second = db.transaction(async (tx) => {
      await insertGrant(tx as unknown as AppDb, owner);
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    const results = await Promise.allSettled([first, second]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(pgCode((results[1] as PromiseRejectedResult).reason)).toBe('23505');
    expect(
      await count(
        db,
        sql`select count(*)::int as n from portal_access
            where party_id = ${owner.party} and revoked_at is null`,
      ),
    ).toBe(1);
  });

  it('pedidos de link simultâneos pela rota, locatário e proprietário: uma concessão ativa por tipo', async () => {
    const { cookie } = await registerUser(app);
    const party = await call(app, 'POST', '/parties', {
      cookie,
      payload: {
        type: 'PERSON',
        name: 'Pessoa Portal 0021',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    expect(party.status, JSON.stringify(party.body)).toBe(201);
    const partyId = (party.body.party as { id: string }).id;

    const grants = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        call(app, 'POST', '/portal/access', {
          cookie,
          payload: { partyId, kind: i % 2 === 0 ? 'TENANT' : 'LANDLORD' },
        }),
      ),
    );
    expect(grants.map((g) => g.status)).toEqual(Array.from({ length: 12 }, () => 201));
    const perKind = await db.execute(sql`
      select kind, count(*)::int as n from portal_access
      where party_id = ${partyId} and revoked_at is null group by kind order by kind
    `);
    expect(perKind.rows).toEqual([
      { kind: 'LANDLORD', n: 1 },
      { kind: 'TENANT', n: 1 },
    ]);
  });

  it('status fora do vocabulário é recusado (23514), e VERIFIED exige a data da verificação', async () => {
    const owner = await seedGrantOwner(db);
    const attempt = async (statement: ReturnType<typeof sql>): Promise<string | null> => {
      try {
        await db.execute(statement);
        return null;
      } catch (error) {
        return pgCode(error);
      }
    };
    expect(
      await attempt(sql`
        insert into whatsapp_connections (id, org_id, phone_number_id, status)
        values (${randomUUID()}, ${owner.org}, ${`s-${randomUUID().slice(0, 8)}`}, 'ACTIVE')
      `),
    ).toBe('23514');
    expect(
      await attempt(sql`
        insert into whatsapp_connections (id, org_id, phone_number_id, status)
        values (${randomUUID()}, ${owner.org}, ${`s-${randomUUID().slice(0, 8)}`}, 'VERIFIED')
      `),
    ).toBe('23514');
    expect(
      await attempt(sql`
        insert into whatsapp_connections (id, org_id, phone_number_id, status)
        values (${randomUUID()}, ${owner.org}, ${`s-${randomUUID().slice(0, 8)}`}, 'PENDING')
      `),
      'PENDING exige o prazo da reivindicação',
    ).toBe('23514');
  });
});
