/**
 * Aplica as migrations versionadas em um Postgres real (dev/produção).
 * O drizzle-kit migrate exige credenciais no drizzle.config.ts; este script
 * usa o migrator do drizzle-orm/node-postgres com DATABASE_URL (padrão
 * postgresql://postgres:postgres@localhost:5432/aluguei).
 *
 * Uso (a partir de packages/db):
 *   pnpm db:apply
 *   DATABASE_URL=... pnpm db:apply
 */
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/aluguei';
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Host, porta e banco — nunca usuário e senha: este log vai para o deploy. */
function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '(DATABASE_URL inválida)';
  }
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);
try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations aplicadas em', describeTarget(connectionString));
} finally {
  await pool.end();
}
