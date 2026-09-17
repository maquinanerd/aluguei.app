import { Redis } from 'ioredis';

export interface RateLimitRedisOptions {
  /** Erro de conexão (o ioredis reconecta sozinho): nunca derruba o processo. */
  onError?: (err: unknown) => void;
}

/**
 * Client ioredis para o store do `@fastify/rate-limit`, que registra comandos Lua com
 * `defineCommand` — por isso recebe o client do ioredis, e não o adapter get/set/del de
 * `createRedisClient` (auditoria 2026-09-10, P1-14: a API caía no boot com
 * `this.redis.defineCommand is not a function`).
 *
 * Nenhuma requisição espera pelo Redis: sem fila offline, uma tentativa por comando e
 * timeout curto. Com o Redis fora do ar o comando falha na hora e o plugin, com
 * `skipOnError`, deixa a requisição passar (ADR da Trilha F).
 */
export function createRateLimitRedis(url: string, opts: RateLimitRedisOptions = {}): Redis {
  const client = new Redis(url, {
    connectionName: 'aluguei-api-rate-limit',
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    commandTimeout: 500,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
  });
  client.on('error', (err: unknown) => {
    opts.onError?.(err);
  });
  return client;
}

/** Encerra o client: QUIT quando conectado; senão só desconecta (sem abrir conexão para sair). */
export async function closeRateLimitRedis(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    await client.quit();
    return;
  }
  client.disconnect();
}
