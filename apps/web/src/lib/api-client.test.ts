import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiClient, moduloForaDoPlano } from './api-client';

/**
 * Defeito 13 da rodada de fidelidade: o cliente guardava `code` e descartava `details`, e com ele
 * o `reason = PLAN_MODULE_NOT_INCLUDED` do 403 de módulo fora do plano (ADR-095). O painel não
 * tinha como abrir a tela de upgrade e mostrava "sem permissão".
 */

function responder(status: number, corpo: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(corpo), { status }))),
  );
}

async function erroDe(path: string): Promise<unknown> {
  try {
    await apiClient(path);
  } catch (err) {
    return err;
  }
  throw new Error('esperava erro');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  it('guarda o details do erro da API', async () => {
    responder(409, {
      code: 'PLAN_LIMIT_REACHED',
      message: 'Limite do plano',
      details: { resource: 'activeLeases', limit: 10, current: 10 },
    });
    const err = await erroDe('/leases');
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).details).toEqual({
      resource: 'activeLeases',
      limit: 10,
      current: 10,
    });
  });

  it('403 de módulo fora do plano diz qual módulo falta', async () => {
    responder(403, {
      code: 'FORBIDDEN',
      message: 'Módulo fora do seu plano: Locação',
      details: { reason: 'PLAN_MODULE_NOT_INCLUDED', module: 'LOCACAO' },
    });
    expect(moduloForaDoPlano(await erroDe('/leases'))).toBe('LOCACAO');
  });

  it('403 de permissão da função não é upgrade', async () => {
    responder(403, { code: 'FORBIDDEN', message: 'Sem permissão' });
    expect(moduloForaDoPlano(await erroDe('/charges'))).toBeNull();
  });

  it('módulo desconhecido não vira módulo', async () => {
    responder(403, {
      code: 'FORBIDDEN',
      message: 'x',
      details: { reason: 'PLAN_MODULE_NOT_INCLUDED', module: 'INVENTADO' },
    });
    expect(moduloForaDoPlano(await erroDe('/x'))).toBeNull();
  });
});
