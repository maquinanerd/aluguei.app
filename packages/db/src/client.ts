import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index.js';

export type AppDb = ReturnType<typeof drizzleNode<typeof schema>>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Conecta ao PostgreSQL real (produção/dev). */
export function createDb(connectionString: string): AppDb {
  const pool = new Pool({ connectionString });
  return drizzleNode(pool, { schema });
}

/**
 * Cria banco Postgres in-process (PGlite/WASM) com as migrations versionadas aplicadas.
 * Usado em testes de integração — sem Docker e fiel a FKs/constraints.
 */
export async function createTestDb(): Promise<AppDb> {
  const pgLite = new PGlite();
  const db = drizzlePglite(pgLite, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as AppDb;
}
