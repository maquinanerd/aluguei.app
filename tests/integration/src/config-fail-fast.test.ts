import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * P1-12 (auditoria 2026-09-10) no processo real: API e worker subiam em produção sem banco,
 * sem segredos de webhook e com providers FAKE por omissão. Os pontos de entrada rodam como
 * na homologação (`node --import tsx apps/<app>/src/index.ts`), com ambiente limpo, e precisam
 * terminar sozinhos com uma mensagem que diga o que falta. A configuração da homologação com
 * `ALLOW_FAKE_PROVIDERS=true` continua subindo.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HEX_64 = 'b'.repeat(64);

/** Só o necessário para o Node e o tsx rodarem: nada de configuração herdada da máquina. */
function baseEnv(): NodeJS.ProcessEnv {
  const keep = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'windir',
    'ComSpec',
    'TEMP',
    'TMP',
    'TMPDIR',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env;
}

const HOMOLOGATION_API: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  API_HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://aluguei:senha@127.0.0.1:1/aluguei',
  APP_BASE_URL: 'https://aluguei.example.com',
  CORS_ORIGINS: 'https://aluguei.example.com',
  COOKIE_SECURE: 'true',
  PAYMENT_PROVIDER: 'FAKE',
  SIGNATURE_PROVIDER: 'FAKE',
  SCREENING_PROVIDER: 'FAKE',
  META_MODE: 'dry_run',
  AI_PROVIDER: 'mock',
  SIGNATURE_WEBHOOK_TOKEN: HEX_64,
  ASAAS_WEBHOOK_TOKEN: HEX_64,
  META_APP_SECRET: HEX_64,
  META_WEBHOOK_VERIFY_TOKEN: HEX_64,
  META_TOKEN_ENCRYPTION_KEY: HEX_64,
};

const HOMOLOGATION_WORKER: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://aluguei:senha@127.0.0.1:1/aluguei',
  APP_BASE_URL: 'https://aluguei.example.com',
  PAYMENT_PROVIDER: 'FAKE',
  SIGNATURE_PROVIDER: 'FAKE',
  SCREENING_PROVIDER: 'FAKE',
  META_MODE: 'dry_run',
  AI_PROVIDER: 'mock',
  META_TOKEN_ENCRYPTION_KEY: HEX_64,
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface Started {
  child: ChildProcess;
  output: () => string;
  exited: Promise<number | null>;
}

/** Os mesmos pontos de entrada do compose da homologação. */
const ENTRY = {
  api: 'apps/api/src/index.ts',
  worker: 'apps/worker/src/main.ts',
} as const;

function start(app: 'api' | 'worker', env: NodeJS.ProcessEnv): Started {
  const child = spawn(process.execPath, ['--import', 'tsx', ENTRY[app]], {
    cwd: ROOT,
    env: { ...baseEnv(), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => {
      resolve(code);
    });
  });
  return { child, output: () => output, exited };
}

/** Espera o processo terminar sozinho; se ainda estiver no ar no prazo, derruba e devolve null. */
async function waitExit(started: Started, timeoutMs = 30_000): Promise<number | null | 'running'> {
  const outcome = await Promise.race([
    started.exited,
    sleep(timeoutMs).then(() => 'running' as const),
  ]);
  if (outcome === 'running') {
    started.child.kill();
    await started.exited;
  }
  return outcome;
}

async function waitFor(check: () => Promise<boolean>, started: Started, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (started.child.exitCode !== null) {
      return false;
    }
    if (await check()) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

describe('fail-fast de configuração nos processos reais (P1-12)', () => {
  it('API em produção sem configuração termina sozinha e lista o que falta', async () => {
    const port = await freePort();
    const api = start('api', { NODE_ENV: 'production', API_PORT: String(port) });
    const code = await waitExit(api);
    const output = api.output();
    expect(code, output).not.toBe('running');
    expect(code, output).not.toBe(0);
    for (const name of [
      'DATABASE_URL',
      'APP_BASE_URL',
      'ASAAS_WEBHOOK_TOKEN',
      'SIGNATURE_WEBHOOK_TOKEN',
      'META_APP_SECRET',
      'META_WEBHOOK_VERIFY_TOKEN',
      'META_TOKEN_ENCRYPTION_KEY',
      'PAYMENT_PROVIDER',
      'SIGNATURE_PROVIDER',
      'META_MODE',
      'AI_PROVIDER',
    ]) {
      expect(output, name).toContain(name);
    }
    expect(output).not.toContain('api listening');
  });

  it('API sem NODE_ENV não assume desenvolvimento', async () => {
    const port = await freePort();
    const api = start('api', { API_PORT: String(port) });
    const code = await waitExit(api);
    expect(code, api.output()).not.toBe('running');
    expect(code).not.toBe(0);
    expect(api.output()).toContain('NODE_ENV ausente');
  });

  it('API com a configuração da homologação e sem ALLOW_FAKE_PROVIDERS não sobe', async () => {
    const port = await freePort();
    const api = start('api', { ...HOMOLOGATION_API, API_PORT: String(port) });
    const code = await waitExit(api);
    expect(code, api.output()).not.toBe('running');
    expect(code).not.toBe(0);
    expect(api.output()).toContain('ALLOW_FAKE_PROVIDERS=true');
    expect(api.output()).toContain('PAYMENT_PROVIDER=FAKE');
  });

  it('API com a configuração da homologação e ALLOW_FAKE_PROVIDERS=true sobe e responde', async () => {
    const port = await freePort();
    const api = start('api', {
      ...HOMOLOGATION_API,
      ALLOW_FAKE_PROVIDERS: 'true',
      API_PORT: String(port),
    });
    try {
      const up = await waitFor(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${String(port)}/health`);
          return res.status === 200;
        } catch {
          return false;
        }
      }, api);
      expect(up, api.output()).toBe(true);
    } finally {
      api.child.kill();
      await api.exited;
    }
  });

  it('worker em produção sem configuração termina sozinho e lista o que falta', async () => {
    const worker = start('worker', { NODE_ENV: 'production' });
    const code = await waitExit(worker);
    const output = worker.output();
    expect(code, output).not.toBe('running');
    expect(code, output).not.toBe(0);
    for (const name of [
      'DATABASE_URL',
      'PAYMENT_PROVIDER',
      'SCREENING_PROVIDER',
      'META_MODE',
      'AI_PROVIDER',
    ]) {
      expect(output, name).toContain(name);
    }
    expect(output).not.toContain('worker started');
  });

  it('worker sem NODE_ENV não assume desenvolvimento', async () => {
    const worker = start('worker', { DATABASE_URL: 'postgresql://aluguei@127.0.0.1:1/aluguei' });
    const code = await waitExit(worker);
    expect(code, worker.output()).not.toBe('running');
    expect(code).not.toBe(0);
    expect(worker.output()).toContain('NODE_ENV ausente');
  });

  it('worker com a configuração da homologação e ALLOW_FAKE_PROVIDERS=true sobe', async () => {
    const worker = start('worker', { ...HOMOLOGATION_WORKER, ALLOW_FAKE_PROVIDERS: 'true' });
    try {
      const up = await waitFor(
        () => Promise.resolve(worker.output().includes('worker started')),
        worker,
      );
      expect(up, worker.output()).toBe(true);
    } finally {
      worker.child.kill();
      await worker.exited;
    }
  });
});
