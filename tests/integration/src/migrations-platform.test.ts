import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * Migration do admin da plataforma sobre um banco que já tem imobiliárias: as
 * existentes continuam operando (ACTIVE, plano ILIMITADO), os planos padrão são
 * semeados e uma organização nova nasce aguardando aprovação no plano ESSENCIAL.
 */

const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));
const LAST_BEFORE_PLATFORM = '0017_inspection_suggestion_status';
const tempDirs: string[] = [];

type Row = Record<string, unknown>;

async function databaseUpTo(tag: string): Promise<{
  run: (statement: SQL) => Promise<Row[]>;
  migrateRest: () => Promise<void>;
  close: () => Promise<void>;
}> {
  const folder = mkdtempSync(join(tmpdir(), 'aluguei-migracoes-plataforma-'));
  tempDirs.push(folder);
  cpSync(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string }>;
  };
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  if (last < 0) {
    throw new Error(`migration ${tag} não encontrada`);
  }
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));

  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: folder });
  return {
    run: async (statement) => (await db.execute(statement)).rows as Row[],
    migrateRest: () => migrate(db, { migrationsFolder: MIGRATIONS }),
    close: () => client.close(),
  };
}

describe('migration do admin da plataforma', () => {
  afterAll(() => {
    for (const folder of tempDirs) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('imobiliária existente continua ACTIVE no plano ILIMITADO; nova nasce pendente no ESSENCIAL', async () => {
    const database = await databaseUpTo(LAST_BEFORE_PLATFORM);
    try {
      const legacy = randomUUID();
      await database.run(
        sql`insert into organizations (id, name, slug) values (${legacy}, 'Org legada', ${`org-${legacy}`})`,
      );

      await database.migrateRest();

      const [legacyRow] = await database.run(sql`
        select o.status, o.status_reason, p.code
        from organizations o join plans p on p.id = o.plan_id
        where o.id = ${legacy}
      `);
      expect(legacyRow).toMatchObject({ status: 'ACTIVE', status_reason: null, code: 'ILIMITADO' });

      const plans = await database.run(sql`
        select code, max_users, max_properties, max_published_listings, is_active
        from plans order by code
      `);
      expect(plans).toEqual([
        {
          code: 'ESSENCIAL',
          max_users: 3,
          max_properties: 50,
          max_published_listings: 20,
          is_active: true,
        },
        {
          code: 'ILIMITADO',
          max_users: null,
          max_properties: null,
          max_published_listings: null,
          is_active: true,
        },
        {
          code: 'PROFISSIONAL',
          max_users: 10,
          max_properties: 300,
          max_published_listings: 150,
          is_active: true,
        },
      ]);

      const fresh = randomUUID();
      await database.run(
        sql`insert into organizations (id, name, slug) values (${fresh}, 'Org nova', ${`org-${fresh}`})`,
      );
      const [freshRow] = await database.run(sql`
        select o.status, p.code from organizations o join plans p on p.id = o.plan_id
        where o.id = ${fresh}
      `);
      expect(freshRow).toMatchObject({ status: 'PENDING_APPROVAL', code: 'ESSENCIAL' });

      await expect(
        database.run(sql`update organizations set status = 'BLOQUEADA' where id = ${fresh}`),
      ).rejects.toThrow();
      await expect(
        database.run(sql`update plans set max_users = 0 where code = 'ESSENCIAL'`),
      ).rejects.toThrow();
      await expect(database.run(sql`delete from plans where code = 'ESSENCIAL'`)).rejects.toThrow();
    } finally {
      await database.close();
    }
  });
});
