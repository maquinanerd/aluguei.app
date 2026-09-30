/**
 * Cliente HTTP único do painel (client-side). Todas as chamadas passam pelo
 * proxy /api/backend que repassa cookie e protege origem. Erros mapeados para
 * ApiClientError com status, message, code e details da API (DomainError shape).
 */

import type { PlanModule } from '@aluguei/domain';
import { moduloDe } from './plan-modules';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | null;
  /**
   * `details` do erro da API: `reason = PLAN_MODULE_NOT_INCLUDED` e `module` no 403 de módulo fora
   * do plano, `resource`, `limit` e `current` no 409 de limite. Antes era descartado, e o painel
   * mostrava "sem permissão" no lugar da tela de upgrade (defeito 13 da rodada de fidelidade).
   */
  readonly details: Readonly<Record<string, unknown>> | null;
  constructor(
    status: number,
    message: string,
    code: string | null = null,
    details: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

function detalhesDe(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null || !('details' in data)) {
    return null;
  }
  const { details } = data;
  return typeof details === 'object' && details !== null && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null;
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
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : `HTTP ${String(res.status)}`;
    const code =
      typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
        ? data.code
        : null;
    throw new ApiClientError(res.status, message, code, detalhesDe(data));
  }
  return data as T;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiClientError && (err.status === 403 || err.status === 401);
}

/**
 * O módulo que o plano não inclui, quando o erro é o 403 `PLAN_MODULE_NOT_INCLUDED` (ADR-095);
 * nulo para qualquer outro erro, inclusive o 403 de permissão da função.
 */
export function moduloForaDoPlano(err: unknown): PlanModule | null {
  if (
    !(err instanceof ApiClientError) ||
    err.status !== 403 ||
    err.details?.reason !== 'PLAN_MODULE_NOT_INCLUDED'
  ) {
    return null;
  }
  const modulo = err.details.module;
  return moduloDe(typeof modulo === 'string' ? modulo : undefined);
}
