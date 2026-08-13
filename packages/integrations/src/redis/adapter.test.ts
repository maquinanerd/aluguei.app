import { describe, expect, it, vi } from 'vitest';

vi.mock('ioredis', () => {
  class FakeRedis {
    private readonly store = new Map<string, { value: string; ttl?: number }>();

    on(_event: string, _callback: (err: unknown) => void): void {
      // noop: registra listener sem conexão real
    }

    get(key: string): Promise<string | null> {
      return Promise.resolve(this.store.get(key)?.value ?? null);
    }

    set(key: string, value: string, _mode?: string, ttl?: number): Promise<string> {
      const entry: { value: string; ttl?: number } = { value };
      if (ttl !== undefined) {
        entry.ttl = ttl;
      }
      this.store.set(key, entry);
      return Promise.resolve('OK');
    }

    del(key: string): Promise<number> {
      return Promise.resolve(this.store.delete(key) ? 1 : 0);
    }
  }

  return { default: FakeRedis };
});

import { createRedisClient } from './adapter.js';

describe('createRedisClient', () => {
  it('lança sem URL (nunca conecta)', () => {
    expect(() => createRedisClient(undefined)).toThrow(/REDIS_URL/);
  });

  it('cria adapter com URL e expõe operações', async () => {
    const adapter = createRedisClient('redis://localhost:6379');
    await adapter.set('k', 'v');
    await expect(adapter.get('k')).resolves.toBe('v');
    await expect(adapter.del('k')).resolves.toBeUndefined();
    await expect(adapter.get('k')).resolves.toBeNull();
  });

  it('set com TTL chama com modo EX', async () => {
    const adapter = createRedisClient('redis://localhost:6379');
    await expect(adapter.set('k', 'v', 60)).resolves.toBeUndefined();
  });
});
