/**
 * Cliente HTTP único do painel (client-side). Todas as chamadas passam pelo
 * proxy /api/backend que repassa cookie e protege origem. Erros mapeados para
 * ApiClientError com status e message da API (DomainError shape).
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiClient<T = unknown>(
  path: string,
  { method = 'GET', body, signal }: ApiClientOptions = {},
): Promise<T> {
  const init: RequestInit = { method, cache: 'no-store' };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  if (signal !== undefined) {
    init.signal = signal;
  }
  const res = await fetch(`/api/backend${path}`, init);
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `HTTP ${String(res.status)}`;
    const code =
      typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
        ? data.code
        : null;
    throw new ApiClientError(res.status, message, code);
  }
  return data as T;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiClientError && (err.status === 403 || err.status === 401);
}
