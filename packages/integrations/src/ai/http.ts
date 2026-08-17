import { AiProviderError } from './errors.js';
import type { AiProviderErrorKind, AiProviderKind } from './errors.js';

/**
 * Fetch com timeout via AbortSignal. Converte abort/timeout e falhas de rede
 * em `AiProviderError` tipado (TIMEOUT/NETWORK) — nunca vaza a chave de API.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: AiProviderKind,
  method: string,
  path: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AiProviderError(`Timeout após ${String(timeoutMs)}ms em ${method} ${path}`, {
        kind: 'TIMEOUT',
        provider,
        retryable: true,
      });
    }
    throw new AiProviderError(
      `Falha de rede em ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
      { kind: 'NETWORK', provider, retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converte resposta HTTP não-2xx em `AiProviderError` tipado, sem incluir o
 * corpo da resposta na mensagem (o corpo pode ecoar dados sensíveis).
 */
export function throwForHttpStatus(
  response: Response,
  provider: AiProviderKind,
  method: string,
  path: string,
): never {
  const status = response.status;
  let kind: AiProviderErrorKind;
  if (status === 401 || status === 403) {
    kind = 'AUTH';
  } else if (status === 429) {
    kind = 'RATE_LIMIT';
  } else {
    kind = 'HTTP';
  }
  const retryable = status === 429 || status >= 500;
  throw new AiProviderError(`Provider ${provider} HTTP ${String(status)} em ${method} ${path}`, {
    kind,
    provider,
    statusCode: status,
    retryable,
  });
}

/** Lê o corpo JSON; corpo não-JSON vira `AiProviderError` INVALID_JSON. */
export async function readJsonBody(
  response: Response,
  provider: AiProviderKind,
  method: string,
  path: string,
): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    throw new AiProviderError(`Resposta ${provider} com JSON inválido em ${method} ${path}`, {
      kind: 'INVALID_JSON',
      provider,
      statusCode: response.status,
      retryable: true,
    });
  }
}
