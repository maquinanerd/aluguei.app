import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => '' }),
}));

import { POST } from './route';

/**
 * Defeito 2 da Onda 0 (rodada de fidelidade): "Pagar com Pix" chamava esta rota, que não
 * existia — em produção, 404 e "Não foi possível gerar o Pix agora" para todo inquilino.
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

function pedido(id: string, origin: string) {
  return new NextRequest(`${WEB}/api/portal/tenant/charges/${id}/payment`, {
    method: 'POST',
    headers: { origin, cookie: 'aluguei_portal=tok', 'content-type': 'application/json' },
    body: '{}',
  });
}

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
  vi.stubEnv('APP_BASE_URL', WEB);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/portal/tenant/charges/[id]/payment', () => {
  it('chama a API na cobrança pedida, com o cookie da sessão do portal', async () => {
    const calls = stubFetch(() => Response.json({ pixQrCode: '000201…' }, { status: 201 }));
    const res = await POST(pedido('c-1', WEB), contexto('c-1'));
    expect(res.status).toBe(201);
    expect(calls[0]?.[0]).toBe('http://api.test/portal/tenant/charges/c-1/payment');
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(new Headers(calls[0]?.[1]?.headers).get('cookie')).toBe('aluguei_portal=tok');
  });

  it('não deixa o id mudar o caminho da API', async () => {
    const calls = stubFetch(() => Response.json({}, { status: 404 }));
    await POST(pedido('x', WEB), contexto('../../leads'));
    expect(calls[0]?.[0]).toBe('http://api.test/portal/tenant/charges/..%2F..%2Fleads/payment');
  });

  it('pedido de outra origem é recusado sem chamar a API', async () => {
    const calls = stubFetch(() => Response.json({}));
    const res = await POST(pedido('c-1', 'https://evil.example'), contexto('c-1'));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
