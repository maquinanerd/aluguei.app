import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import { call, registerAgency } from './platform-fixtures.js';

/**
 * `GET /capabilities` (Onda 4): o que esta instalação consegue fazer de verdade.
 *
 * É o que sustenta a faixa "modo de teste" no painel. O teste protege as duas
 * pontas: a rota tem de dizer a verdade sobre o provider em uso, e não pode
 * virar uma porta aberta para quem não tem sessão — a configuração da
 * instalação não é informação pública.
 */

describe('Onda 4 — capacidades da instalação', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exige sessão', async () => {
    const res = await call(app, 'GET', '/capabilities');
    expect(res.status).toBe(401);
  });

  it('devolve o provider em uso, sem credencial nem endpoint', async () => {
    const agency = await registerAgency(app);
    const res = await call(app, 'GET', '/capabilities', { cookie: agency.cookie });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const { providers } = res.body as {
      providers: {
        payments: string | null;
        signature: string | null;
        screening: string | null;
        meta: string | null;
      };
    };

    // O ambiente de teste roda com os adapters FAKE: é isso que a rota tem de
    // dizer, para o painel avisar que nada é movimentado de verdade.
    expect(providers.payments).toBe('FAKE');
    expect(providers.signature).toBe('FAKE');
    expect(providers.screening).toBe('FAKE');
    expect(providers.meta).toBe('dry_run');

    const corpo = JSON.stringify(res.body);
    for (const proibido of ['apiKey', 'token', 'secret', 'clientId', 'endpoint', 'url']) {
      expect(corpo.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });
});
