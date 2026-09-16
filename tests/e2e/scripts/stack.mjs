/**
 * Stack local para os testes E2E (Playwright):
 *   PostgreSQL → migrations → API → worker → web (next dev).
 * Providers FAKE via env (pagamento, assinatura, crédito), Meta em dry-run e
 * IA mock: nenhum efeito externo real, nenhuma credencial.
 *
 * Banco:
 *   - padrão: cluster PostgreSQL 17 descartável, criado do zero a cada
 *     execução (initdb em diretório novo), porta PG_PORT (5433), binários em
 *     PG_BIN;
 *   - E2E_DATABASE_URL definido (ex.: serviço postgres do CI): usa esse banco.
 *
 * Robustez (auditoria 2026-09-10, P2-15):
 *   - pg_ctl roda com stdio 'ignore' + `-w` + `-l arquivo`: com stdio em pipe o
 *     postgres herda o handle e o execFileSync nunca retorna no Windows;
 *   - cada execução usa um diretório novo — um cluster parcialmente
 *     inicializado nunca é reaproveitado; o que sobrou de uma execução anterior
 *     que não desligou é parado e removido no boot seguinte;
 *   - portas ocupadas ou um `next dev` deste projeto já rodando abortam o boot
 *     com mensagem clara (não sobe uma segunda instância);
 *   - stdout/stderr de cada processo vão para arquivo; um processo que morre
 *     antes de ficar pronto aborta o boot mostrando o fim do log;
 *   - teardown mata a árvore de processos (taskkill /T no Windows, grupo de
 *     processos no POSIX) e para o postgres com `pg_ctl stop`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IS_WIN = process.platform === 'win32';
export const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const norm = (s) => s.replaceAll('\\', '/').toLowerCase();
const projectKey = createHash('sha1').update(norm(ROOT)).digest('hex').slice(0, 10);
// Um diretório de execuções por checkout: dois worktrees não se atrapalham.
const RUNS_DIR = process.env.ALUGUEI_E2E_RUNS ?? join(tmpdir(), 'aluguei-e2e-runs', projectKey);
const STATE_FILE = join(RUNS_DIR, 'current.json');
const PG_BIN =
  process.env.PG_BIN ??
  (IS_WIN ? 'C:\\Program Files\\PostgreSQL\\17\\bin' : '/usr/lib/postgresql/17/bin');

export const PORTS = {
  pg: Number(process.env.PG_PORT ?? 5433),
  api: Number(process.env.API_PORT ?? 4000),
  web: Number(process.env.WEB_PORT ?? 3000),
};

const pgExe = (name) => join(PG_BIN, IS_WIN ? `${name}.exe` : name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function log(msg) {
  console.log(`[e2e-stack] ${msg}`);
}

function tail(file, lines = 40) {
  try {
    return readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '(sem log)';
  }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Comando curto com saída em arquivo (nunca em pipe). */
function runLogged(cmd, args, logFile, opts = {}) {
  const fd = openSync(logFile, 'a');
  try {
    execFileSync(cmd, args, {
      // `input` vai pela entrada padrão (senha do admin da plataforma nunca em argumento).
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', fd, fd],
      windowsHide: true,
      timeout: 180_000,
      ...opts,
    });
  } catch (err) {
    throw new Error(`${cmd} falhou: ${String(err.message).split('\n')[0]}\n${tail(logFile)}`);
  } finally {
    closeSync(fd);
  }
}

function portInUse(port) {
  const probe = (host) =>
    new Promise((resolvePromise) => {
      const socket = createConnection({ port, host });
      const done = (value) => {
        socket.destroy();
        resolvePromise(value);
      };
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.setTimeout(1500, () => done(false));
    });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([v4, v6]) => v4 || v6);
}

