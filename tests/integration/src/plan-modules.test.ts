import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FakeScreeningProvider } from '@aluguei/integrations';
import { runInboxJobs } from '@aluguei/worker';
import { createFinanceFixtures } from './finance-fixtures.js';
import { buildTestApp, fakePayments, fakeSignature } from './helpers.js';
import { approveAgency, call, platformAdminSession, registerAgency } from './platform-fixtures.js';
import type { Json, PlatformAdminSession } from './platform-fixtures.js';

/**
 * Onda 1A do frontend do AchouImóvel: o plano da imobiliária passa a dizer quais
 * módulos ela tem e quantas locações em vigor pode manter.
 *
 * 1. `/auth/me` devolve o plano (módulos e limites) — é o que põe o cadeado no menu.
 * 2. Rota de módulo fora do plano responde 403 com `details.reason =
 *    PLAN_MODULE_NOT_INCLUDED` e `details.module`; rota livre continua abrindo.
 * 3. O limite de locações em vigor recusa a ativação com 409 antes de escrever.
 */

interface PlanBody {
  id: string;
  code: string;
  modules: string[];
  monthlyPriceCents: number | null;
  maxActiveLeases: number | null;
}

describe('Onda 1A — módulos e limites do plano', () => {
  let app: FastifyInstance;
  let admin: PlatformAdminSession;
  let fx: ReturnType<typeof createFinanceFixtures>;
  const screening = new FakeScreeningProvider();

  const worker = () =>
    runInboxJobs({
      db: app.db,
      limit: 20,
      screening,
      signature: fakeSignature,
      payments: fakePayments,
    });

  async function planByCode(code: string): Promise<PlanBody> {
    const res = await call(app, 'GET', '/platform/plans', { cookie: admin.cookie });
    const plan = (res.body.plans as PlanBody[] | undefined)?.find((p) => p.code === code);
    if (!plan) {
      throw new Error(`plano ${code} não encontrado: ${JSON.stringify(res.body)}`);
    }
    return plan;
  }

  async function assignPlan(orgId: string, planId: string): Promise<void> {
    const res = await call(app, 'PUT', `/platform/organizations/${orgId}/plan`, {
      cookie: admin.cookie,
      payload: { planId },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  beforeAll(async () => {
    app = await buildTestApp();
    admin = await platformAdminSession(app);
    fx = createFinanceFixtures(app, worker);
  });

  afterAll(async () => {
    await app.close();
  });

  it('os planos semeados nascem com os módulos que o sistema já tem', async () => {
    const essencial = await planByCode('ESSENCIAL');
    const ilimitado = await planByCode('ILIMITADO');

    // Compatibilidade: ninguém perde o que já usava na migration 0024.
    expect([...essencial.modules].sort()).toEqual([
      'ATENDIMENTO',
      'CRM',
      'FINANCEIRO',
      'LOCACAO',
      'MARKETING',
    ]);
    // VENDAS ainda não existe no produto: só o ILIMITADO o tem.
    expect(essencial.modules).not.toContain('VENDAS');
    expect(ilimitado.modules).toContain('VENDAS');
    // Preço é pendência do dono: nulo vira "Fale com a gente" na página de planos.
    expect(essencial.monthlyPriceCents).toBeNull();
    expect(essencial.maxActiveLeases).toBeNull();
  });

  it('/auth/me devolve o plano da imobiliária ativa com módulos e limites', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id, 'ESSENCIAL');

    const me = await call(app, 'GET', '/auth/me', { cookie: agency.cookie });
    expect(me.status).toBe(200);
    const plan = me.body.plan as {
      code: string;
      modules: string[];
      monthlyPriceCents: number | null;
      limits: { maxActiveLeases: number | null; maxUsers: number | null };
    } | null;
    expect(plan?.code).toBe('ESSENCIAL');
    expect(plan?.modules).toContain('LOCACAO');
    expect(plan?.modules).not.toContain('VENDAS');
    expect(plan?.monthlyPriceCents).toBeNull();
    expect(plan?.limits.maxActiveLeases).toBeNull();
    expect(plan?.limits.maxUsers).toBe(3);
  });

  it('módulo fora do plano responde 403 com o motivo; rota livre continua abrindo', async () => {
    const agency = await registerAgency(app);
    await approveAgency(app, agency.org.id, 'ESSENCIAL');

    // Plano só com o básico (o Anunciante da entrega de design): nenhum módulo.
    const created = await call(app, 'POST', '/platform/plans', {
      cookie: admin.cookie,
      payload: {
        code: `SO_ANUNCIO_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        name: 'Só anúncio',
        maxUsers: 2,
        maxProperties: 20,
        maxPublishedListings: 10,
        modules: [],
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const soAnuncio = (created.body as { plan: PlanBody }).plan;
    expect(soAnuncio.modules).toEqual([]);
    await assignPlan(agency.org.id, soAnuncio.id);

    const leases = await call(app, 'GET', '/leases', { cookie: agency.cookie });
    expect(leases.status).toBe(403);
    expect(leases.body.code).toBe('FORBIDDEN');
    expect(leases.body.details).toEqual({
      reason: 'PLAN_MODULE_NOT_INCLUDED',
      module: 'LOCACAO',
    });

    const inbox = await call(app, 'GET', '/conversations', { cookie: agency.cookie });
    expect(inbox.status).toBe(403);
    expect((inbox.body.details as Json | undefined)?.module).toBe('ATENDIMENTO');

    // Base de todo plano: imóveis e leads seguem abertos (é o que o Anunciante compra).
    expect((await call(app, 'GET', '/properties', { cookie: agency.cookie })).status).toBe(200);
    expect((await call(app, 'GET', '/leads', { cookie: agency.cookie })).status).toBe(200);

    // Voltando para um plano com o módulo, a mesma rota abre.
    await assignPlan(agency.org.id, (await planByCode('ESSENCIAL')).id);
    expect((await call(app, 'GET', '/leases', { cookie: agency.cookie })).status).toBe(200);
  });

  it('limite de locações em vigor do plano recusa a ativação com 409', async () => {
    const essencial = await planByCode('ESSENCIAL');
    const patched = await call(app, 'PATCH', `/platform/plans/${essencial.id}`, {
      cookie: admin.cookie,
      payload: { maxActiveLeases: 0 },
    });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);

    try {
      let leaseResponse: { status: number; body: Json } | null = null;
      await fx.setupLease({
        rentCents: 250_000,
        landlord: true,
        onLease: (res) => {
          leaseResponse = res;
        },
      });
      const result = leaseResponse as { status: number; body: Json } | null;
      expect(result?.status).toBe(409);
      expect(result?.body.code).toBe('PLAN_LIMIT_REACHED');
      expect((result?.body.details as Json | undefined)?.resource).toBe('activeLeases');
    } finally {
      await call(app, 'PATCH', `/platform/plans/${essencial.id}`, {
        cookie: admin.cookie,
        payload: { maxActiveLeases: null },
      });
    }
  });
});
