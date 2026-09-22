import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import {
  FakePaymentProvider,
  FakeScreeningProvider,
  FakeSignatureProvider,
} from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { FakeStorageService } from './fakes.js';
import { createFinanceFixtures } from './finance-fixtures.js';
import { testEnv } from './helpers.js';
import { dropTestDatabase } from './pg-test-database.js';
import { futurePeriod } from './test-dates.js';

/**
 * G3, trilha F2 (plano de continuação, Fase 6): o backup só vale se a restauração for provada. A
 * suíte cria um banco com uma locação de verdade (contrato assinado, cobrança, pagamento e
 * repasse), roda o backup pela linha de comando que a homologação agenda, restaura num banco vazio
 * e compara todas as tabelas, linha a linha. Adulteração, chave errada e destino com dados são
 * recusados sem tocar no destino. Exige TEST_DATABASE_URL e `pg_dump`/`pg_restore` 17 no PATH (ou
 * PG_DUMP e PG_RESTORE).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de restauração exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

interface CliResult {
  code: number | null;
  output: string;
}

/** A mesma linha de comando que o serviço de backup da homologação usa. */
function runBackupCli(args: string[], env: Record<string, string>): Promise<CliResult> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  delete childEnv.DATABASE_URL;
  Object.assign(childEnv, env);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'packages/db/src/backup/cli.ts', ...args],
      { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code, output });
    });
  });
}

