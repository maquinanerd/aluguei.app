import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => '' }),
}));

import { DELETE, GET, POST } from './route';

/**
 * P1-02 (auditoria 2026-09-10): o proxy genérico `/api/backend/*` é o caminho
 * de todas as chamadas client-side do painel. Mutação sem corpo tem que chegar
 * à API sem content-type e resposta não-JSON (export CSV) tem que voltar como
 * veio.
 */

const WEB = 'http://localhost:3000';

type FetchCall = [input: string, init: RequestInit | undefined];

function stubFetch(respond: () => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    return Promise.resolve(respond());
  });
  return calls;
}

function request(path: string, init: { method: string; body?: string; origin?: string }) {
  const headers: Record<string, string> = {
    cookie: 'aluguei_session=abc',
    origin: init.origin ?? WEB,
  };
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  return new NextRequest(`${WEB}/api/backend${path}`, {
    method: init.method,
    headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
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

describe('/api/backend/[...path]', () => {
  it('DELETE sem corpo (remover característica) chega à API sem content-type', async () => {
    const calls = stubFetch(() => Response.json({ property: { id: 'p-1' } }));
    const res = await DELETE(request('/properties/p-1/features/varanda', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(calls[0]?.[0]).toBe('http://api.test/properties/p-1/features/varanda');
    expect(calls[0]?.[1]?.method).toBe('DELETE');
    expect(new Headers(calls[0]?.[1]?.headers).has('content-type')).toBe(false);
  });

  it('POST sem corpo (gerar contrato) chega à API sem content-type', async () => {
    const calls = stubFetch(() => Response.json({ contract: { id: 'c-1' } }));
    const res = await POST(request('/contracts/c-1/generate', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(new Headers(calls[0]?.[1]?.headers).has('content-type')).toBe(false);
    expect(calls[0]?.[1]?.body ?? null).toBeNull();
  });

  it('POST com JSON repassa o corpo e o content-type', async () => {
    const calls = stubFetch(() => Response.json({ lead: { id: 'l-1' } }, { status: 201 }));
    const res = await POST(request('/leads', { method: 'POST', body: '{"source":"E2E"}' }));
    expect(res.status).toBe(201);
    expect(new Headers(calls[0]?.[1]?.headers).get('content-type')).toBe('application/json');
    expect(calls[0]?.[1]?.body).toBe('{"source":"E2E"}');
  });

  it('GET preserva a query string original', async () => {
    const calls = stubFetch(() => Response.json({ leads: [], total: 0 }));
    await GET(request('/leads?limit=50&status=NEW', { method: 'GET' }));
    expect(calls[0]?.[0]).toBe('http://api.test/leads?limit=50&status=NEW');
  });

  it('mutação de outra origem é recusada sem chamar a API', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    const res = await POST(
      request('/leads', { method: 'POST', body: '{}', origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('export CSV chega ao navegador como CSV, com nome de arquivo', async () => {
    const csv = 'id,status,channel,source,createdAt\nl-1,NEW,,E2E,2026-01-01T00:00:00.000Z';
    stubFetch(
      () =>
        new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="leads.csv"',
          },
        }),
    );
    const res = await GET(request('/reporting/export/leads?format=csv', { method: 'GET' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="leads.csv"');
    expect(await res.text()).toBe(csv);
  });

  it('limite de requisições chega ao navegador com o retry-after da API', async () => {
    stubFetch(() =>
      Response.json(
        { code: 'RATE_LIMITED', message: 'Muitas requisições' },
        { status: 429, headers: { 'retry-after': '37' } },
      ),
    );
    const res = await POST(request('/leads', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('37');
  });
});