export async function isHttpUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Processos (pid + linha de comando) — usado para confirmar dono antes de matar. */
function listProcesses() {
  try {
    if (IS_WIN) {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
          timeout: 30_000,
        },
      );
      return out
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [pid, ...rest] = line.split('\t');
          return { pid: Number(pid), cmd: rest.join('\t') };
        });
    }
    return readdirSync('/proc')
      .filter((d) => /^\d+$/.test(d))
      .map((d) => {
        try {
          return {
            pid: Number(d),
            cmd: readFileSync(`/proc/${d}/cmdline`, 'utf8').replaceAll('\0', ' '),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function belongsToProject(pid) {
  const proc = listProcesses().find((p) => p.pid === pid);
  return Boolean(proc && norm(proc.cmd).includes(norm(ROOT)));
}

/** `next dev` (ou seu servidor filho) rodando a partir deste checkout. */
function projectNextDevPids() {
  const root = norm(ROOT);
  return listProcesses()
    .filter(({ cmd }) => {
      const c = norm(cmd);
      return (
        c.includes(root) &&
        ((c.includes('next/dist/bin/next') && / dev(\s|$)/.test(c)) ||
          c.includes('next/dist/server/lib/start-server'))
      );
    })
    .map((p) => p.pid);
}

function killTree(pid) {
  if (!pid || !isAlive(pid)) return;
  try {
    if (IS_WIN) {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    // já encerrado
  }
}

function startPostgres(pgData, runDir) {
  const opts = [`-p ${PORTS.pg}`];
  if (!IS_WIN) {
    opts.push(`-k ${runDir}`);
  }
  try {
    execFileSync(
      pgExe('pg_ctl'),
      [
        '-D',
        pgData,
        '-o',
        opts.join(' '),
        '-l',
        join(runDir, 'postgres.log'),
        '-w',
        '-t',
        '60',
        'start',
      ],
      { stdio: 'ignore', windowsHide: true, timeout: 90_000 },
    );
  } catch (err) {
    throw new Error(
      `pg_ctl start falhou: ${String(err.message).split('\n')[0]}\n${tail(join(runDir, 'postgres.log'))}`,
    );
  }
}

function stopPostgres(pgData) {
  if (!existsSync(join(pgData, 'postmaster.pid'))) return;
  try {
    execFileSync(pgExe('pg_ctl'), ['-D', pgData, '-m', 'fast', '-w', '-t', '60', 'stop'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 90_000,
    });
  } catch {
    // já parado
  }
}

function spawnLogged(label, cmd, args, { cwd, env, logFile }) {
  const fd = openSync(logFile, 'a');
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    // POSIX: líder de grupo, para o teardown matar a árvore inteira.
    detached: !IS_WIN,
  });
  closeSync(fd);
  child.on('error', (err) => {
    child.spawnError = err;
  });
  return Object.assign(child, { label, logFile });
}

function assertRunning(child) {
  if (child.spawnError || child.exitCode !== null || child.signalCode !== null) {
    const why = child.spawnError?.message ?? `código ${child.exitCode ?? child.signalCode}`;
    throw new Error(
      `${child.label} encerrou antes de ficar pronto (${why}).\n${tail(child.logFile)}`,
    );
  }
}

async function waitForHttp(url, child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertRunning(child);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return;
    } catch {
      // ainda subindo
    }
    await sleep(1000);
  }
  throw new Error(`timeout esperando ${url}.\n${tail(child.logFile)}`);
}

async function waitForLog(child, text, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertRunning(child);
    if (tail(child.logFile, 200).includes(text)) return;
    await sleep(500);
  }
  throw new Error(`timeout esperando "${text}" em ${child.label}.\n${tail(child.logFile)}`);
}

/**
 * Admin da plataforma do E2E (mesmos valores em src/g2-b1-support.ts): a conta é criada
 * pelo comando de servidor, como na homologação — o cadastro aberto recusa este e-mail.
 */
export const E2E_PLATFORM_ADMIN = {
  email: 'plataforma@e2e.aluguei.test',
  name: 'Admin da Plataforma E2E',
  password: 'e2e-plataforma-senha-123',
};

