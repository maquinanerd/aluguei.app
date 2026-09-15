import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => 'aluguei_session=abc' }),
}));

import { apiFetch, apiProxy } from './api-server';

/**
 * P1-02 (auditoria 2026-09-10): o BFF definia `content-type: application/json`
 * em toda chamada — mutação sem corpo (logout, gerar/enviar contrato, cancelar
 * cobrança, remover característica...) virava 400 `FST_ERR_CTP_EMPTY_JSON_BODY`
 * — e forçava a resposta a JSON: o export CSV chegava como `{}` e os headers
 * (content-type, content-disposition) se perdiam.
 */

type FetchCall = [input: string, init: RequestInit | undefined];

function stubFetch(respond: () => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    return Promise.resolve(respond());
  });
  return calls;
}

function sentHeaders(calls: FetchCall[]): Headers {
  return new Headers(calls[0]?.[1]?.headers);
}

function browserRequest(method: string): Request {
  return new Request('http://localhost:3000/api/qualquer', {
    method,
    headers: { cookie: 'aluguei_session=abc', origin: 'http://localhost:3000' },
  });
}

const CSV = 'id,status,channel,source,createdAt\nl-1,NEW,,E2E,2026-01-01T00:00:00.000Z';

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('apiProxy (route handlers do BFF)', () => {
  it('mutação sem corpo chega à API sem content-type', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    const res = await apiProxy('/auth/logout', { method: 'POST' }, browserRequest('POST'));
    expect(res.status).toBe(200);
    expect(calls[0]?.[0]).toBe('http://api.test/auth/logout');
    expect(sentHeaders(calls).has('content-type')).toBe(false);
    expect(calls[0]?.[1]?.body ?? null).toBeNull();
  });

  it('mutação com corpo JSON envia content-type application/json e o corpo', async () => {
    const calls = stubFetch(() => Response.json({ lead: { id: 'l-1' } }, { status: 201 }));
    const res = await apiProxy(
      '/leads',
      { method: 'POST', body: JSON.stringify({ source: 'E2E' }) },
      browserRequest('POST'),
    );
    expect(res.status).toBe(201);
    expect(sentHeaders(calls).get('content-type')).toBe('application/json');
    expect(calls[0]?.[1]?.body).toBe('{"source":"E2E"}');
    expect(await res.json()).toEqual({ lead: { id: 'l-1' } });
  });

  it('repassa o cookie do navegador para a API', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    await apiProxy('/auth/me', { method: 'GET' }, browserRequest('GET'));
    expect(sentHeaders(calls).get('cookie')).toBe('aluguei_session=abc');
  });

  it('resposta CSV chega intacta, com content-type e content-disposition', async () => {
    stubFetch(
      () =>
        new Response(CSV, {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="leads.csv"',
          },
        }),
    );
    const res = await apiProxy(
      '/reporting/export/leads?format=csv',
      { method: 'GET' },
      browserRequest('GET'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="leads.csv"');
    expect(await res.text()).toBe(CSV);
  });

  it('erro JSON da API mantém status e corpo', async () => {
    const body = { error: 'Bad Request', code: 'INVALID_INPUT', message: 'limit acima de 100' };
    stubFetch(() => Response.json(body, { status: 400 }));
    const res = await apiProxy('/leads?limit=101', { method: 'GET' }, browserRequest('GET'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(body);
  });

  it('204 sem corpo é repassado sem quebrar o proxy', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    const res = await apiProxy('/recurso', { method: 'DELETE' }, browserRequest('DELETE'));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('devolve todos os Set-Cookie da API ao navegador', async () => {
    stubFetch(() => {
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('set-cookie', 'aluguei_session=; Path=/; Max-Age=0');
      headers.append('set-cookie', 'outro=1; Path=/');
      return new Response('{"ok":true}', { status: 200, headers });
    });
    const res = await apiProxy('/auth/logout', { method: 'POST' }, browserRequest('POST'));
    expect(res.headers.getSetCookie()).toEqual([
      'aluguei_session=; Path=/; Max-Age=0',
      'outro=1; Path=/',
    ]);
  });
});

describe('apiFetch (Server Components)', () => {
  it('GET sem corpo não envia content-type e leva o cookie da sessão', async () => {
    const calls = stubFetch(() => Response.json({ user: { id: 'u-1' } }));
    await expect(apiFetch('/auth/me')).resolves.toEqual({ user: { id: 'u-1' } });
    expect(sentHeaders(calls).has('content-type')).toBe(false);
    expect(sentHeaders(calls).get('cookie')).toBe('aluguei_session=abc');
  });

  it('POST com corpo envia content-type application/json', async () => {
    const calls = stubFetch(() => Response.json({ ok: true }));
    await apiFetch('/recurso', { method: 'POST', body: '{}' });
    expect(sentHeaders(calls).get('content-type')).toBe('application/json');
  });

  it('erro da API vira ApiError com status e mensagem', async () => {
    stubFetch(() => Response.json({ message: 'Autenticação necessária' }, { status: 401 }));
    await expect(apiFetch('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Autenticação necessária',
    });
  });
});
