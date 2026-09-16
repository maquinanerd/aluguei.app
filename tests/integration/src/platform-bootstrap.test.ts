import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createPlatformAdminAccount } from '@aluguei/api';
import type { AppDb } from '@aluguei/db';
import { parsePlatformAdminEmails } from '@aluguei/domain';
import { buildTestApp } from './helpers.js';
import { call } from './platform-fixtures.js';

/**
 * Conta do admin da plataforma criada no servidor (comando de bootstrap): o cadastro
 * aberto recusa os e-mails da allowlist, então esta é a única porta de entrada.
 */

let app: FastifyInstance;
let db: AppDb;
const allowlist = parsePlatformAdminEmails('plataforma@aluguei.test, reservado@aluguei.test');

beforeAll(async () => {
  app = await buildTestApp();
  db = app.db as AppDb;
});

afterAll(async () => {
  await app.close();
});

describe('bootstrap da conta do admin da plataforma', () => {
  it('cria a conta de um e-mail da allowlist, que entra como admin sem imobiliária', async () => {
    const result = await createPlatformAdminAccount(db, allowlist, {
      email: '  Reservado@Aluguei.test ',
      name: 'Admin Bootstrap',
      password: 'senha-bem-longa-123',
    });
    expect(result).toBe('CREATED');

    const login = await call(app, 'POST', '/auth/login', {
      remoteAddress: '10.220.0.1',
      payload: { email: 'reservado@aluguei.test', password: 'senha-bem-longa-123' },
    });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    expect(login.body).toMatchObject({ platformAdmin: true, org: null, membership: null });

    const audit = await db.execute(sql`
      select count(*)::int as n from audit_events
      where action = 'platform.admin.bootstrapped' and entity_type = 'USER'
    `);
    expect((audit.rows[0] as { n: number }).n).toBe(1);
  });

  it('conta existente não é alterada (a senha continua a mesma)', async () => {
    const result = await createPlatformAdminAccount(db, allowlist, {
      email: 'reservado@aluguei.test',
      name: 'Outro nome',
      password: 'outra-senha-bem-longa',
    });
    expect(result).toBe('EXISTS');
    const oldPassword = await call(app, 'POST', '/auth/login', {
      remoteAddress: '10.220.0.2',
      payload: { email: 'reservado@aluguei.test', password: 'senha-bem-longa-123' },
    });
    expect(oldPassword.status).toBe(200);
  });

  it('recusa e-mail fora da allowlist e senha curta, sem gravar nada', async () => {
    await expect(
      createPlatformAdminAccount(db, allowlist, {
        email: 'intruso@aluguei.test',
        name: 'Intruso',
        password: 'senha-bem-longa-123',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      createPlatformAdminAccount(db, allowlist, {
        email: 'plataforma@aluguei.test',
        name: 'Admin',
        password: 'curta',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const users = await db.execute(sql`
      select count(*)::int as n from users where email in ('intruso@aluguei.test', 'plataforma@aluguei.test')
    `);
    expect((users.rows[0] as { n: number }).n).toBe(0);
  });
});