function stackEnv(databaseUrl) {
  const env = { ...process.env };
  // REDIS_URL derruba a API no boot (P1-14, Fase 6) — nunca herdar no E2E.
  delete env.REDIS_URL;
  return {
    ...env,
    DATABASE_URL: databaseUrl,
    API_PORT: String(PORTS.api),
    APP_BASE_URL: `http://localhost:${PORTS.web}`,
    API_BASE_URL: `http://127.0.0.1:${PORTS.api}`,
    COOKIE_SECURE: 'false',
    META_MODE: 'dry_run',
    AI_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'FAKE',
    SIGNATURE_PROVIDER: 'FAKE',
    SCREENING_PROVIDER: 'FAKE',
    LOG_LEVEL: 'info',
    NEXT_TELEMETRY_DISABLED: '1',
    PLATFORM_ADMIN_EMAILS: E2E_PLATFORM_ADMIN.email,
  };
}

/**
 * Para o que restou de uma execução anterior deste checkout e remove os
 * diretórios de execução (inclusive clusters parcialmente inicializados).
 * Uma stack "manual" (boot-stack.mjs) ainda viva não é derrubada: o boot falha
 * pedindo `E2E_REUSE_STACK=1` ou `node scripts/boot-stack.mjs --stop`.
 */
export function cleanupStale({ force = false } = {}) {
  const prev = loadState();
  if (prev) {
    const alive = (prev.procs ?? []).filter((p) => isAlive(p.pid) && belongsToProject(p.pid));
    if (alive.length > 0 && prev.mode === 'manual' && !force) {
      throw new Error(
        `stack manual em execução (PIDs ${alive.map((p) => p.pid).join(', ')}): use E2E_REUSE_STACK=1 ou pare com \`node tests/e2e/scripts/boot-stack.mjs --stop\`.`,
      );
    }
    log(`execução anterior (${prev.runId}) não foi desligada; parando o que restou...`);
    stopStack(prev, { stale: true });
  }
  if (!existsSync(RUNS_DIR)) return;
  for (const entry of readdirSync(RUNS_DIR)) {
    if (!entry.startsWith('run-')) continue;
    const dir = join(RUNS_DIR, entry);
    stopPostgres(join(dir, 'pgdata'));
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch (err) {
      log(`não foi possível remover ${dir}: ${err.message}`);
    }
  }
}

