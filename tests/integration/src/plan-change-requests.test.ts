import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, platformAdminSession, registerAgency } from './platform-fixtures.js';

/**
 * Pedido de troca de plano (rodada de fidelidade, ADR-105, B15). A imobiliária pede na tela de
 * upgrade o módulo que falta; o pedido entra na fila da plataforma; a equipe troca o plano pela
 * rota de sempre, e a troca atende o pedido e muda a data de entrada no plano ("Desde ...").
 * Nada disso troca plano sozinho.
 */

interface Pedido {
  id: string;
  requestedModule: string | null;
  requestedPlanCode: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface PedidoNaFila extends Pedido {
  organization: { id: string; name: string; planCode: string; planName: string };
  requestedBy: { id: string; name: string; email: string } | null;
}

// Um app por arquivo (buildTestApp guarda a instância): fechado só no fim do arquivo.
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

async function planIdByCode(code: string): Promise<string> {
  const admin = await platformAdminSession(app);
  const res = await call(app, 'GET', '/platform/plans', { cookie: admin.cookie });
  const plan = (res.body.plans as Array<{ id: string; code: string }>).find((p) => p.code === code);
  if (!plan) {
    throw new Error(`plano ${code} ausente`);
  }
  return plan.id;
}

async function imobiliariaAtiva() {
  const agency = await registerAgency(app);
  // O ESSENCIAL não inclui VENDAS (migration 0024): é o cadeado que a pessoa clica.
  await approveAgency(app, agency.org.id, 'ESSENCIAL');
  return agency;
}

describe('pedido de troca de plano', () => {
  it('a imobiliária pede o módulo que falta; pedir de novo devolve o mesmo pedido', async () => {
    const agency = await imobiliariaAtiva();
    const url = `/organizations/${agency.org.id}/plan-change-requests`;

    const primeiro = await call(app, 'POST', url, {
      cookie: agency.cookie,
      payload: { module: 'VENDAS' },
    });
    expect(primeiro.status, JSON.stringify(primeiro.body)).toBe(201);
    expect(primeiro.body).toMatchObject({
      created: true,
      request: { requestedModule: 'VENDAS', status: 'PENDING', resolvedAt: null },
    });
    const pedido = primeiro.body.request as Pedido;

    const segundo = await call(app, 'POST', url, {
      cookie: agency.cookie,
      payload: { module: 'LOCACAO' },
    });
    expect(segundo.status, JSON.stringify(segundo.body)).toBe(200);
    expect(segundo.body).toMatchObject({ created: false, request: { id: pedido.id } });

    const lista = await call(app, 'GET', url, { cookie: agency.cookie });
    expect(lista.status).toBe(200);
    expect(lista.body.requests as Pedido[]).toHaveLength(1);
  });

  it('sem módulo nem plano o pedido é recusado', async () => {
    const agency = await imobiliariaAtiva();
    const res = await call(app, 'POST', `/organizations/${agency.org.id}/plan-change-requests`, {
      cookie: agency.cookie,
      payload: {},
    });
    expect(res.status).toBe(400);
  });

  it('outra imobiliária não pede nem lê pelo id da primeira', async () => {
    const dona = await imobiliariaAtiva();
    const outra = await imobiliariaAtiva();
    const url = `/organizations/${dona.org.id}/plan-change-requests`;
    const pedir = await call(app, 'POST', url, {
      cookie: outra.cookie,
      payload: { module: 'VENDAS' },
    });
    expect(pedir.status).toBe(404);
    const ler = await call(app, 'GET', url, { cookie: outra.cookie });
    expect(ler.status).toBe(404);
  });

  it('a troca de plano pela plataforma atende o pedido e muda a data de entrada no plano', async () => {
    const agency = await imobiliariaAtiva();
    const usoAntes = await call(app, 'GET', `/organizations/${agency.org.id}/plan-usage`, {
      cookie: agency.cookie,
    });
    expect(usoAntes.status).toBe(200);
    const desdeAntes = Date.parse(usoAntes.body.since as string);

    const criado = await call(app, 'POST', `/organizations/${agency.org.id}/plan-change-requests`, {
      cookie: agency.cookie,
      payload: { module: 'VENDAS' },
    });
    const pedido = criado.body.request as Pedido;

    const admin = await platformAdminSession(app);
    const fila = await call(app, 'GET', '/platform/plan-change-requests', {
      cookie: admin.cookie,
    });
    expect(fila.status, JSON.stringify(fila.body)).toBe(200);
    const naFila = (fila.body.requests as PedidoNaFila[]).find((item) => item.id === pedido.id);
    expect(naFila).toMatchObject({
      status: 'PENDING',
      requestedModule: 'VENDAS',
      organization: { id: agency.org.id, planCode: 'ESSENCIAL' },
      requestedBy: { id: agency.user.id, email: agency.user.email },
    });

    await new Promise((resolve) => setTimeout(resolve, 15));
    const troca = await call(app, 'PUT', `/platform/organizations/${agency.org.id}/plan`, {
      cookie: admin.cookie,
      payload: { planId: await planIdByCode('ILIMITADO') },
    });
    expect(troca.status, JSON.stringify(troca.body)).toBe(200);

    const lista = await call(app, 'GET', `/organizations/${agency.org.id}/plan-change-requests`, {
      cookie: agency.cookie,
    });
    const atendido = (lista.body.requests as Pedido[]).find((item) => item.id === pedido.id);
    expect(atendido?.status).toBe('DONE');
    expect(atendido?.resolvedAt).not.toBeNull();

    const usoDepois = await call(app, 'GET', `/organizations/${agency.org.id}/plan-usage`, {
      cookie: agency.cookie,
    });
    expect(Date.parse(usoDepois.body.since as string)).toBeGreaterThan(desdeAntes);

    const pendentes = await call(app, 'GET', '/platform/plan-change-requests', {
      cookie: admin.cookie,
    });
    expect((pendentes.body.requests as PedidoNaFila[]).some((item) => item.id === pedido.id)).toBe(
      false,
    );
  });

  it('a plataforma descarta o pedido; resolver de novo é conflito', async () => {
    const agency = await imobiliariaAtiva();
    const criado = await call(app, 'POST', `/organizations/${agency.org.id}/plan-change-requests`, {
      cookie: agency.cookie,
      payload: { planCode: 'PROFISSIONAL' },
    });
    const pedido = criado.body.request as Pedido;
    expect(pedido.requestedPlanCode).toBe('PROFISSIONAL');

    const admin = await platformAdminSession(app);
    const url = `/platform/plan-change-requests/${pedido.id}/resolve`;
    const descartado = await call(app, 'POST', url, {
      cookie: admin.cookie,
      payload: { outcome: 'DISMISSED' },
    });
    expect(descartado.status, JSON.stringify(descartado.body)).toBe(200);
    expect(descartado.body).toMatchObject({ request: { id: pedido.id, status: 'DISMISSED' } });

    const deNovo = await call(app, 'POST', url, {
      cookie: admin.cookie,
      payload: { outcome: 'DONE' },
    });
    expect(deNovo.status).toBe(409);

    // Descartado, a imobiliária pode pedir outra vez.
    const outraVez = await call(
      app,
      'POST',
      `/organizations/${agency.org.id}/plan-change-requests`,
      {
        cookie: agency.cookie,
        payload: { module: 'VENDAS' },
      },
    );
    expect(outraVez.status).toBe(201);
  });

  it('a fila é só do admin da plataforma', async () => {
    const agency = await imobiliariaAtiva();
    const res = await call(app, 'GET', '/platform/plan-change-requests', { cookie: agency.cookie });
    expect(res.status).toBe(403);
  });
});
