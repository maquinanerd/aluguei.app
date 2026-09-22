import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { dropTestDatabase } from './pg-test-database.js';

/**
 * Migration 0023 contra PostgreSQL real: CHECK em `timeline_events.entity_type` e
 * `reconciliations.provider`, as duas colunas que o inventário da trilha G (G3, P2-12) deixou sem
 * CHECK porque o contrato não descrevia o que a API e o worker gravam. O pré-voo aborta sem
 * aplicar nada e nomeia cada linha fora do vocabulário, como o da 0022.
 * Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));
const LAST_BEFORE = '0022_domain_checks_bigint_totals';
const tempDirs: string[] = [];

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Cópia das migrations com o journal cortado em `lastTag` (banco "de antes"). */
function migrationsUpTo(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'aluguei-0023-'));
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

async function scalar(db: AppDb, statement: ReturnType<typeof sql>): Promise<unknown> {
  const result = await db.execute(statement);
  return Object.values(result.rows[0] as Record<string, unknown>)[0];
}

const constraintCount = (db: AppDb) =>
  scalar(
    db,
    sql`select count(*)::int from pg_constraint
        where conname in ('timeline_events_entity_type_valid', 'reconciliations_provider_valid')`,
  );

describe('migration 0023 (PostgreSQL real): vocabulário da timeline e do provider da conciliação', () => {
  const dbName = `aluguei_m23_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  it('valor fora do vocabulário aborta sem aplicar nada e nomeia a linha; corrigido, migra e recusa', async () => {
    const org = randomUUID();
    await db.execute(
      sql`insert into organizations (id, name, slug) values (${org}, 'Org 0023', ${`org-${org}`})`,
    );
    const badEvent = randomUUID();
    const badReconciliation = randomUUID();
    await db.execute(sql`
      insert into timeline_events (id, org_id, entity_type, entity_id, event_type)
      values (${badEvent}, ${org}, 'CHANNEL', ${randomUUID()}, 'X')
    `);
    await db.execute(sql`
      insert into reconciliations (id, org_id, provider, period_start, period_end, status)
      values (${badReconciliation}, ${org}, 'PAGARME', '2026-01-01', '2026-01-01', 'MATCHED')
    `);
    // Linhas válidas, com os valores que a API e o worker gravam hoje.
    const valid: string[] = [];
    for (const entityType of ['LEAD', 'CONVERSATION', 'LISTING', 'RENTAL_APPLICATION']) {
      const id = randomUUID();
      valid.push(id);
      await db.execute(sql`
        insert into timeline_events (id, org_id, entity_type, entity_id, event_type)
        values (${id}, ${org}, ${entityType}, ${randomUUID()}, 'X')
      `);
    }
    for (const provider of ['FAKE', 'NONE']) {
      const id = randomUUID();
      valid.push(id);
      await db.execute(sql`
        insert into reconciliations (id, org_id, provider, period_start, period_end, status)
        values (${id}, ${org}, ${provider}, '2026-01-01', '2026-01-01', 'DISCREPANCY')
      `);
    }

    let failure: string | null = null;
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS });
    } catch (error) {
      failure = errorMessages(error);
    }
    expect(failure, 'o pré-voo tem de abortar a 0023').not.toBeNull();
    expect(failure).toContain('Migracao 0023 abortada');
    expect(failure).toContain(`timeline_events.entity_type ${badEvent} = CHANNEL`);
    expect(failure).toContain(`reconciliations.provider ${badReconciliation} = PAGARME`);
    for (const id of valid) {
      expect(failure, 'linha válida não entra na lista').not.toContain(id);
    }
    expect(await constraintCount(db), 'nada aplicado').toBe(0);

    // Corrigidos os dados, a migração conclui.
    await db.execute(sql`update timeline_events set entity_type = 'LEAD' where id = ${badEvent}`);
    await db.execute(
      sql`update reconciliations set provider = 'NONE' where id = ${badReconciliation}`,
    );
    await migrate(db, { migrationsFolder: MIGRATIONS });
    expect(await constraintCount(db)).toBe(2);

    // Depois da 0023, o banco recusa o vocabulário antigo (23514, check_violation).
    const refused: Array<[string, ReturnType<typeof sql>]> = [
      [
        'timeline_events.entity_type',
        sql`insert into timeline_events (org_id, entity_type, entity_id, event_type)
            values (${org}, 'CHANNEL', ${randomUUID()}, 'X')`,
      ],
      [
        'reconciliations.provider',
        sql`insert into reconciliations (org_id, provider, period_start, period_end)
            values (${org}, 'PAGARME', '2026-01-01', '2026-01-01')`,
      ],
    ];
    for (const [label, statement] of refused) {
      let code: string | null = null;
      try {
        await db.execute(statement);
      } catch (error) {
        code = pgCode(error);
      }
      expect(code, label).toBe('23514');
    }
  });
});
