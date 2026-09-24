import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { call, platformAdminSession, registerAgency } from './platform-fixtures.js';
import type { PlatformAdminSession } from './platform-fixtures.js';

/**
 * O plano pedido no cadastro (Onda 3) é intenção, não contratação: o cadastro
 * continua nascendo em análise e no plano padrão. O que muda é que a fila de
 * aprovação passa a saber o que a imobiliária pediu.
 */
describe('Onda 3 — plano pedido no cadastro', () => {
  let app: FastifyInstance;
  let admin: PlatformAdminSession;

  beforeAll(async () => {
    app = await buildTestApp();
    admin = await platformAdminSession(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('guarda o código pedido e mostra na fila, sem mudar o plano vigente', async () => {
    const agency = await registerAgency(app, { requestedPlanCode: 'ILIMITADO' });
    expect(agency.org.status).toBe('PENDING_APPROVAL');

    const fila = await call(app, 'GET', '/platform/organizations?status=PENDING_APPROVAL', {
      cookie: admin.cookie,
    });
    expect(fila.status, JSON.stringify(fila.body)).toBe(200);
    const organizacoes = (
      fila.body as {
        organizations: { id: string; requestedPlanCode: string | null; plan: { code: string } }[];
      }
    ).organizations;
    const nossa = organizacoes.find((org) => org.id === agency.org.id);
    expect(nossa).toBeDefined();
    expect(nossa?.requestedPlanCode).toBe('ILIMITADO');
    // Pedir não é contratar: o plano vigente continua sendo o padrão.
    expect(nossa?.plan.code).toBe('ESSENCIAL');
  });

  it('cadastro sem plano pedido continua válido, com o campo nulo', async () => {
    const agency = await registerAgency(app);
    const fila = await call(app, 'GET', '/platform/organizations?status=PENDING_APPROVAL', {
      cookie: admin.cookie,
    });
    const organizacoes = (
      fila.body as { organizations: { id: string; requestedPlanCode: string | null }[] }
    ).organizations;
    expect(organizacoes.find((org) => org.id === agency.org.id)?.requestedPlanCode).toBeNull();
  });

  it('código fora do formato é recusado antes de gravar', async () => {
    const res = await call(app, 'POST', '/auth/register', {
      remoteAddress: '10.99.0.7',
      payload: {
        name: 'Quem Tentou',
        email: `plano-invalido-${Math.random().toString(36).slice(2, 8)}@example.com`,
        password: 'senha-segura-123',
        organizationName: 'Imobiliária do Plano Torto',
        requestedPlanCode: 'plano; drop table',
      },
    });
    expect(res.status).toBe(400);
  });
});
