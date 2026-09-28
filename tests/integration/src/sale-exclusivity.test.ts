import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { approveAgency, call, registerAgency } from './platform-fixtures.js';
import type { RegisteredAgency } from './platform-fixtures.js';

/**
 * Exclusividade de venda (Onda 5).
 *
 * O que o teste protege: duas autorizações válidas ao mesmo tempo não existem
 * (isso é contradição, não renovação), renovar encostando no fim é permitido,
 * e a situação vem calculada pelo servidor — a tela não recalcula prazo.
 */

function dia(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe('Onda 5 — exclusividade de venda', () => {
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

  async function criarImovel(): Promise<string> {
    const res = await call(app, 'POST', '/properties', {
      cookie: agencia.cookie,
      payload: { title: 'Cobertura para venda', propertyType: 'APARTMENT', purpose: 'SALE' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body.property as { id: string }).id;
  }

  it('registra o período e devolve a situação calculada', async () => {
    const propertyId = await criarImovel();
    const res = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(-10), endsOn: dia(81) },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const exclusividade = (res.body as { exclusivity: Record<string, unknown> }).exclusivity;
    expect(exclusividade.state).toBe('ACTIVE');
    expect(exclusividade.totalDays).toBe(91);
    expect(exclusividade.daysLeft).toBe(81);

    const lista = await call(app, 'GET', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
    });
    expect(lista.status).toBe(200);
    const corpo = lista.body as {
      exclusivities: unknown[];
      current: { id: string } | null;
    };
    expect(corpo.exclusivities).toHaveLength(1);
    expect(corpo.current?.id).toBe(exclusividade.id);
  });

  it('avisa nos últimos 15 dias, sem a tela precisar contar', async () => {
    const propertyId = await criarImovel();
    const res = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(-80), endsOn: dia(10) },
    });
    expect((res.body as { exclusivity: { state: string } }).exclusivity.state).toBe('ENDING_SOON');
  });

  it('recusa período sobreposto, e aceita renovação que encosta no fim', async () => {
    const propertyId = await criarImovel();
    await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(0), endsOn: dia(90) },
    });

    const sobreposta = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(89), endsOn: dia(180) },
    });
    expect(sobreposta.status, JSON.stringify(sobreposta.body)).toBe(409);

    const renovacao = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(90), endsOn: dia(180) },
    });
    expect(renovacao.status, JSON.stringify(renovacao.body)).toBe(201);
  });

  it('cancelada libera o período, e fim antes do início é recusado', async () => {
    const propertyId = await criarImovel();
    const criada = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(0), endsOn: dia(90) },
    });
    const id = (criada.body as { exclusivity: { id: string } }).exclusivity.id;

    const cancelada = await call(
      app,
      'POST',
      `/properties/${propertyId}/sale-exclusivities/${id}/cancel`,
      { cookie: agencia.cookie, payload: { reason: 'Proprietário desistiu' } },
    );
    expect(cancelada.status, JSON.stringify(cancelada.body)).toBe(200);
    expect((cancelada.body as { exclusivity: { state: string } }).exclusivity.state).toBe(
      'CANCELED',
    );

    // Cancelada não bloqueia mais o período.
    const nova = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(10), endsOn: dia(100) },
    });
    expect(nova.status, JSON.stringify(nova.body)).toBe(201);

    const invertida = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: agencia.cookie,
      payload: { startsOn: dia(200), endsOn: dia(190) },
    });
    expect(invertida.status).toBe(400);
  });

  it('imóvel de outra imobiliária não aceita exclusividade', async () => {
    const propertyId = await criarImovel();
    const intrusa = await registerAgency(app);
    await approveAgency(app, intrusa.org.id, 'ESSENCIAL');
    const res = await call(app, 'POST', `/properties/${propertyId}/sale-exclusivities`, {
      cookie: intrusa.cookie,
      payload: { startsOn: dia(0), endsOn: dia(30) },
    });
    expect(res.status).toBe(404);
  });
});
