/**
 * Backup e restauração do banco (G3, trilha F2, plano de continuação Fase 6).
 *
 *   backup            pg_dump (formato custom) cifrado em fluxo para BACKUP_DIR e retenção
 *   restore <arquivo> decifra, autentica e restaura em TARGET_DATABASE_URL, que precisa estar vazio
 *   verify <arquivo>  decifra, autentica e confere o sumário com `pg_restore --list`
 *   schedule          serviço: um backup por dia em BACKUP_HOUR_UTC, e um logo ao subir se o último
 *                     tiver mais de 24 h; grava `status.json` para o healthcheck
 *   health            healthcheck do serviço: último backup bom com menos de BACKUP_MAX_AGE_HOURS
 *
 * Ambiente: DATABASE_URL (backup), TARGET_DATABASE_URL (restore), BACKUP_DIR, BACKUP_ENCRYPTION_KEY
 * (hex de 64), BACKUP_KEEP (padrão 14), BACKUP_HOUR_UTC (padrão 6), BACKUP_MAX_AGE_HOURS (padrão 26),
 * PG_DUMP e PG_RESTORE (padrão: do PATH). O log é JSON por linha, sem credencial.
 */
import { mkdtemp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { BackupIntegrityError, decryptFile, encryptStream, parseEncryptionKey } from './crypto.js';
import { backupFileName, parseBackupFileName, selectForDeletion } from './names.js';
import { countUserTables, describeTarget, runList, runRestore, startDump } from './postgres.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} ausente`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} precisa ser um número inteiro`);
  }
  return value;
}

const pgDump = (): string => process.env.PG_DUMP ?? 'pg_dump';
const pgRestore = (): string => process.env.PG_RESTORE ?? 'pg_restore';

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Um backup cifrado; devolve o nome do arquivo. */
export async function backup(): Promise<string> {
  const url = required('DATABASE_URL');
  const dir = required('BACKUP_DIR');
  const key = parseEncryptionKey(required('BACKUP_ENCRYPTION_KEY'));
  const keep = intEnv('BACKUP_KEEP', 14);
  selectForDeletion([], keep); // valida BACKUP_KEEP antes de gastar um dump
  await mkdir(dir, { recursive: true });

  const started = Date.now();
  const name = backupFileName(new Date());
  const partial = join(dir, `${name}.part`);
  const dump = startDump(pgDump(), url);
  try {
    await encryptStream(dump.output, partial, key);
  } catch (err) {
    await dump.done.catch(() => undefined);
    await rm(partial, { force: true });
    throw err;
  }
  const result = await dump.done;
  if (result.code !== 0) {
    await rm(partial, { force: true });
    throw new Error(`pg_dump falhou (código ${String(result.code)}): ${result.stderr}`);
  }
  const final = join(dir, name);
  if (await exists(final)) {
    await rm(partial, { force: true });
    throw new Error(`${name} já existe: dois backups no mesmo segundo`);
  }
  await rename(partial, final);
  const { size } = await stat(final);

  const removed = selectForDeletion(await readdir(dir), keep);
  for (const old of removed) {
    await rm(join(dir, old), { force: true });
  }
  log('backup.done', {
    database: describeTarget(url),
    file: name,
    bytes: size,
    durationMs: Date.now() - started,
    removed,
  });
  return name;
}

async function withDecrypted<T>(file: string, run: (dumpPath: string) => Promise<T>): Promise<T> {
  const key = parseEncryptionKey(required('BACKUP_ENCRYPTION_KEY'));
  const scratch = await mkdtemp(join(tmpdir(), 'aluguei-restore-'));
  const dumpPath = join(scratch, 'backup.dump');
  try {
    await decryptFile(file, dumpPath, key);
    return await run(dumpPath);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

export async function verify(file: string): Promise<void> {
  await withDecrypted(file, async (dumpPath) => {
    const result = await runList(pgRestore(), dumpPath);
    if (result.code !== 0) {
      throw new Error(`pg_restore --list falhou (código ${String(result.code)}): ${result.stderr}`);
    }
  });
  log('backup.verified', { file: basename(file) });
}

export async function restore(file: string): Promise<void> {
  const url = required('TARGET_DATABASE_URL');
  const tables = await countUserTables(url);
  if (tables > 0) {
    throw new Error(
      `O banco de destino ${describeTarget(url)} não está vazio (${String(tables)} tabelas): a restauração só entra num banco novo`,
    );
  }
  const started = Date.now();
  await withDecrypted(file, async (dumpPath) => {
    const result = await runRestore(pgRestore(), url, dumpPath);
    if (result.code !== 0) {
      throw new Error(`pg_restore falhou (código ${String(result.code)}): ${result.stderr}`);
    }
  });
  log('backup.restored', {
    file: basename(file),
    database: describeTarget(url),
    durationMs: Date.now() - started,
  });
}

interface ScheduleStatus {
  lastSuccessAt: string | null;
  lastFile: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;
}

async function readStatus(dir: string): Promise<ScheduleStatus> {
  try {
    return JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')) as ScheduleStatus;
  } catch {
    return {
      lastSuccessAt: null,
      lastFile: null,
      lastErrorAt: null,
      lastError: null,
      nextRunAt: null,
    };
  }
}

async function writeStatus(dir: string, status: ScheduleStatus): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'status.json'), `${JSON.stringify(status, null, 2)}\n`);
}

