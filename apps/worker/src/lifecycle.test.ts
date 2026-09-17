import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { createTestDb } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { run } from './index.js';

/**
 * P2-10 (auditoria 2026-09-10): SIGTERM e SIGINT chamavam `process.exit` na hora — um job no meio
 * era cortado e o pool nunca fechava. O worker para de pegar jobs, espera os em andamento até o
 * limite, fecha health e pool e deixa o processo terminar sozinho; `process.exit` só como último
 * recurso, depois do limite.
 */
interface Entry {
  level: string;
  obj: Record<string, unknown>;
  msg: string;
}

function captureLogger(): {
  entries: Entry[];
  logger: Record<'info' | 'warn' | 'error' | 'debug', (obj: unknown, msg?: string) => void>;
} {
  const entries: Entry[] = [];
  const push =
    (level: string) =>
    (obj: unknown, msg?: string): void => {
      entries.push({
        level,
        obj: typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>) : {},
        msg: typeof obj === 'string' ? obj : (msg ?? ''),
      });
    };
  return {
    entries,
    logger: { info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') },
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitFor<T>(
  find: () => T | undefined | Promise<T | undefined>,
  timeoutMs: number,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await find();
    if (found !== undefined) {
      return found;
    }
    await sleep(10);
  }
  return undefined;
}

type Listener = (...args: unknown[]) => void;

function newListener(signal: 'SIGTERM' | 'SIGINT', before: Listener[]): Listener | undefined {
  return (process.listeners(signal) as Listener[]).find((listener) => !before.includes(listener));
}

describe('ciclo de vida do worker (P2-10)', () => {
  let db: AppDb;
  let exitSpy: MockInstance<typeof process.exit>;
  const originalExitCode = process.exitCode;
  const before: Record<'SIGTERM' | 'SIGINT', Listener[]> = { SIGTERM: [], SIGINT: [] };

  beforeEach(async () => {
    db = await createTestDb();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    before.SIGTERM = [...(process.listeners('SIGTERM') as Listener[])];
    before.SIGINT = [...(process.listeners('SIGINT') as Listener[])];
  });

  afterEach(() => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      for (const listener of process.listeners(signal) as Listener[]) {
        if (!before[signal].includes(listener)) {
          process.off(signal, listener);
        }
      }
    }
    exitSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it('SIGTERM: health 200 no ar; ao sinal, para de pegar jobs, fecha health e pool, sem process.exit', async () => {
    const { entries, logger } = captureLogger();
    const close = vi.spyOn(db.$client as unknown as { close: () => Promise<void> }, 'close');
    let sigterm: Listener | undefined;
    try {
      await run([], {
        db,
        logger,
        pollIntervalMs: 20,
        healthPort: 0,
        shutdownTimeoutMs: 5_000,
      });
      sigterm = newListener('SIGTERM', before.SIGTERM);
      expect(sigterm, 'o worker registra SIGTERM').toBeDefined();

      const listening = await waitFor(
        () => entries.find((entry) => entry.obj.event === 'worker.health.listening'),
        3_000,
      );
      expect(listening, 'health HTTP no ar').toBeDefined();
      const url = `http://127.0.0.1:${String(listening?.obj.port)}/health`;
      const healthy = await waitFor(async () => {
        const res = await fetch(url);
        return res.status === 200 ? res.status : undefined;
      }, 3_000);
      expect(healthy).toBe(200);

      sigterm?.('SIGTERM');
      expect(exitSpy).not.toHaveBeenCalled();

      const stopped = await waitFor(
        () => entries.find((entry) => entry.obj.event === 'worker.stopped'),
        5_000,
      );
      expect(stopped, JSON.stringify(entries.map((e) => e.obj.event ?? e.msg))).toBeDefined();
      const cyclesAtStop = entries.filter((entry) => entry.obj.event === 'worker.cycle').length;
      await sleep(100);
      expect(entries.filter((entry) => entry.obj.event === 'worker.cycle').length).toBe(
        cyclesAtStop,
      );
      expect(close).toHaveBeenCalledTimes(1);
      await expect(fetch(url)).rejects.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(process.exitCode ?? 0).toBe(0);
    } finally {
      if (sigterm && !entries.some((entry) => entry.obj.event === 'worker.stopping')) {
        sigterm('SIGTERM');
      }
    }
  });

  it('SIGINT também encerra de forma graciosa', async () => {
    const { entries, logger } = captureLogger();
    let sigint: Listener | undefined;
    try {
      await run([], { db, logger, pollIntervalMs: 20, shutdownTimeoutMs: 5_000 });
      sigint = newListener('SIGINT', before.SIGINT);
      expect(sigint).toBeDefined();
      sigint?.('SIGINT');
      expect(exitSpy).not.toHaveBeenCalled();
      const stopped = await waitFor(
        () => entries.find((entry) => entry.obj.event === 'worker.stopped'),
        5_000,
      );
      expect(stopped).toBeDefined();
      expect(stopped?.obj.signal).toBe('SIGINT');
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      if (sigint && !entries.some((entry) => entry.obj.event === 'worker.stopping')) {
        sigint('SIGINT');
      }
    }
  });

  it('job que não termina no limite: loga o timeout, exitCode 1 e process.exit só depois do limite', async () => {
    const { entries, logger } = captureLogger();
    let sigterm: Listener | undefined;
    try {
      await run([], {
        db,
        logger,
        pollIntervalMs: 20,
        shutdownTimeoutMs: 100,
        runCycle: () => new Promise(() => undefined),
      });
      sigterm = newListener('SIGTERM', before.SIGTERM);
      expect(sigterm).toBeDefined();
      await sleep(50);
      const signaledAt = Date.now();
      sigterm?.('SIGTERM');
      expect(exitSpy).not.toHaveBeenCalled();

      const timedOut = await waitFor(
        () => entries.find((entry) => entry.obj.event === 'worker.shutdown_timeout'),
        3_000,
      );
      expect(timedOut?.level).toBe('error');
      expect(Date.now() - signaledAt).toBeGreaterThanOrEqual(90);
      expect(process.exitCode).toBe(1);
      await waitFor(() => (exitSpy.mock.calls.length > 0 ? true : undefined), 3_000);
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      if (sigterm && !entries.some((entry) => entry.obj.event === 'worker.stopping')) {
        sigterm('SIGTERM');
      }
    }
  });
});
