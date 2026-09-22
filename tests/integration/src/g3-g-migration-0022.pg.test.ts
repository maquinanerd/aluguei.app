import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, reconciliations } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { processReconcileJob } from '@aluguei/worker';
import { dropTestDatabase } from './pg-test-database.js';

/**
 * Migration 0022 (G3, trilha G — auditoria 2026-09-10, P2-12) contra PostgreSQL real.
 *
 * - CHECK nas colunas de domínio fechado: o banco deixa de aceitar status, tipo ou papel fora do
 *   vocabulário do domínio. O pré-voo aborta sem aplicar nada e nomeia cada linha que já viola um
 *   CHECK novo (tabela, coluna, id e valor), como os de 0013/0014/0021.
 * - `bigint` nos totais da conciliação: a soma das cobranças pagas da organização passava de
 *   2^31 − 1 centavos (R$ 21.474.836,47) e o job de conciliação quebrava com `integer out of range`.
 * - Índice parcial `party_consents_active_unique` passa a ser declarado no schema do drizzle.
 * Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));
const LAST_BEFORE = '0021_whatsapp_ownership_portal_active_index';
const INT4_MAX = 2_147_483_647;
const tempDirs: string[] = [];

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Cópia das migrations com o journal cortado em `lastTag` (banco "de antes"). */
function migrationsUpTo(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'aluguei-0022-'));
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

async function attempt(db: AppDb, statement: ReturnType<typeof sql>): Promise<string | null> {
  try {
    await db.execute(statement);
    return null;
  } catch (error) {
    return pgCode(error);
  }
}

async function scalar(db: AppDb, statement: ReturnType<typeof sql>): Promise<unknown> {
  const result = await db.execute(statement);
  return Object.values(result.rows[0] as Record<string, unknown>)[0];
}

interface Seed {
  org: string;
  user: string;
  party: string;
  property: string;
  lease: string;
}

/** Organização com pessoa, imóvel, contrato e locação — tudo por SQL, sem a API. */
async function seed(db: AppDb, propertyType = 'APARTMENT'): Promise<Seed> {
  const org = randomUUID();
  const user = randomUUID();
  const party = randomUUID();
  const property = randomUUID();
  const contract = randomUUID();
  const lease = randomUUID();
  await db.execute(
    sql`insert into organizations (id, name, slug) values (${org}, 'Org 0022', ${`org-${org}`})`,
  );
  await db.execute(sql`
    insert into users (id, email, name, password_hash)
    values (${user}, ${`u-${user}@example.com`}, 'Usuária 0022', 'x')
  `);
  await db.execute(
    sql`insert into parties (id, org_id, type, name) values (${party}, ${org}, 'PERSON', 'Pessoa')`,
  );
  await db.execute(sql`
    insert into properties (id, org_id, title, property_type)
    values (${property}, ${org}, 'Imóvel 0022', ${propertyType})
  `);
  await db.execute(sql`insert into contracts (id, org_id) values (${contract}, ${org})`);
  await db.execute(sql`
    insert into leases (id, org_id, contract_id, property_id, start_date, monthly_rent_cents)
    values (${lease}, ${org}, ${contract}, ${property}, '2026-01-01', 150000)
  `);
  return { org, user, party, property, lease };
}