/** Próximo horário `hour`:00 UTC depois de `now`. */
export function nextRunAfter(now: Date, hour: number): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
  return next.getTime() > now.getTime() ? next : new Date(next.getTime() + DAY_MS);
}

async function latestBackupAt(dir: string): Promise<Date | null> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const dates = names.flatMap((name) => {
    const at = parseBackupFileName(name);
    return at ? [at] : [];
  });
  return dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

async function schedule(): Promise<void> {
  const dir = required('BACKUP_DIR');
  const hour = intEnv('BACKUP_HOUR_UTC', 6);
  if (hour < 0 || hour > 23) {
    throw new Error('BACKUP_HOUR_UTC precisa estar entre 0 e 23');
  }
  // Configuração conferida na subida: chave e banco com erro derrubam o serviço já.
  parseEncryptionKey(required('BACKUP_ENCRYPTION_KEY'));
  required('DATABASE_URL');

  // Lido por função: o sinal muda o valor por fora do laço, depois de cada await.
  const state = { stopping: false };
  const stopping = (): boolean => state.stopping;
  let wake: (() => void) | null = null;
  const stop = (signal: string): void => {
    log('backup.schedule.stopping', { signal });
    state.stopping = true;
    wake?.();
  };
  process.on('SIGTERM', () => {
    stop('SIGTERM');
  });
  process.on('SIGINT', () => {
    stop('SIGINT');
  });

  const runOnce = async (): Promise<void> => {
    const status = await readStatus(dir);
    try {
      const file = await backup();
      status.lastSuccessAt = new Date().toISOString();
      status.lastFile = file;
    } catch (err) {
      status.lastErrorAt = new Date().toISOString();
      status.lastError = err instanceof Error ? err.message : String(err);
      log('backup.failed', { error: status.lastError });
    }
    await writeStatus(dir, status);
  };

  const latest = await latestBackupAt(dir);
  if (!latest || Date.now() - latest.getTime() > DAY_MS) {
    await runOnce();
  }
  while (!stopping()) {
    const next = nextRunAfter(new Date(), hour);
    const status = await readStatus(dir);
    status.nextRunAt = next.toISOString();
    await writeStatus(dir, status);
    log('backup.schedule.waiting', { nextRunAt: status.nextRunAt });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, next.getTime() - Date.now());
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    wake = null;
    if (!stopping()) {
      await runOnce();
    }
  }
  log('backup.schedule.stopped');
}

/** Healthcheck: o último backup bom é recente o bastante. */
async function health(): Promise<void> {
  const dir = required('BACKUP_DIR');
  const maxAgeHours = intEnv('BACKUP_MAX_AGE_HOURS', 26);
  const status = await readStatus(dir);
  const last = status.lastSuccessAt ? Date.parse(status.lastSuccessAt) : Number.NaN;
  if (Number.isNaN(last) || Date.now() - last > maxAgeHours * 60 * 60 * 1000) {
    throw new Error(
      `sem backup bom nas últimas ${String(maxAgeHours)} h (último: ${status.lastSuccessAt ?? 'nenhum'}; erro: ${status.lastError ?? 'nenhum'})`,
    );
  }
}

async function main(argv: string[]): Promise<void> {
  const [command, file] = argv;
  switch (command) {
    case 'backup':
      await backup();
      return;
    case 'restore':
      if (!file) throw new Error('uso: restore <arquivo .dump.enc>');
      await restore(file);
      return;
    case 'verify':
      if (!file) throw new Error('uso: verify <arquivo .dump.enc>');
      await verify(file);
      return;
    case 'schedule':
      await schedule();
      return;
    case 'health':
      await health();
      return;
    default:
      throw new Error('uso: backup | restore <arquivo> | verify <arquivo> | schedule | health');
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('cli.ts') || entry.endsWith('cli.js')) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    const message =
      err instanceof BackupIntegrityError || err instanceof Error ? err.message : String(err);
    process.stderr.write(`${JSON.stringify({ event: 'backup.error', error: message })}\n`);
    process.exit(1);
  });
}
