import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  clearSession,
  errorMessage,
  listVisits,
  login,
  me,
  setInspectionStatus,
} from './api';
import type { Visit } from './types';

/**
 * Testes focados do cliente HTTP: captura/reenvio de sessão (Set-Cookie →
 * Cookie + Bearer), mapeamento de erro tipado e merge das visitas abertas.
 * Nada de react-native aqui — api.ts é TS puro.
 */

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string): string | null => {
        const value = headers[name.toLowerCase()];
        return value === undefined ? null : value;
      },
    },
    json: (): Promise<unknown> => Promise.resolve(body),
  } as unknown as Response;
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  clearSession();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('captura o token do Set-Cookie no login e o reenvia como Cookie + Bearer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ user: { id: 'u1', email: 'a@b.com', name: 'A' } }, 200, {
        'set-cookie': 'aluguei_session=TOKEN123; Path=/; HttpOnly; Max-Age=86400',
      }),
    );

    await login('a@b.com', 'password');

    const loginCall = fetchMock.mock.calls[0];
    if (loginCall === undefined) {
      throw new Error('login não chamou fetch');
    }
    const [loginUrl, loginInit] = loginCall;
    expect(loginUrl).toBe('http://localhost:4000/auth/login');
    expect(loginInit?.method).toBe('POST');
    expect(loginInit?.body).toBe(JSON.stringify({ email: 'a@b.com', password: 'password' }));

    await me();

    const meCall = fetchMock.mock.calls[1];
    if (meCall === undefined) {
      throw new Error('me não chamou fetch');
    }
    const meInit = meCall[1];
    if (meInit === undefined) {
      throw new Error('me sem RequestInit');
    }
    const headers = meInit.headers as Record<string, string>;
    expect(headers['cookie']).toBe('aluguei_session=TOKEN123');
    expect(headers['authorization']).toBe('Bearer TOKEN123');
  });

  it('mapeia erro HTTP para ApiError com status, code e message da API', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'DomainError', code: 'INVALID_TRANSITION', message: 'Transição inválida' },
        409,
      ),
    );

    let caught: unknown;
    try {
      await setInspectionStatus('inspec-1', 'COMPLETED');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    if (caught instanceof ApiError) {
      expect(caught.status).toBe(409);
      expect(caught.code).toBe('INVALID_TRANSITION');
      expect(caught.message).toBe('Transição inválida');
    }
  });

  it('converte falha de rede em ApiError com mensagem legível (status 0)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
    });
  });

  it('listVisits mescla SCHEDULED + CONFIRMED e deduplica por id', async () => {
    const scheduled: Visit = {
      id: 'v-sched',
      orgId: 'org',
      leadId: null,
      partyId: null,
      propertyId: 'p1',
      scheduledAt: '2026-08-18T10:00:00.000Z',
      status: 'SCHEDULED',
      note: null,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };
    const confirmed: Visit = { ...scheduled, id: 'v-conf', status: 'CONFIRMED' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ visits: [scheduled] }, 200))
      .mockResolvedValueOnce(jsonResponse({ visits: [confirmed, scheduled] }, 200));

    const visits = await listVisits();

    expect(visits.map((visit) => visit.id)).toEqual(['v-sched', 'v-conf']);
    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls[0]).toContain('status=SCHEDULED');
    expect(urls[1]).toContain('status=CONFIRMED');
  });

  it('errorMessage devolve a mensagem de ApiError', () => {
    expect(errorMessage(new ApiError(401, 'Credenciais inválidas', 'UNAUTHORIZED'))).toBe(
      'Credenciais inválidas',
    );
  });
});