describe('backup e restauração (PostgreSQL real)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const sourceName = `aluguei_bk_src_${suffix}`;
  const targets: string[] = [];
  const screening = new FakeScreeningProvider();
  const signature = new FakeSignatureProvider();
  const payments = new FakePaymentProvider();
  const key = randomBytes(32).toString('hex');
  let admin: AppDb;
  let source: AppDb;
  let app: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${sourceName}`));
    source = createDb(databaseUrl(sourceName));
    await migrate(source, { migrationsFolder: MIGRATIONS });
    app = await buildApp({
      db: source,
      env: testEnv,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      signature,
      payments,
      logger: { level: 'error' },
    });
    const fx = createFinanceFixtures(app, () =>
      runInboxJobs({ db: source, limit: 20, screening, signature, payments }),
    );
    // Dados de verdade em várias tabelas: locação, cobrança paga, split, repasse e razão.
    const lease = await fx.setupLease({ rentCents: 123_456, landlord: true });
    const { chargeId } = await fx.issueCharge(lease, futurePeriod());
    const payment = await fx.initiate(lease, chargeId);
    await payments.confirmCharge(payment.pcid);
    expect(await fx.paymentWebhook('PAYMENT_CONFIRMED', payment.pcid, payment.amountCents)).toBe(
      200,
    );
    await runInboxJobs({ db: source, limit: 20, screening, signature, payments });
    dir = await mkdtemp(join(tmpdir(), 'aluguei-backup-pg-'));
  });

  afterAll(async () => {
    await app.close();
    await source.$client.end();
    for (const name of [sourceName, ...targets]) {
      await dropTestDatabase(admin, name);
    }
    await admin.$client.end();
    await rm(dir, { recursive: true, force: true });
  });

  async function emptyDatabase(): Promise<{ name: string; url: string }> {
    const name = `aluguei_bk_dst_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    await admin.execute(sql.raw(`create database ${name}`));
    targets.push(name);
    return { name, url: databaseUrl(name) };
  }

  /** Contagem e hash das linhas de cada tabela dos esquemas da aplicação. */
  async function fingerprint(url: string): Promise<Record<string, string>> {
    const db = createDb(url);
    try {
      const tables = (
        await db.execute(sql`
          select table_schema as schema, table_name as name from information_schema.tables
          where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
          order by 1, 2
        `)
      ).rows as Array<{ schema: string; name: string }>;
      const result: Record<string, string> = {};
      for (const table of tables) {
        const qualified = `"${table.schema}"."${table.name}"`;
        const row = (
          await db.execute(
            sql.raw(
              `select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '-') as h from ${qualified} t`,
            ),
          )
        ).rows[0] as { n: number; h: string };
        result[`${table.schema}.${table.name}`] = `${String(row.n)}:${row.h}`;
      }
      return result;
    } finally {
      await db.$client.end();
    }
  }

  async function tableCount(url: string): Promise<number> {
    const db = createDb(url);
    try {
      const row = (
        await db.execute(sql`
          select count(*)::int as n from information_schema.tables
          where table_schema not in ('pg_catalog', 'information_schema')
        `)
      ).rows[0] as { n: number };
      return row.n;
    } finally {
      await db.$client.end();
    }
  }

  const backups = async (): Promise<string[]> =>
    (await readdir(dir)).filter((name) => name.endsWith('.dump.enc')).sort();

  it('backup cifrado restaura num banco vazio com todas as tabelas iguais, linha a linha', async () => {
    const backup = await runBackupCli(['backup'], {
      DATABASE_URL: databaseUrl(sourceName),
      BACKUP_DIR: dir,
      BACKUP_ENCRYPTION_KEY: key,
    });
    expect(backup.code, backup.output).toBe(0);
    expect(backup.output, 'a saída não mostra a URL com credencial').not.toContain(ADMIN_URL);
    const [file] = await backups();
    expect(file).toMatch(/^aluguei-\d{8}T\d{6}Z\.dump\.enc$/);
    const sealed = await readFile(join(dir, file ?? ''));
    expect(sealed.subarray(0, 12).toString('utf8')).toBe('ALUGUEI-BKP1');
    expect(sealed.includes(Buffer.from('PGDMP')), 'o dump não fica em claro').toBe(false);

    const verify = await runBackupCli(['verify', join(dir, file ?? '')], {
      BACKUP_ENCRYPTION_KEY: key,
    });
    expect(verify.code, verify.output).toBe(0);

    const target = await emptyDatabase();
    const restore = await runBackupCli(['restore', join(dir, file ?? '')], {
      TARGET_DATABASE_URL: target.url,
      BACKUP_ENCRYPTION_KEY: key,
    });
    expect(restore.code, restore.output).toBe(0);

    const before = await fingerprint(databaseUrl(sourceName));
    const after = await fingerprint(target.url);
    expect(Object.keys(before).length).toBeGreaterThan(40);
    expect(before['public.payouts']?.startsWith('1:'), 'a origem tem o repasse').toBe(true);
    expect(after).toEqual(before);
  });

  it('backup adulterado ou com chave errada não chega ao banco de destino', async () => {
    const [file] = await backups();
    const tampered = join(dir, 'adulterado.bin');
    const bytes = await readFile(join(dir, file ?? ''));
    const middle = Math.floor(bytes.length / 2);
    bytes[middle] = (bytes[middle] ?? 0) ^ 0x01;
    await writeFile(tampered, bytes);

    for (const [label, input, cryptoKey] of [
      ['adulterado', tampered, key],
      ['chave errada', join(dir, file ?? ''), randomBytes(32).toString('hex')],
    ] as const) {
      const target = await emptyDatabase();
      const restore = await runBackupCli(['restore', input], {
        TARGET_DATABASE_URL: target.url,
        BACKUP_ENCRYPTION_KEY: cryptoKey,
      });
      expect(restore.code, `${label}: ${restore.output}`).not.toBe(0);
      expect(restore.output, label).toContain('corrompido ou com a chave errada');
      expect(await tableCount(target.url), `${label}: destino intocado`).toBe(0);
    }
  });

  it('restauração recusa destino com dados', async () => {
    const [file] = await backups();
    const restore = await runBackupCli(['restore', join(dir, file ?? '')], {
      TARGET_DATABASE_URL: databaseUrl(sourceName),
      BACKUP_ENCRYPTION_KEY: key,
    });
    expect(restore.code, restore.output).not.toBe(0);
    expect(restore.output).toContain('não está vazio');
    const before = await fingerprint(databaseUrl(sourceName));
    expect(before['public.payouts']?.startsWith('1:')).toBe(true);
  });

  it('retenção mantém os N mais novos depois de cada backup', async () => {
    // Backups antigos simulados, com nomes de dias já passados.
    for (let day = 1; day <= 15; day += 1) {
      const name = `aluguei-202601${String(day).padStart(2, '0')}T060000Z.dump.enc`;
      await copyFile(join(dir, (await backups()).at(-1) ?? ''), join(dir, name));
    }
    const backup = await runBackupCli(['backup'], {
      DATABASE_URL: databaseUrl(sourceName),
      BACKUP_DIR: dir,
      BACKUP_ENCRYPTION_KEY: key,
      BACKUP_KEEP: '14',
    });
    expect(backup.code, backup.output).toBe(0);
    const left = await backups();
    expect(left).toHaveLength(14);
    expect(left.filter((name) => name.startsWith('aluguei-202601'))).toHaveLength(12);
    expect(left.some((name) => name.startsWith('aluguei-20260101'))).toBe(false);
  });
});
