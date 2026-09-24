import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { call, platformAdminSession } from './platform-fixtures.js';
import type { PlatformAdminSession } from './platform-fixtures.js';

/**
 * Onda 3 — vitrine pública de planos (`GET /public/plans`), que sustenta
 * `/planos` e `/para-imobiliarias` no portal.
 *
 * O que este teste protege, nessa ordem de importância:
 * 1. **Sem sessão**: é tela pública, tem de abrir para quem não tem conta.
 * 2. **Só plano ativo**: plano desligado some da vitrine no mesmo instante.
 * 3. **View reduzida**: `id` e `organizationCount` são dado de operação e não
 *    podem vazar numa rota pública.
 * 4. **Preço nulo é "Fale com a gente", não zero**, e vai para o fim da lista.
 */

interface PlanoCriado {
  id: string;
  code: string;
}

describe('Onda 3 — planos na vitrine pública', () => {
  let app: FastifyInstance;
  let admin: PlatformAdminSession;
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  const codigoBarato = `VITRINE_A_${sufixo}`;
  const codigoCaro = `VITRINE_B_${sufixo}`;
  const codigoSobConsulta = `VITRINE_C_${sufixo}`;
  const codigoDesligado = `VITRINE_OFF_${sufixo}`;

  beforeAll(async () => {
    app = await buildTestApp();
    admin = await platformAdminSession(app);

    const criar = async (
      code: string,
      monthlyPriceCents: number | null,
      extras: Record<string, unknown> = {},
    ): Promise<PlanoCriado> => {
      const res = await call(app, 'POST', '/platform/plans', {
        cookie: admin.cookie,
        payload: {
          code,
          name: `Plano ${code}`,
          description: 'Plano da vitrine',
          maxUsers: 5,
          maxProperties: 50,
          maxPublishedListings: 25,
          modules: ['CRM'],
          ...(monthlyPriceCents === null ? {} : { monthlyPriceCents }),
          ...extras,
        },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return (res.body as { plan: PlanoCriado }).plan;
    };

    await criar(codigoCaro, 49_900);
    await criar(codigoBarato, 19_900);
    await criar(codigoSobConsulta, null);
    const desligado = await criar(codigoDesligado, 9_900);
    const off = await call(app, 'PATCH', `/platform/plans/${desligado.id}`, {
      cookie: admin.cookie,
      payload: { isActive: false },
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('abre sem sessão, esconde dado de operação e ordena pelo preço publicado', async () => {
    const res = await call(app, 'GET', '/public/plans');
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const planos = (res.body as { plans: Record<string, unknown>[] }).plans;
    const nossos = planos.filter((plano) => String(plano.code).endsWith(sufixo));
    expect(nossos.map((plano) => plano.code)).toEqual([
      codigoBarato,
      codigoCaro,
      codigoSobConsulta,
    ]);

    const barato = nossos[0];
    expect(barato).toBeDefined();
    expect(barato).toMatchObject({
      code: codigoBarato,
      name: `Plano ${codigoBarato}`,
      monthlyPriceCents: 19_900,
      modules: ['CRM'],
      maxUsers: 5,
    });
    // Dado de operação não sai numa rota pública.
    expect(barato).not.toHaveProperty('id');
    expect(barato).not.toHaveProperty('organizationCount');
    expect(barato).not.toHaveProperty('isActive');
  });

  it('plano desligado some da vitrine, e preço ausente vem como nulo (não zero)', async () => {
    const res = await call(app, 'GET', '/public/plans');
    const planos = (res.body as { plans: { code: string; monthlyPriceCents: number | null }[] })
      .plans;
    expect(planos.some((plano) => plano.code === codigoDesligado)).toBe(false);

    const sobConsulta = planos.find((plano) => plano.code === codigoSobConsulta);
    expect(sobConsulta).toBeDefined();
    expect(sobConsulta?.monthlyPriceCents).toBeNull();
  });
});
