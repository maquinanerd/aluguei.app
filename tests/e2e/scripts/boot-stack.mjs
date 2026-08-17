/**
 * Boot da stack local para E2E (Playwright webServer):
 *   PostgreSQL 17 (cluster isolado na porta 5433) → migrations → API (porta
 *   4000, providers FAKE via env) → worker → web (porta 3000).
 * Nenhum efeito externo real; sem credenciais.
 *
 * Variáveis: PG_BIN (default C:\Program Files\PostgreSQL\17\bin),
 * ALUGUEI_TMP (default <os.tmpdir>/aluguei-e2e), PORTAS padrão 5433/4000/3000.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PG_BIN = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\17\\bin';
const ROOT = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DATA = process.env.ALUGUEI_TMP ?? join(tmpdir(), 'aluguei-e2e');
const PG_PORT = process.env.PG_PORT ?? '5433';
const API_PORT = process.env.API_PORT ?? '4000';
const WEB_PORT = process.env.WEB_PORT ?? '3000';
const PG_DATA = join(DATA, 'pg');
const API_URL = `http://127.0.0.1:${API_PORT}`;

mkdirSync(DATA, { recursive: true });

const children = [];
let pgStarted = false;

function log(msg) {
  console.log(`[boot] ${msg}`);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function startPg() {
  if (!existsSync(join(PG_DATA, 'PG_VERSION'))) {
    log('initdb do cluster isolado...');
    run(join(PG_BIN, 'initdb.exe'), ['-D', PG_DATA, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8']);
  }
  run(join(PG_BIN, 'pg_ctl.exe'), [
    '-D',
    PG_DATA,
    '-o',
    `-p ${PG_PORT}`,
    '-l',
    join(DATA, 'pg.log'),
    'start',
  ]);
  pgStarted = true;
}

async function waitFor(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timeout esperando ${url}`);
}

function spawnChild(cmd, args, env) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' });
  child.on('exit', (code) => {
    if (code !== null && code !== 0 && process.env.DEBUG_E2E) {
      log(`child ${cmd} saiu com código ${code}`);
    }
  });
  children.push(child);
  return child;
}

async function main() {
  const DATABASE_URL = `postgresql://postgres@localhost:${PG_PORT}/aluguei`;
  const baseEnv = {
    DATABASE_URL,
    APP_BASE_URL: `http://localhost:${WEB_PORT}`,
    API_BASE_URL: API_URL,
    COOKIE_SECURE: 'false',
    META_MODE: 'dry_run',
    AI_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'FAKE',
    SIGNATURE_PROVIDER: 'FAKE',
    SCREENING_PROVIDER: 'FAKE',
    LOG_LEVEL: 'info',
  };

  startPg();
  try {
    run(
      join(PG_BIN, 'psql.exe'),
      ['-h', 'localhost', '-p', PG_PORT, '-U', 'postgres', '-c', 'CREATE DATABASE aluguei;'],
      { stdio: 'pipe' },
    );
  } catch {
    // database já existe
  }
  log('aplicando migrations...');
  run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', '@aluguei/db', 'db:apply'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL },
  });

  log(`API em ${API_URL}...`);
  spawnChild(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], baseEnv);
  await waitFor(`${API_URL}/health`);

  log('worker...');
  spawnChild(process.execPath, ['--import', 'tsx', 'apps/worker/src/index.ts'], baseEnv);

  log(`web em :${WEB_PORT}...`);
  spawnChild(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@aluguei/web', 'dev'],
    {
      ...baseEnv,
      API_BASE_URL: API_URL,
    },
  );
  await waitFor(`http://localhost:${WEB_PORT}`);
  log('stack pronta.');
}

function shutdown() {
  log('desligando stack...');
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // já morto
    }
  }
  if (pgStarted) {
    try {
      run(join(PG_BIN, 'pg_ctl.exe'), ['-D', PG_DATA, 'stop', '-m', 'fast']);
    } catch {
      // já parado
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[boot] falha:', err.message);
  shutdown();
});
