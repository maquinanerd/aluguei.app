import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '@aluguei/config';

/**
 * P1-14 (auditoria 2026-09-10): com `REDIS_URL` a API caía no boot com
 * `TypeError: this.redis.defineCommand is not a function` — o rate limit recebia o
 * adapter get/set/del em vez de um client ioredis. Nenhum teste conecta num Redis de
 * verdade: o ioredis é substituído por um duplo em memória que executa os comandos Lua
 * do @fastify/rate-limit (contador por chave com janela).
 */
const redis = vi.hoisted(() => {
  interface Call {
    command: string;
    key: string;
  }
  class FakeRedis {
    static instances: FakeRedis[] = [];
    readonly url: string;
    readonly options: Record<string, unknown>;
    readonly calls: Call[] = [];
    readonly listeners = new Map<string, Array<(arg: unknown) => void>>();
    status = 'wait';
    failWith: Error | null = null;
    closedBy: 'quit' | 'disconnect' | null = null;
    private readonly counters = new Map<string, number>();

    constructor(url: string, options: Record<string, unknown> = {}) {
      this.url = url;
      this.options = options;
      FakeRedis.instances.push(this);
    }

    on(event: string, listener: (arg: unknown) => void): this {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
      return this;
    }

    emit(event: string, arg: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(arg);
      }
    }

    defineCommand(name: string, _definition: { numberOfKeys: number; lua: string }): void {
      const self = this as unknown as Record<string, unknown>;
      self[name] = (key: string, ...rest: unknown[]) => {
        const callback = rest[rest.length - 1] as (err: Error | null, result?: number[]) => void;
        this.calls.push({ command: name, key });
        if (this.failWith) {
          callback(this.failWith);
          return;
        }
        const timeWindow = Number(rest[0] ?? 60_000);
        if (name === 'rateLimitRead') {
          callback(null, [this.counters.get(key) ?? 0, timeWindow]);
          return;
        }
        const current = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, current);
        callback(null, [current, timeWindow]);
      };
    }

    quit(): Promise<string> {
      this.closedBy = 'quit';
      this.status = 'end';
      return Promise.resolve('OK');
    }

    disconnect(): void {
      this.closedBy = 'disconnect';
      this.status = 'end';
    }
  }
  return { FakeRedis };
});

vi.mock('ioredis', () => ({ default: redis.FakeRedis, Redis: redis.FakeRedis }));

const { buildApp } = await import('./app.js');

const env: AppEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_HOST: '127.0.0.1',
  API_PORT: 0,
  APP_BASE_URL: 'http://localhost:3000',
  SESSION_TTL_SECONDS: 3600,
  REDIS_URL: 'redis://redis.interno:6379',
};

function logSink(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, text: () => chunks.join('') };
}

afterEach(() => {
  redis.FakeRedis.instances.length = 0;
});

describe('rate limit com REDIS_URL (P1-14)', () => {
  it('a API sobe e o limite global é contado no Redis', async () => {
    const app = await buildApp({ env });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('300');
      expect(res.headers['x-ratelimit-remaining']).toBe('299');

      expect(redis.FakeRedis.instances).toHaveLength(1);
      const client = redis.FakeRedis.instances[0];
      expect(client?.url).toBe('redis://redis.interno:6379');
      expect(client?.calls.map((c) => c.command)).toEqual(['rateLimit']);
    } finally {
      await app.close();
    }
  });

  it('o limite de rota sensível (cadastro: 10/min) é aplicado pelo Redis', async () => {
    const app = await buildApp({ env });
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const res = await app.inject({ method: 'POST', url: '/auth/register', payload: {} });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
      expect(statuses[10]).toBe(429);
      const keys = new Set(redis.FakeRedis.instances[0]?.calls.map((c) => c.key));
      expect([...keys].some((key) => key.includes('/auth/register'))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('Redis fora do ar não derruba as requisições e o erro de conexão vai para o log', async () => {
    const sink = logSink();
    const app = await buildApp({ env, logger: { level: 'warn', stream: sink.stream } });
    try {
      const client = redis.FakeRedis.instances[0];
      if (!client) {
        throw new Error('client do Redis não foi criado');
      }
      client.failWith = new Error('connect ECONNREFUSED 10.0.0.9:6379');
      client.emit('error', new Error('connect ECONNREFUSED 10.0.0.9:6379'));

      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(sink.text()).toContain('ECONNREFUSED');
    } finally {
      await app.close();
    }
  });

  it('fechar a API encerra o client do Redis', async () => {
    const app = await buildApp({ env });
    const client = redis.FakeRedis.instances[0];
    await app.close();
    expect(client?.closedBy).not.toBeNull();
  });
});