describe('migration 0022 (PostgreSQL real): pré-voo dos CHECKs de domínio', () => {
  const dbName = `aluguei_m22_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  it('dado fora do domínio aborta sem aplicar nada e nomeia cada linha; corrigido, migra', async () => {
    // Antes da 0022 o banco aceita qualquer texto nessas colunas.
    const owner = await seed(db, 'FLAT');
    const lead = randomUUID();
    const task = randomUUID();
    await db.execute(
      sql`insert into leads (id, org_id, status) values (${lead}, ${owner.org}, 'CONTACTED')`,
    );
    await db.execute(
      sql`insert into tasks (id, org_id, title, status) values (${task}, ${owner.org}, 'Ligar', 'TODO')`,
    );
    await db.execute(sql`update leases set status = 'TERMINATED' where id = ${owner.lease}`);
    // Linha válida: nunca aparece na lista do pré-voo.
    await db.execute(
      sql`insert into leads (id, org_id, status) values (${randomUUID()}, ${owner.org}, 'QUALIFIED')`,
    );

    let failure: string | null = null;
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS });
    } catch (error) {
      failure = errorMessages(error);
    }
    expect(failure, 'o pré-voo tem de abortar a 0022').not.toBeNull();
    expect(failure).toContain('Migracao 0022 abortada');
    expect(failure).toContain(`properties.property_type ${owner.property} = FLAT`);
    expect(failure).toContain(`leads.status ${lead} = CONTACTED`);
    expect(failure).toContain(`tasks.status ${task} = TODO`);
    expect(failure).toContain(`leases.status ${owner.lease} = TERMINATED`);
    expect(failure).not.toContain('QUALIFIED');

    // Nada aplicado: nenhum CHECK novo, totais ainda int4.
    expect(
      await scalar(
        db,
        sql`select count(*)::int from pg_constraint where conname = 'leads_status_valid'`,
      ),
    ).toBe(0);
    expect(
      await scalar(
        db,
        sql`select data_type from information_schema.columns
            where table_name = 'reconciliations' and column_name = 'local_total_cents'`,
      ),
    ).toBe('integer');

    // A imobiliária corrige os dados e a migração conclui.
    await db.execute(
      sql`update properties set property_type = 'APARTMENT' where id = ${owner.property}`,
    );
    await db.execute(sql`update leads set status = 'NEW' where id = ${lead}`);
    await db.execute(sql`update tasks set status = 'OPEN' where id = ${task}`);
    await db.execute(sql`update leases set status = 'ENDED' where id = ${owner.lease}`);
    await migrate(db, { migrationsFolder: MIGRATIONS });

    expect(
      await scalar(
        db,
        sql`select count(*)::int from pg_constraint where conname = 'leads_status_valid'`,
      ),
    ).toBe(1);
    expect(
      await scalar(
        db,
        sql`select data_type from information_schema.columns
            where table_name = 'reconciliations' and column_name = 'local_total_cents'`,
      ),
    ).toBe('bigint');
    expect(
      await scalar(
        db,
        sql`select indexdef from pg_indexes where indexname = 'party_consents_active_unique'`,
      ),
    ).toContain('WHERE (revoked_at IS NULL)');
  });
});

describe('0022 aplicada (PostgreSQL real): domínio fechado e totais acima de 2^31 − 1', () => {
  const dbName = `aluguei_i22_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let admin: AppDb;
  let db: AppDb;

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    await db.$client.end();
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
  });

  it('valor fora do domínio é recusado (23514) em cadastro, locação, cobrança e pagamento', async () => {
    const owner = await seed(db);
    const charge = randomUUID();
    await db.execute(sql`
      insert into charges (id, org_id, lease_id, period_start, due_date, amount_cents, rent_cents)
      values (${charge}, ${owner.org}, ${owner.lease}, '2026-02-01', '2026-02-10', 150000, 150000)
    `);
    const cases: Array<[string, ReturnType<typeof sql>]> = [
      [
        'leads.status',
        sql`insert into leads (id, org_id, status) values (${randomUUID()}, ${owner.org}, 'CONTACTED')`,
      ],
      [
        'tasks.status',
        sql`insert into tasks (id, org_id, title, status) values (${randomUUID()}, ${owner.org}, 'T', 'TODO')`,
      ],
      [
        'properties.property_type',
        sql`update properties set property_type = 'FLAT' where id = ${owner.property}`,
      ],
      [
        'party_roles.role',
        sql`insert into party_roles (id, org_id, party_id, role) values (${randomUUID()}, ${owner.org}, ${owner.party}, 'OWNER_X')`,
      ],
      [
        'portal_access.kind',
        sql`insert into portal_access (id, org_id, party_id, kind, created_by)
            values (${randomUUID()}, ${owner.org}, ${owner.party}, 'GUEST', ${owner.user})`,
      ],
      ['leases.status', sql`update leases set status = 'TERMINATED' where id = ${owner.lease}`],
      ['charges.status', sql`update charges set status = 'PAID_LATE' where id = ${charge}`],
      [
        'payments.method',
        sql`insert into payments (id, org_id, charge_id, amount_cents, method)
            values (${randomUUID()}, ${owner.org}, ${charge}, 150000, 'CASH')`,
      ],
      [
        'payments.status',
        sql`insert into payments (id, org_id, charge_id, amount_cents, method, status)
            values (${randomUUID()}, ${owner.org}, ${charge}, 150000, 'PIX', 'SETTLED')`,
      ],
    ];
    const results = [];
    for (const [column, statement] of cases) {
      results.push([column, await attempt(db, statement)]);
    }
    expect(results).toEqual(cases.map(([column]) => [column, '23514']));

    // Os valores do domínio continuam aceitos.
    expect(
      await attempt(db, sql`update leases set status = 'ACTIVE' where id = ${owner.lease}`),
    ).toBeNull();
    expect(
      await attempt(
        db,
        sql`insert into payments (id, org_id, charge_id, amount_cents, method)
            values (${randomUUID()}, ${owner.org}, ${charge}, 150000, 'PIX')`,
      ),
    ).toBeNull();
  });

  it('conciliação com cobranças pagas somando mais de 2^31 − 1 centavos grava e lê o total exato', async () => {
    const owner = await seed(db);
    const perCharge = 1_500_000_000; // cabe em int4; a soma das duas, não
    for (const period of ['2026-03-01', '2026-04-01']) {
      await db.execute(sql`
        insert into charges (id, org_id, lease_id, period_start, due_date, status, amount_cents, rent_cents, paid_at)
        values (${randomUUID()}, ${owner.org}, ${owner.lease}, ${period}, ${period}, 'PAID', ${perCharge}, ${perCharge}, now())
      `);
    }
    await processReconcileJob(
      db,
      { id: randomUUID(), orgId: owner.org, payload: { periodStart: '2026-04-01' } },
      null,
    );
    const [row] = await db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.orgId, owner.org));
    expect(row?.localTotalCents).toBe(2 * perCharge);
    expect(row?.localTotalCents).toBeGreaterThan(INT4_MAX);
    expect(typeof row?.localTotalCents, 'o drizzle devolve número, não string').toBe('number');
    expect(row?.status).toBe('DISCREPANCY');
  });

  it('total do provider acima de 2^31 − 1 centavos grava e volta exato pelo drizzle', async () => {
    const owner = await seed(db);
    const total = 9_007_199_254_740_991; // Number.MAX_SAFE_INTEGER: o teto do modo number
    const [inserted] = await db
      .insert(reconciliations)
      .values({
        orgId: owner.org,
        provider: 'FAKE',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        status: 'MATCHED',
        providerTotalCents: total,
        localTotalCents: INT4_MAX + 1,
      })
      .returning();
    const [row] = await db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.id, inserted?.id ?? ''));
    expect(row?.providerTotalCents).toBe(total);
    expect(row?.localTotalCents).toBe(INT4_MAX + 1);
  });

  it('consentimento ativo único por pessoa e finalidade (23505); revogados repetem', async () => {
    const owner = await seed(db);
    const insertConsent = (revoked: boolean): ReturnType<typeof sql> =>
      sql`insert into party_consents (id, org_id, party_id, purpose, revoked_at)
          values (${randomUUID()}, ${owner.org}, ${owner.party}, 'CREDIT_SCREENING', ${revoked ? new Date() : null})`;
    expect(await attempt(db, insertConsent(true))).toBeNull();
    expect(await attempt(db, insertConsent(true))).toBeNull();
    expect(await attempt(db, insertConsent(false))).toBeNull();
    expect(await attempt(db, insertConsent(false))).toBe('23505');
  });
});
