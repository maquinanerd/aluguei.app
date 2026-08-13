import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function apiBase(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
}

/** Valida o header Origin contra APP_BASE_URL (mitigação de login-CSRF). */
export function isSameOrigin(request: NextRequest | Request): boolean {
  const origin = request.headers.get('origin');
  const allowed = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return origin !== null && origin === allowed;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Fetch server-side (Server Components) com cookie de sessão do browser. */
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  headers.set('cookie', cookieStore.toString());
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : `HTTP ${String(res.status)}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/**
 * Proxy para Route Handlers do Next: repassa o cookie do browser para a API
 * e devolve Set-Cookie da API (login/register/logout) ao cliente.
 */
export async function apiProxy(
  path: string,
  init: RequestInit,
  request: NextRequest | Request,
): Promise<NextResponse> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('cookie', request.headers.get('cookie') ?? '');
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const data: unknown = await res.json().catch(() => ({}));
  const nextRes = NextResponse.json(data, { status: res.status });
  for (const setCookie of res.headers.getSetCookie()) {
    nextRes.headers.append('set-cookie', setCookie);
  }
  return nextRes;
}
