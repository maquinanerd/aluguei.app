/**
 * Cria a conta de um admin da plataforma (e-mail listado em PLATFORM_ADMIN_EMAILS).
 *
 *   node --import tsx apps/api/src/cli/create-platform-admin.ts --email voce@exemplo.com --name "Seu nome"
 *
 * A senha é lida da entrada padrão: digitada sem eco no terminal ou enviada por pipe
 * (uma linha). Nunca é aceita como argumento nem impressa. Conta existente não muda.
 */
import { parseArgs } from 'node:util';
import { loadEnv } from '@aluguei/config';
import { createDb } from '@aluguei/db';
import { DomainError, parsePlatformAdminEmails } from '@aluguei/domain';
import { createPlatformAdminAccount, PLATFORM_ADMIN_MIN_PASSWORD } from '../platform/bootstrap.js';

async function readPassword(): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    }
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  }
  process.stdout.write(`Senha (mínimo ${String(PLATFORM_ADMIN_MIN_PASSWORD)} caracteres): `);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let password = '';
    const onData = (key: string) => {
      for (const char of key) {
        if (char === '') {
          stdin.setRawMode(false);
          reject(new Error('cancelado'));
          return;
        }
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        if (char === '' || char === '\b') {
          password = password.slice(0, -1);
        } else {
          password += char;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  if (!values.email || !values.name) {
    process.stderr.write('Uso: create-platform-admin --email <e-mail> --name "<nome>"\n');
    return 2;
  }
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    process.stderr.write('DATABASE_URL ausente\n');
    return 2;
  }
  const allowlist = parsePlatformAdminEmails(env.PLATFORM_ADMIN_EMAILS);
  const password = await readPassword();
  const db = createDb(env.DATABASE_URL);
  try {
    const result = await createPlatformAdminAccount(db, allowlist, {
      email: values.email,
      name: values.name,
      password,
    });
    process.stdout.write(
      result === 'CREATED'
        ? `Conta de admin da plataforma criada para ${values.email.trim().toLowerCase()}.\n`
        : 'A conta já existia e não foi alterada; o acesso de admin vem de PLATFORM_ADMIN_EMAILS.\n',
    );
    return 0;
  } catch (error) {
    if (error instanceof DomainError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  } finally {
    await db.$client.end();
  }
}

process.exitCode = await main();
