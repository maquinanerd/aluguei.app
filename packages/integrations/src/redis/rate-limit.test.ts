import { describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  class FakeRedis {
    static last: FakeRedis | null = null;
    readonly url: string;
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, (err: unknown) => void>();
    status = 'connecting';
    quitCalls = 0;
    disconnectCalls = 0;

    constructor(url: string, options: Record<string, unknown>) {
      this.url = url;
      this.options = options;
      FakeRedis.last = this;
    }

    on(event: string, handler: (err: unknown) => void): this {
      this.handlers.set(event, handler);
      return this;
    }

    quit(): Promise<string> {
      this.quitCalls += 1;
      return Promise.resolve('OK');
    }

    disconnect(): void {
      this.disconnectCalls += 1;
    }
  }
  return { FakeRedis };
});

vi.mock('ioredis', () => ({ default: fake.FakeRedis, Redis: fake.FakeRedis }));

import { closeRateLimitRedis, createRateLimitRedis } from './rate-limit.js';

describe('createRateLimitRedis (store do @fastify/rate-limit)', () => {
  it('cria o client ioredis sem fila offline, com uma tentativa e timeout curto por comando', () => {
    createRateLimitRedis('redis://cache:6379');
    const client = fake.FakeRedis.last;
    expect(client?.url).toBe('redis://cache:6379');
    expect(client?.options).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
    });
    const retry = client?.options.retryStrategy as (attempt: number) => number;
    expect(retry(1)).toBe(200);
    expect(retry(100)).toBe(5_000);
  });

  it('erro de conexão vai para onError e nunca fica sem handler', () => {
    const onError = vi.fn();
    createRateLimitRedis('redis://cache:6379', { onError });
    const handler = fake.FakeRedis.last?.handlers.get('error');
    expect(handler).toBeDefined();
    handler?.(new Error('ECONNREFUSED'));
    expect(onError).toHaveBeenCalledTimes(1);

    createRateLimitRedis('redis://cache:6379');
    expect(() => fake.FakeRedis.last?.handlers.get('error')?.(new Error('x'))).not.toThrow();
  });

  it('fecha com QUIT quando conectado e só desconecta nos demais estados', async () => {
    const connected = createRateLimitRedis('redis://cache:6379');
    const connectedFake = fake.FakeRedis.last;
    if (connectedFake) {
      connectedFake.status = 'ready';
    }
    await closeRateLimitRedis(connected);
    expect(connectedFake?.quitCalls).toBe(1);
    expect(connectedFake?.disconnectCalls).toBe(0);

    const offline = createRateLimitRedis('redis://cache:6379');
    const offlineFake = fake.FakeRedis.last;
    await closeRateLimitRedis(offline);
    expect(offlineFake?.quitCalls).toBe(0);
    expect(offlineFake?.disconnectCalls).toBe(1);
  });
});
