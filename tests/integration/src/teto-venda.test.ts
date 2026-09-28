import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Teto de venda (ADR-094 revisado na Onda 5). O teto de aluguel recusava
 * R$ 1,4 milhão — preço comum de apartamento —, o que tornaria a frente de
 * venda inutilizável. A rota é o lugar de provar isso, porque é onde o valor
 * entra de verdade.
 */
describe('Onda 5 — teto do preço de venda', () => {
  let app: FastifyInstance;
  let agencia: RegisteredAgency;

  beforeAll(async () => {
    app = await buildTestApp();
    agencia = await registerAgency(app);
    await approveAgency(app, agencia.org.id, 'ILIMITADO');
  });

  afterAll(async () => {
    await app.close();
  });

  async function definirPreco(salePriceCents: number): Promise<number> {
    const criado = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Imóvel caro', propertyType: 'HOUSE', purpose: 'SALE' },
    });
    const propertyId = (criado.body.property as { id: string }).id;
    const res = await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie: agencia.cookie,
      payload: { salePriceCents },
    });
    return res.status;
  }

  it('aceita R$ 1.390.000, que o teto de aluguel recusava', async () => {
    expect(await definirPreco(139_000_000)).toBe(200);
  });

  it('recusa acima de R$ 20.000.000 com 400, não com 500', async () => {
    expect(await definirPreco(2_000_000_001)).toBe(400);
  });
});
