import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createPlatformAdminAccount, resetPlatformAdminPassword } from '@aluguei/api';
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

describe('redefinição da senha do admin da plataforma', () => {
  /**
   * O admin não tem outra porta: o cadastro aberto recusa a allowlist e a recuperação por
   * link depende de e-mail, que nenhum ambiente envia. Sem isto, admin sem senha fica sem
   * acesso.
   */
  it('troca a senha, derruba as sessões abertas e registra auditoria', async () => {
    await createPlatformAdminAccount(db, allowlist, {
      email: 'plataforma@aluguei.test',
      name: 'Admin Redefine',
      password: 'senha-inicial-bem-longa',
    });
    const antes = await call(app, 'POST', '/auth/login', {
      remoteAddress: '10.221.0.1',
      payload: { email: 'plataforma@aluguei.test', password: 'senha-inicial-bem-longa' },
    });
    expect(antes.status, JSON.stringify(antes.body)).toBe(200);

    const { revokedSessions } = await resetPlatformAdminPassword(db, allowlist, {
      email: '  Plataforma@Aluguei.test ',
      password: 'senha-nova-bem-longa-2',
    });
    expect(revokedSessions).toBe(1);

    const senhaAntiga = await call(app, 'POST', '/auth/login', {
      remoteAddress: '10.221.0.2',
      payload: { email: 'plataforma@aluguei.test', password: 'senha-inicial-bem-longa' },
    });
    expect(senhaAntiga.status).toBe(401);
    const senhaNova = await call(app, 'POST', '/auth/login', {
      remoteAddress: '10.221.0.3',
      payload: { email: 'plataforma@aluguei.test', password: 'senha-nova-bem-longa-2' },
    });
    expect(senhaNova.status, JSON.stringify(senhaNova.body)).toBe(200);

    const audit = await db.execute(sql`
      select count(*)::int as n from audit_events
      where action = 'platform.admin.password_reset' and entity_type = 'USER'
    `);
    expect((audit.rows[0] as { n: number }).n).toBe(1);
  });

  it('recusa e-mail fora da allowlist, senha curta e conta inexistente', async () => {
    await expect(
      resetPlatformAdminPassword(db, allowlist, {
        email: 'intruso@aluguei.test',
        password: 'senha-nova-bem-longa',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      resetPlatformAdminPassword(db, allowlist, {
        email: 'reservado@aluguei.test',
        password: 'curta',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      resetPlatformAdminPassword(db, parsePlatformAdminEmails('ninguem@aluguei.test'), {
        email: 'ninguem@aluguei.test',
        password: 'senha-nova-bem-longa',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const ainda = await call(app, 'POST', '/auth/login', {
      remoteAddress: '10.221.0.4',
      payload: { email: 'reservado@aluguei.test', password: 'senha-bem-longa-123' },
    });
    expect(ainda.status).toBe(200);
  });
});
