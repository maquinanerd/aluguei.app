import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => '' }),
}));

import { POST } from './route';

/**
 * Defeito 1 da Onda 0 (rodada de fidelidade): a tela "Pedir link" chamava esta rota, que não
 * existia — em produção, 404 e a mensagem genérica de erro para todo cliente.
 */

const WEB = 'http://localhost:3000';

function stubFetch(respond: () => Response): [string, RequestInit | undefined][] {
  const calls: [string, RequestInit | undefined][] = [];
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    return Promise.resolve(respond());
  });
  return calls;
}

function pedido(origin: string) {
  return new NextRequest(`${WEB}/api/portal/auth/request-link`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ contact: '(62) 98812-5678' }),
  });
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
  vi.stubEnv('APP_BASE_URL', WEB);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/portal/auth/request-link', () => {
  it('repassa o contato para a rota pública da API e devolve a resposta dela', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    const res = await POST(pedido(WEB));
    expect(res.status).toBe(200);
    expect(calls[0]?.[0]).toBe('http://api.test/portal/auth/request-link');
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(calls[0]?.[1]?.body).toBe('{"contact":"(62) 98812-5678"}');
  });

  it('devolve o 429 da API como veio (limite de pedidos)', async () => {
    stubFetch(() => Response.json({ message: 'Muitas requisições' }, { status: 429 }));
    const res = await POST(pedido(WEB));
    expect(res.status).toBe(429);
  });

  it('pedido de outra origem é recusado sem chamar a API', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    const res = await POST(pedido('https://evil.example'));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