export async function bootStack({ mode = 'playwright' } = {}) {
  log(`boot (${mode}) · execuções em ${RUNS_DIR}`);
  cleanupStale();

  log('verificando portas e processos existentes...');
  const external = process.env.E2E_DATABASE_URL;
  const ports = { api: PORTS.api, web: PORTS.web, ...(external ? {} : { postgres: PORTS.pg }) };
  const busy = [];
  for (const [name, port] of Object.entries(ports)) {
    if (await portInUse(port)) busy.push(`${name} (${port})`);
  }
  if (busy.length > 0) {
    throw new Error(
      `portas ocupadas: ${busy.join(', ')} — outra stack/aplicação está no ar. Pare-a ou defina PG_PORT/API_PORT/WEB_PORT.`,
    );
  }
  const nextDevs = projectNextDevPids();
  if (nextDevs.length > 0) {
    throw new Error(
      `já existe \`next dev\` deste checkout rodando (PID ${nextDevs.join(', ')}); dois \`next dev\` não coexistem em apps/web.`,
    );
  }

  const runId = `run-${Date.now()}`;
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  const state = { runId, runDir, root: ROOT, mode, pgData: null, procs: [], ports: PORTS };
  saveState(state);
  const track = (child) => {
    state.procs.push({ name: child.label, pid: child.pid });
    saveState(state);
  };

  try {
    let databaseUrl = external;
    if (!databaseUrl) {
      state.pgData = join(runDir, 'pgdata');
      saveState(state);
      log(`initdb em ${state.pgData}...`);
      runLogged(
        pgExe('initdb'),
        ['-D', state.pgData, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8'],
        join(runDir, 'initdb.log'),
      );
      if (!existsSync(join(state.pgData, 'PG_VERSION'))) {
        throw new Error(`initdb não concluiu.\n${tail(join(runDir, 'initdb.log'))}`);
      }
      log(`postgres na porta ${PORTS.pg}...`);
      startPostgres(state.pgData, runDir);
      runLogged(
        pgExe('createdb'),
        ['-h', 'localhost', '-p', String(PORTS.pg), '-U', 'postgres', 'aluguei'],
        join(runDir, 'createdb.log'),
      );
      databaseUrl = `postgresql://postgres@localhost:${PORTS.pg}/aluguei`;
    }

    log('aplicando migrations...');
    runLogged(
      process.execPath,
      [join(ROOT, 'packages/db/scripts/apply-migrations.mjs')],
      join(runDir, 'migrations.log'),
      { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl } },
    );
    const env = stackEnv(databaseUrl);

    log('conta do admin da plataforma...');
    runLogged(
      process.execPath,
      [
        '--import',
        'tsx',
        join(ROOT, 'apps/api/src/cli/create-platform-admin.ts'),
        '--email',
        E2E_PLATFORM_ADMIN.email,
        '--name',
        E2E_PLATFORM_ADMIN.name,
      ],
      join(runDir, 'platform-admin.log'),
      {
        cwd: ROOT,
        env,
        input: `${E2E_PLATFORM_ADMIN.password}
`,
      },
    );

    log(`API em :${PORTS.api}...`);
    const api = spawnLogged(
      'api',
      process.execPath,
      ['--import', 'tsx', join(ROOT, 'apps/api/src/index.ts')],
      { cwd: ROOT, env, logFile: join(runDir, 'api.log') },
    );
    track(api);
    await waitForHttp(`http://127.0.0.1:${PORTS.api}/health`, api);

    log('worker...');
    const worker = spawnLogged(
      'worker',
      process.execPath,
      ['--import', 'tsx', join(ROOT, 'apps/worker/src/index.ts')],
      { cwd: ROOT, env, logFile: join(runDir, 'worker.log') },
    );
    track(worker);
    await waitForLog(worker, 'worker started');

    log(`web (next dev) em :${PORTS.web}...`);
    const web = spawnLogged(
      'web',
      process.execPath,
      [join(ROOT, 'apps/web/node_modules/next/dist/bin/next'), 'dev', '--port', String(PORTS.web)],
      { cwd: join(ROOT, 'apps/web'), env, logFile: join(runDir, 'web.log') },
    );
    track(web);
    await waitForHttp(`http://localhost:${PORTS.web}/`, web, 300_000);

    log(`stack pronta (logs em ${runDir}).`);
    return state;
  } catch (err) {
    stopStack(state);
    throw err;
  }
}

/**
 * Para a stack registrada em current.json (usado pelo globalTeardown e por
 * `boot-stack.mjs --stop`). `onlyMode` limita a um modo (ex.: não derrubar
 * uma stack manual reutilizada via E2E_REUSE_STACK=1).
 */
export function stopRecordedStack({ onlyMode } = {}) {
  const state = loadState();
  if (!state) {
    log('nenhuma stack registrada.');
    return;
  }
  if (onlyMode && state.mode !== onlyMode) {
    log(`stack registrada é "${state.mode}" — mantida no ar.`);
    return;
  }
  stopStack(state, { stale: true });
}

/** Mata a árvore de cada processo, para o postgres e remove os dados do cluster. */
export function stopStack(state, { stale = false } = {}) {
  const procs = [...(state.procs ?? [])].reverse();
  for (const p of procs) {
    if (!p.pid || !isAlive(p.pid)) continue;
    if (stale && !belongsToProject(p.pid)) {
      log(`PID ${p.pid} (${p.name}) não pertence mais a esta stack — ignorado.`);
      continue;
    }
    killTree(p.pid);
  }
  if (!IS_WIN) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && procs.some((p) => isAlive(p.pid))) {
      sleepSync(200);
    }
    for (const p of procs) {
      try {
        process.kill(-p.pid, 'SIGKILL');
      } catch {
        // já encerrado
      }
    }
  }
  if (state.pgData) {
    stopPostgres(state.pgData);
    try {
      rmSync(state.pgData, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch (err) {
      log(`não foi possível remover ${state.pgData}: ${err.message}`);
    }
  }
  if (loadState()?.runId === state.runId) {
    rmSync(STATE_FILE, { force: true });
  }
  log(`stack ${state.runId} desligada.`);
}
