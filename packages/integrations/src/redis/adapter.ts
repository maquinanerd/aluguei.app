import Redis from 'ioredis';

export interface RedisAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface CreateRedisClientOptions {
  url: string;
  onError?: (err: unknown) => void;
}

/**
 * Factory do adapter Redis. Sem URL não cria conexão — lança erro explícito.
 * Sempre registra um handler de `error` para evitar crash por evento não tratado.
 */
export function createRedisClient(
  url?: string,
  opts?: { onError?: (err: unknown) => void },
): RedisAdapter {
  if (!url) {
    throw new Error('REDIS_URL is required to create a Redis client');
  }
  const client = new Redis(url, { lazyConnect: true });
  client.on('error', (err: unknown) => {
    if (opts?.onError) {
      opts.onError(err);
    }
  });

  return {
    get: async (key: string): Promise<string | null> => client.get(key),
    set: async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
      if (ttlSeconds === undefined) {
        await client.set(key, value);
      } else {
        await client.set(key, value, 'EX', ttlSeconds);
      }
    },
    del: async (key: string): Promise<void> => {
      await client.del(key);
    },
  };
}
