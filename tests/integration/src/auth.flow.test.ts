import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';

interface MeResponse {
  user: { email: string };
  activeOrg: { id: string } | null;
}

describe('fluxo de autenticação', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register cria org+owner, define cookie e /auth/me funciona', async () => {
    const { cookie, body } = await registerUser(app);

    expect(cookie).toContain('aluguei_session');
    expect(body.membership.role).toBe('owner');

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const meBody = me.json() as MeResponse;
    expect(meBody.user.email).toBe(body.user.email);
    expect(meBody.activeOrg?.id).toBe(body.org.id);
  });

  it('login com credenciais corretas retorna sessão', async () => {
    const { body } = await registerUser(app);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: body.user.email, password: 'senha-segura-123' },
    });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).toContain('aluguei_session');
  });

  it('login com senha errada → 401', async () => {
    const { body } = await registerUser(app);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: body.user.email, password: 'senha-errada' },
    });
    expect(login.statusCode).toBe(401);
  });

  it('login com email inexistente → 401 (sem enumeração)', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nao-existe@example.com', password: 'senha-segura-123' },
    });
    expect(login.statusCode).toBe(401);
  });

  it('logout revoga sessão e /auth/me passa a 401', async () => {
    const { cookie } = await registerUser(app);

    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('sem cookie → 401', async () => {
    const me = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(me.statusCode).toBe(401);
  });

  it('register com email duplicado → 409', async () => {
    const { body } = await registerUser(app);

    const dup = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Outro',
        email: body.user.email,
        password: 'senha-segura-123',
        organizationName: 'Outra Org',
      },
    });
    expect(dup.statusCode).toBe(409);
  });
});
