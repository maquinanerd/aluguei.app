import { afterEach, describe, expect, it } from 'vitest';
import { evaluateWorkerHealth, startHealthServer } from './health.js';
import type { HealthServer } from './health.js';
import type { JobLoopState } from './job-loop.js';

/**
 * P2-10 (auditoria 2026-09-10): o worker não tinha health — um worker parado, travado ou com o
 * banco fora do ar parecia saudável para o orquestrador. `GET /health` responde 200 com o loop
 * saudável e 503 nos demais casos, com o motivo.
 */
const NOW = 1_000_000;
const POLICY = { staleAfterMs: 60_000, maxCycleMs: 300_000, maxConsecutiveFailures: 3 };

function state(overrides: Partial<JobLoopState> = {}): JobLoopState {
  return {
    startedAt: NOW - 10_000,
    running: true,
    stopping: false,
    cycleStartedAt: null,
    lastCycleFinishedAt: NOW - 1_000,
    lastCycleOkAt: NOW - 1_000,
    consecutiveFailures: 0,
    cycles: 5,
    ...overrides,
  };
}

describe('evaluateWorkerHealth', () => {
  it.each([
    ['loop rodando com ciclo recente', state(), true, 'ok'],
    [
      'recém-iniciado, ainda sem ciclo concluído',
      state({ lastCycleFinishedAt: null, lastCycleOkAt: null, cycles: 0 }),
      true,
      'ok',
    ],
    ['ciclo em andamento dentro do limite', state({ cycleStartedAt: NOW - 30_000 }), true, 'ok'],
    ['parando', state({ stopping: true }), false, 'stopping'],
    ['loop não iniciado', state({ running: false }), false, 'not_started'],
    ['ciclo preso além do limite', state({ cycleStartedAt: NOW - 300_001 }), false, 'cycle_stuck'],
    ['três falhas seguidas', state({ consecutiveFailures: 3 }), false, 'failing'],
    [
      'sem ciclo bem-sucedido há mais que o prazo',
      state({ lastCycleOkAt: NOW - 60_001, lastCycleFinishedAt: NOW - 60_001 }),
      false,
      'stale',
    ],
    [
      'iniciado há mais que o prazo sem nenhum ciclo concluído',
      state({ startedAt: NOW - 60_001, lastCycleOkAt: null, lastCycleFinishedAt: null, cycles: 0 }),
      false,
      'stale',
    ],
  ] as Array<[string, JobLoopState, boolean, string]>)(
    '%s',
    (_name, loopState, healthy, reason) => {
      expect(evaluateWorkerHealth(loopState, POLICY, NOW)).toEqual({ healthy, reason });
    },
  );
});

describe('startHealthServer', () => {
  let server: HealthServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it('GET /health: 200 com o loop saudável e 503 quando deixa de estar, com JSON sem segredo', async () => {
    let current = state();
    server = await startHealthServer({
      port: 0,
      host: '127.0.0.1',
      state: () => current,
      policy: POLICY,
      now: () => NOW,
    });
    const url = `http://127.0.0.1:${String(server.port)}/health`;

    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      status: 'ok',
      service: 'worker',
      reason: 'ok',
      consecutiveFailures: 0,
    });

    current = state({ consecutiveFailures: 4 });
    const failing = await fetch(url);
    expect(failing.status).toBe(503);
    expect(await failing.json()).toMatchObject({ status: 'unavailable', reason: 'failing' });

    current = state({ stopping: true });
    expect((await fetch(url)).status).toBe(503);
  });

  it('outras rotas respondem 404 e close libera a porta', async () => {
    server = await startHealthServer({ port: 0, host: '127.0.0.1', state, policy: POLICY });
    const base = `http://127.0.0.1:${String(server.port)}`;
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/health/ready`)).status).toBe(404);
    await server.close();
    server = null;
    await expect(fetch(`${base}/health`)).rejects.toThrow();
  });
});
