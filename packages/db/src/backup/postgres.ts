import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import pg from 'pg';

/**
 * pg_dump e pg_restore com a conexão por variáveis de ambiente (PGHOST, PGPASSWORD…), nunca na
 * linha de comando: a senha não aparece na lista de processos nem no log.
 */
export function connectionEnv(url: string): Record<string, string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL do banco inválida (esperado postgresql://…)');
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error('URL do banco inválida (esperado postgresql://…)');
  }
  const env: Record<string, string> = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  };
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/** Host, porta e banco — o que pode ir para o log. */
export function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '(URL inválida)';
  }
}

export interface ToolRun {
  code: number | null;
  stderr: string;
}

function collect(child: ReturnType<typeof spawn>): Promise<ToolRun> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stderr: stderr.trim() });
    });
  });
}

/** pg_dump em formato custom para a saída padrão, que o chamador cifra em fluxo. */
export function startDump(bin: string, url: string): { output: Readable; done: Promise<ToolRun> } {
  const child = spawn(bin, ['--format=custom', '--no-owner', '--no-privileges'], {
    env: { ...process.env, ...connectionEnv(url) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return { output: child.stdout, done: collect(child) };
}

/** Restauração numa transação só: se algo falha, o banco de destino fica como estava. */
export function runRestore(bin: string, url: string, dumpPath: string): Promise<ToolRun> {
  const env = connectionEnv(url);
  // Sem --dbname o pg_restore gera SQL na saída em vez de restaurar: só o nome vai no argumento,
  // o resto da conexão (usuário e senha) vai no ambiente.
  const child = spawn(
    bin,
    [
      `--dbname=${env.PGDATABASE ?? ''}`,
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-privileges',
      dumpPath,
    ],
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    },
  );
  return collect(child);
}

/** Conferência do arquivo decifrado sem banco: `pg_restore --list` lê o sumário inteiro. */
export function runList(bin: string, dumpPath: string): Promise<ToolRun> {
  const child = spawn(bin, ['--list', dumpPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  return collect(child);
}

/** Quantas tabelas o banco já tem fora dos esquemas do sistema. */
export async function countUserTables(url: string): Promise<number> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables
       where table_schema not in ('pg_catalog', 'information_schema')`,
    );
    return result.rows[0]?.n ?? 0;
  } finally {
    await client.end();
  }
}
