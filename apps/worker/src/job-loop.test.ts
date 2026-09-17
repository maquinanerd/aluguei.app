import { describe, expect, it } from 'vitest';
import { createJobLoop } from './job-loop.js';

/**
 * P2-10 (auditoria 2026-09-10): o loop do worker não tinha como parar sem `process.exit`. O loop
 * de ciclos para de pegar jobs no `stop`, espera o ciclo em andamento até o limite e expõe o
 * estado que o health usa.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitUntil(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('condição não atingida no prazo');
    }
    await sleep(5);
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createJobLoop', () => {
  it('roda o primeiro ciclo logo ao iniciar e depois no intervalo, sem sobrepor ciclos', async () => {
    let running = 0;
    let maxConcurrent = 0;
    let cycles = 0;
    const loop = createJobLoop({
      intervalMs: 10,
      runCycle: async () => {
        running += 1;
        maxConcurrent = Math.max(maxConcurrent, running);
        cycles += 1;
        await sleep(30);
        running -= 1;
      },
    });
    loop.start();
    await waitUntil(() => cycles >= 3);
    await loop.stop(1_000);
    expect(maxConcurrent).toBe(1);
    expect(loop.state().cycles).toBeGreaterThanOrEqual(3);
  });

  it('stop não inicia ciclo novo e espera o ciclo em andamento terminar', async () => {
    const gate = deferred();
    let cycles = 0;
    const loop = createJobLoop({
      intervalMs: 5,
      runCycle: () => {
        cycles += 1;
        return gate.promise;
      },
    });
    loop.start();
    await waitUntil(() => cycles === 1);
    let outcome: string | null = null;
    const stopping = loop.stop(2_000).then((result) => {
      outcome = result;
    });
    await sleep(50);
    expect(outcome).toBeNull();
    expect(loop.state().stopping).toBe(true);
    gate.resolve();
    await stopping;
    expect(outcome).toBe('drained');
    await sleep(30);
    expect(cycles).toBe(1);
  });

  it('ciclo que não termina: stop desiste no limite e informa timeout', async () => {
    let cycles = 0;
    const loop = createJobLoop({
      intervalMs: 5,
      runCycle: () => {
        cycles += 1;
        return new Promise(() => undefined);
      },
    });
    loop.start();
    await waitUntil(() => cycles === 1);
    const started = Date.now();
    await expect(loop.stop(80)).resolves.toBe('timeout');
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });

  it('sem ciclo em andamento, stop termina na hora', async () => {
    const loop = createJobLoop({ intervalMs: 60_000, runCycle: () => Promise.resolve() });
    loop.start();
    await waitUntil(() => loop.state().lastCycleFinishedAt !== null);
    const started = Date.now();
    await expect(loop.stop(5_000)).resolves.toBe('drained');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('erro no ciclo vai para onCycleError, conta falhas seguidas e zera no sucesso', async () => {
    const errors: unknown[] = [];
    let fail = true;
    let cycles = 0;
    const loop = createJobLoop({
      intervalMs: 5,
      runCycle: () => {
        cycles += 1;
        return fail ? Promise.reject(new Error('banco fora do ar')) : Promise.resolve();
      },
      onCycleError: (err) => {
        errors.push(err);
      },
    });
    loop.start();
    await waitUntil(() => loop.state().consecutiveFailures >= 2);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(loop.state().lastCycleOkAt).toBeNull();
    fail = false;
    await waitUntil(() => loop.state().consecutiveFailures === 0);
    expect(loop.state().lastCycleOkAt).not.toBeNull();
    await loop.stop(1_000);
    expect(cycles).toBeGreaterThanOrEqual(3);
  });
});
