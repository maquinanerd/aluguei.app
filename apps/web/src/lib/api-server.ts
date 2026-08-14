import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function apiBase(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
}

/**
 * Valida o header Origin contra APP_BASE_URL (mitigação de login-CSRF).
 * Em produção, APP_BASE_URL é obrigatória (fail-fast evita origin errada).
 */
export function isSameOrigin(request: NextRequest | Request): boolean {
  const origin = request.headers.get('origin');
  const allowed = normalizeBaseUrl(process.env.APP_BASE_URL ?? 'http://localhost:3000');
  return origin !== null && normalizeBaseUrl(origin) === allowed;
}

/** Normaliza base URL para comparação (host lowercase, sem trailing slash). */
export function normalizeBaseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/+$/, '');
    return u.origin + u.pathname;
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

/** Garante que API_BASE_URL use HTTPS fora de desenvolvimento. */
export function assertSecureApiBase(): void {
  const base = process.env.API_BASE_URL;
  if (base && process.env.NODE_ENV === 'production' && !base.startsWith('https://')) {
    throw new Error('API_BASE_URL deve usar HTTPS em produção');
  }
}

/** Guard usado em rotas públicas autenticadas (server components). */
export function secureFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  assertSecureApiBase();
  return apiFetch<T>(path, init);
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
  // NÃO repassa X-Forwarded-For do cliente: o Next é o peer imediato confiável
  // (trustProxy: 'loopback' na API) e repassar o header verbatim permitiria
  // falsificar o IP usado no rate limit (brute-force de login). O rate limit da
  // API passa a ver o IP do proxy (Next) — correto e determinístico. Em topologias
  // com LB/CDN, o LB deve setar XFF para a API (ajustar trustProxy conforme ADR).
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
