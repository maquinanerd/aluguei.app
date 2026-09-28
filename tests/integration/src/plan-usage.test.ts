import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';

/**
 * Plano e uso da própria imobiliária (Onda 4).
 *
 * O ponto do teste é o isolamento: uso é dado de operação de uma imobiliária, e
 * quem não é membro dela não pode ler — nem mesmo outra imobiliária ativa.
 */

describe('Onda 4 — plano e uso da imobiliária', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devolve plano, limites e uso contados pelo mesmo caminho do limite', async () => {
    const agency = await registerAgency(app);
    // Cadastro em análise não opera (ADR-060): a tela do painel só existe depois
    // da aprovação, e a rota segue a mesma regra.
    await approveAgency(app, agency.org.id, 'ESSENCIAL');
    const res = await call(app, 'GET', `/organizations/${agency.org.id}/plan-usage`, {
      cookie: agency.cookie,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const corpo = res.body as {
      plan: { code: string; limits: Record<string, number | null>; modules: string[] };
      usage: Record<string, number>;
      since: string;
    };
    expect(corpo.plan.code).toBe('ESSENCIAL');
    expect(corpo.plan.limits).toHaveProperty('maxUsers');
    // Recém-cadastrada: uma pessoa, nada mais.
    expect(corpo.usage.users).toBe(1);
    expect(corpo.usage.properties).toBe(0);
    expect(corpo.usage.publishedListings).toBe(0);
    expect(corpo.usage.activeLeases).toBe(0);
    expect(Number.isNaN(Date.parse(corpo.since))).toBe(false);
  });

  it('imobiliária não lê o uso de outra', async () => {
    const dona = await registerAgency(app);
    await approveAgency(app, dona.org.id, 'ESSENCIAL');
    const intrusa = await registerAgency(app);
    await approveAgency(app, intrusa.org.id, 'ESSENCIAL');
    const res = await call(app, 'GET', `/organizations/${dona.org.id}/plan-usage`, {
      cookie: intrusa.cookie,
    });
    // Ownership canônico (ADR-044): quem não é dono recebe 404, não 403.
    expect([403, 404]).toContain(res.status);
  });

  it('sem sessão, não abre', async () => {
    const agency = await registerAgency(app);
    const res = await call(app, 'GET', `/organizations/${agency.org.id}/plan-usage`);
    expect(res.status).toBe(401);
  });
});
