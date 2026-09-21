import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { buildApp } from '@aluguei/api';
import { createDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { FakeStorageService } from './fakes.js';
import { testEnv } from './helpers.js';
import { dropTestDatabase } from './pg-test-database.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';

/**
 * Token de uso único sob concorrência REAL (PostgreSQL, conexões distintas do pool) — G3, trilha
 * D, P2-04. A redefinição de senha e o aceite do convite travam a linha do token: um segundo uso
 * que chega enquanto o primeiro ainda não confirmou espera, vê o token usado e recebe 404. Sem a
 * trava, o segundo lia o token ainda livre e também valia: duas senhas trocadas pelo mesmo link,
 * ou duas contas criadas pelo mesmo convite. O PGlite serializa as transações e não reproduz a
 * corrida. Exige TEST_DATABASE_URL (ver finance-concurrency.pg.test.ts).
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
if (!ADMIN_URL) {
  throw new Error(
    'TEST_DATABASE_URL ausente: a suíte de concorrência real exige PostgreSQL (ex.: postgresql://postgres@localhost:5432/postgres).',
  );
}
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

const tokenFrom = (body: string): string => {
  const match = /token=([A-Za-z0-9_-]+)/.exec(body);
  if (!match?.[1]) {
    throw new Error(`mensagem sem token: ${body}`);
  }
  return match[1];
};

describe('concorrência real (PostgreSQL): token de uso único', () => {
  const dbName = `aluguei_tk_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let admin: AppDb;
  let db: AppDb;
  let app: FastifyInstance;
  let ip = 0;
  const nextIp = (): string => {
    ip += 1;
    return `10.55.0.${String(ip)}`;
  };

  beforeAll(async () => {
    admin = createDb(ADMIN_URL);
    await admin.execute(sql.raw(`create database ${dbName}`));
    db = createDb(databaseUrl(dbName));
    await migrate(db, { migrationsFolder: MIGRATIONS });
    app = await buildApp({
      db,
      env: testEnv,
      config: { cookieSecure: false },
      storage: new FakeStorageService(),
      logger: { level: 'error' },
    });
  });

  afterAll(async () => {
    await app.close();
    await db.$client.end();
    await dropTestDatabase(admin, dbName);
    await admin.$client.end();
  });

  /** Transação aberta que segura a linha até `release()`, simulando o primeiro uso em voo. */
  const holdInFlight = async (
    statement: ReturnType<typeof sql>,
  ): Promise<{ release: () => void; done: Promise<void> }> => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const rowLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const done = db.transaction(async (tx) => {
      await tx.execute(statement);
      locked();
      await released;
    });
    await rowLocked;
    return { release, done };
  };

  it('redefinição de senha: o segundo uso do link espera o primeiro e recebe 404', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id);
    const asked = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      remoteAddress: nextIp(),
      payload: { email: agency.user.email },
    });
    expect(asked.statusCode).toBe(200);
    const [message] = (
      await db.execute(sql`
        select body from email_outbox where to_email = ${agency.user.email}
        order by created_at desc limit 1
      `)
    ).rows as Array<{ body: string }>;
    const token = tokenFrom(message?.body ?? '');

    // Primeiro uso em voo: o token já foi marcado como usado nesta transação, ainda sem commit.
    const first = await holdInFlight(sql`
      update password_reset_tokens set used_at = now()
      where user_id = ${agency.user.id} and used_at is null
    `);
    const second = app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      remoteAddress: nextIp(),
      payload: { token, newPassword: 'senha-do-segundo-uso' },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    first.release();
    await first.done;
    const res = await second;
    expect(res.statusCode, res.body).toBe(404);

    const completed = (
      await db.execute(sql`
        select count(*)::int as n from audit_events
        where action = 'auth.password_reset_completed' and entity_id = ${agency.user.id}
      `)
    ).rows as Array<{ n: number }>;
    expect(completed[0]?.n).toBe(0);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress: nextIp(),
      payload: { email: agency.user.email, password: 'senha-segura-123' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('convite: o segundo aceite espera o primeiro e recebe 404, sem segunda conta', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id);
    const email = `corrida-${randomUUID().slice(0, 8)}@example.com`;
    const invited = await call(app, 'POST', `/organizations/${agency.org.id}/invites`, {
      cookie: agency.cookie,
      payload: { email, role: 'agent' },
    });
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
    const [message] = (
      await db.execute(sql`
        select body from email_outbox where org_id = ${agency.org.id} and to_email = ${email}
      `)
    ).rows as Array<{ body: string }>;
    const token = tokenFrom(message?.body ?? '');

    const first = await holdInFlight(sql`
      update member_invites set accepted_at = now()
      where org_id = ${agency.org.id} and email = ${email}
    `);
    const second = app.inject({
      method: 'POST',
      url: '/invites/accept',
      remoteAddress: nextIp(),
      payload: { token, name: 'Segundo Aceite', password: 'senha-do-segundo-1' },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    first.release();
    await first.done;
    const res = await second;
    expect(res.statusCode, res.body).toBe(404);

    const users = (
      await db.execute(sql`select count(*)::int as n from users where email = ${email}`)
    ).rows as Array<{ n: number }>;
    expect(users[0]?.n).toBe(0);
  });
});
