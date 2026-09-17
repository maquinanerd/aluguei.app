import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { dropTestDatabase } from './pg-test-database.js';

/**
 * Runner de migrations (`packages/db/scripts/apply-migrations.mjs`) contra PostgreSQL real
 * (auditoria 2026-09-10, P2-12; G3, Trilha F, item F-10): duas execuções simultâneas — dois
 * deploys, ou `migrate` reiniciado enquanto o anterior ainda roda — não podem disputar a mesma
 * cadeia de migrations, e a saída do script vai para o log do deploy, então nunca pode trazer a
 * senha do banco. Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUNNER = fileURLToPath(
  new URL('../../../packages/db/scripts/apply-migrations.mjs', import.meta.url),
);
const JOURNAL = fileURLToPath(
  new URL('../../../packages/db/drizzle/meta/_journal.json', import.meta.url),
);
/** Senha fictícia e inconfundível: o cluster de teste aceita qualquer senha (trust). */
const PASSWORD = `SenhaDoBanco-${randomUUID().replaceAll('-', '').slice(0, 16)}`;

function databaseUrl(name: string, password?: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  if (password !== undefined) {
    url.username = url.username || 'postgres';
    url.password = password;
  }
  return url.toString();
}

interface RunnerResult {
  code: number | null;
  output: string;
}

/** Executa o runner real como processo separado (o mesmo comando do serviço `migrate`). */
function runRunner(databaseUrlValue: string): Promise<RunnerResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrlValue };
  delete env.NODE_ENV;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function journalEntries(): number {
  const journal = JSON.parse(readFileSync(JOURNAL, 'utf8')) as { entries: unknown[] };
  return journal.entries.length;
}

describe('runner de migrations (PostgreSQL real)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const concurrentDb = `aluguei_mr_${suffix}`;
  const secretDb = `aluguei_ms_${suffix}`;
  let admin: AppDb;

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${concurrentDb}`));
    await admin.execute(sql.raw(`create database ${secretDb}`));
  });

  afterAll(async () => {
    await dropTestDatabase(admin, concurrentDb);
    await dropTestDatabase(admin, secretDb);
    await admin.$client.end();
  });

  it('duas execuções simultâneas terminam bem e cada migration é aplicada uma vez', async () => {
    const target = createDb(databaseUrl(concurrentDb));
    const holder = await target.$client.connect();
    let released = false;
    try {
      // Barreira determinística: a tabela de controle do drizzle existe, mas fica travada até
      // as duas execuções estarem esperando. Sem coordenação, as duas leem "nada aplicado" e
      // aplicam a mesma cadeia ao mesmo tempo.
      await holder.query('create schema drizzle');
      await holder.query(
        'create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
      );
      await holder.query('begin');
      await holder.query('lock table drizzle.__drizzle_migrations in access exclusive mode');

      const first = runRunner(databaseUrl(concurrentDb));
      const second = runRunner(databaseUrl(concurrentDb));

      const deadline = Date.now() + 60_000;
      let waiting = 0;
      while (Date.now() < deadline) {
        const result = await admin.execute(
          sql`select count(*)::int as n from pg_stat_activity where datname = ${concurrentDb} and wait_event_type = 'Lock'`,
        );
        waiting = (result.rows[0] as { n: number }).n;
        if (waiting >= 2) {
          break;
        }
        await sleep(100);
      }
      expect(waiting, 'as duas execuções precisam estar esperando antes de soltar a barreira').toBe(
        2,
      );
      await holder.query('commit');
      released = true;

      const [a, b] = await Promise.all([first, second]);
      expect(a.code, `primeira execução:\n${a.output}`).toBe(0);
      expect(b.code, `segunda execução:\n${b.output}`).toBe(0);

      const applied = await target.execute(
        sql`select count(*)::int as n, count(distinct hash)::int as distinct_hashes from drizzle.__drizzle_migrations`,
      );
      const row = applied.rows[0] as { n: number; distinct_hashes: number };
      expect(row.n).toBe(journalEntries());
      expect(row.distinct_hashes).toBe(journalEntries());
      const organizations = await target.execute(
        sql`select to_regclass('public.organizations')::text as name`,
      );
      expect((organizations.rows[0] as { name: string | null }).name).toBe('organizations');
    } finally {
      if (!released) {
        await holder.query('rollback').catch(() => undefined);
      }
      holder.release();
      await target.$client.end();
    }
  });

  describe('nunca imprime a senha do banco', () => {
    const assertNoSecret = (result: RunnerResult): void => {
      expect(result.output).not.toContain(PASSWORD);
      expect(result.output).not.toContain(encodeURIComponent(PASSWORD));
    };

    it('execução com sucesso: mostra só host, porta e banco', async () => {
      const result = await runRunner(databaseUrl(secretDb, PASSWORD));
      expect(result.code, result.output).toBe(0);
      assertNoSecret(result);
      expect(result.output).toContain(`/${secretDb}`);
    });

    it('banco inexistente: falha com o motivo e sem a senha', async () => {
      const result = await runRunner(databaseUrl(`${secretDb}_inexistente`, PASSWORD));
      expect(result.code).not.toBe(0);
      assertNoSecret(result);
      expect(result.output).toMatch(/does not exist|não existe|3D000/);
    });

    it('servidor inalcançável: falha sem a senha', async () => {
      const url = new URL(databaseUrl(secretDb, PASSWORD));
      url.hostname = '127.0.0.1';
      url.port = '1';
      const result = await runRunner(url.toString());
      expect(result.code).not.toBe(0);
      assertNoSecret(result);
    });

    it('URL malformada: falha sem a senha', async () => {
      const result = await runRunner(`postgresql://postgres:${PASSWORD}@localhost:porta/${secretDb}`);
      expect(result.code).not.toBe(0);
      assertNoSecret(result);
    });
  });
});
