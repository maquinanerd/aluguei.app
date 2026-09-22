/**
 * Aplica as migrations versionadas em um Postgres real (dev/produção).
 * O drizzle-kit migrate exige credenciais no drizzle.config.ts; este script
 * usa o migrator do drizzle-orm/node-postgres com DATABASE_URL (padrão, fora de
 * produção: postgresql://postgres:postgres@localhost:5432/aluguei).
 *
 * Execuções simultâneas (dois deploys, ou `migrate` reiniciado enquanto o anterior
 * ainda roda) esperam umas pelas outras numa trava consultiva do PostgreSQL
 * (`pg_advisory_lock`): quem chega depois encontra as migrations aplicadas e não faz
 * nada. A trava é da sessão: se o processo morrer, o servidor a solta.
 *
 * A saída vai para o log do deploy: só host, porta e banco, nunca usuário e senha.
 *
 * Uso (a partir de packages/db):
 *   pnpm db:apply
 *   DATABASE_URL=... pnpm db:apply
 */
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const DEFAULT_DEV_URL = 'postgresql://postgres:postgres@localhost:5432/aluguei';
/** Chave da trava consultiva: a mesma para qualquer execução deste runner no banco. */
const LOCK_KEY = "hashtextextended('aluguei.app:apply-migrations', 0)";
/** Quanto uma execução espera a outra terminar antes de desistir. */
const LOCK_WAIT = '10min';

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

/** Trechos que nunca podem aparecer na saída: a URL inteira e a senha (crua e decodificada). */
function secretsOf(url) {
  const secrets = [url];
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^:/?#@]*:([^@]*)@/i.exec(url);
  if (match?.[1]) {
    secrets.push(match[1]);
    try {
      secrets.push(decodeURIComponent(match[1]));
    } catch {
      // senha com escape inválido: a forma crua já está na lista
    }
  }
  return secrets.filter((secret) => secret.length > 0);
}

/** Motivo da falha em uma linha por nível de causa, sem pilha e sem objetos do driver. */
function describeError(err) {
  const parts = [];
  let current = err;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const message = typeof current.message === 'string' ? current.message.split('\n')[0] : '';
    const code = typeof current.code === 'string' ? ` [${current.code}]` : '';
    if (message || code) {
      parts.push(`${message}${code}`.trim());
    }
    current = current.cause;
  }
  return parts.length > 0 ? parts.join(' <- ') : String(err);
}

async function main() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (!fromEnv && process.env.NODE_ENV === 'production') {
    console.error('DATABASE_URL ausente: em produção o runner não usa o banco local padrão.');
    return 1;
  }
  const connectionString = fromEnv || DEFAULT_DEV_URL;
  const secrets = secretsOf(connectionString);
  const redact = (text) => secrets.reduce((out, secret) => out.split(secret).join('***'), text);
  const target = describeTarget(connectionString);

  let client;
  try {
    client = new pg.Client({ connectionString });
    // Erro da conexão fora de uma consulta (servidor caiu no meio): vira falha do runner.
    client.on('error', () => undefined);
    await client.connect();

    const { rows } = await client.query(`select pg_try_advisory_lock(${LOCK_KEY}) as locked`);
    if (!rows[0]?.locked) {
      console.log(`Outra execução está aplicando migrations em ${target}; aguardando a trava...`);
      await client.query(`set lock_timeout = '${LOCK_WAIT}'`);
      await client.query(`select pg_advisory_lock(${LOCK_KEY})`);
      await client.query('reset lock_timeout');
    }
    try {
      // O mesmo cliente da trava: um único processo, uma única sessão no banco.
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client.query(`select pg_advisory_unlock(${LOCK_KEY})`);
    }
    console.log('Migrations aplicadas em', target);
    return 0;
  } catch (err) {
    console.error(redact(`Falha ao aplicar migrations em ${target}: ${describeError(err)}`));
    return 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}

process.exitCode = await main();
