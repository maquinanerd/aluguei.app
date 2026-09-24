/**
 * Cria a conta de um admin da plataforma (e-mail listado em PLATFORM_ADMIN_EMAILS).
 *
 *   node --import tsx apps/api/src/cli/create-platform-admin.ts --email voce@exemplo.com --name "Seu nome"
 *
 * A senha é lida da entrada padrão: digitada sem eco no terminal ou enviada por pipe
 * (uma linha). Nunca é aceita como argumento nem impressa. Conta existente não muda.
 *
 * Para trocar a senha de uma conta que já existe (o admin não tem outra porta: o cadastro
 * aberto recusa a allowlist e a recuperação por link depende de e-mail, que nenhum ambiente
 * envia), some `--reset-password`; aí `--name` não é usado e todas as sessões caem:
 *
 *   node --import tsx apps/api/src/cli/create-platform-admin.ts --email voce@exemplo.com --reset-password
 */
import { parseArgs } from 'node:util';
import { loadEnv } from '@aluguei/config';
import { createDb } from '@aluguei/db';
import { DomainError, parsePlatformAdminEmails } from '@aluguei/domain';
import {
  createPlatformAdminAccount,
  resetPlatformAdminPassword,
  PLATFORM_ADMIN_MIN_PASSWORD,
} from '../platform/bootstrap.js';

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
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'reset-password': { type: 'boolean' },
    },
  });
  const redefinir = values['reset-password'] === true;
  if (!values.email || (!redefinir && !values.name)) {
    process.stderr.write(
      'Uso: create-platform-admin --email <e-mail> --name "<nome>"\n' +
        '     create-platform-admin --email <e-mail> --reset-password\n',
    );
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
    if (redefinir) {
      const { revokedSessions } = await resetPlatformAdminPassword(db, allowlist, {
        email: values.email,
        password,
      });
      process.stdout.write(
        `Senha redefinida para ${values.email.trim().toLowerCase()}. Sessões encerradas: ${String(revokedSessions)}.\n`,
      );
      return 0;
    }
    const result = await createPlatformAdminAccount(db, allowlist, {
      email: values.email,
      name: values.name ?? '',
      password,
    });
    process.stdout.write(
      result === 'CREATED'
        ? `Conta de admin da plataforma criada para ${values.email.trim().toLowerCase()}.\n`
        : 'A conta já existia e não foi alterada; use --reset-password para trocar a senha.\n',
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
