/**
 * Loop de ciclos do worker (auditoria 2026-09-10, P2-10). Um ciclo por vez — ciclos sobrepostos
 * processavam o mesmo evento em paralelo (P0-01) —, o primeiro logo ao iniciar e os seguintes no
 * intervalo. `stop` para de pegar jobs e espera o ciclo em andamento até o limite; o estado
 * alimenta o health HTTP.
 */
export interface JobLoopState {
  /** Quando o loop foi iniciado (ms). */
  startedAt: number;
  running: boolean;
  stopping: boolean;
  /** Início do ciclo em andamento; null sem ciclo em andamento. */
  cycleStartedAt: number | null;
  lastCycleFinishedAt: number | null;
  lastCycleOkAt: number | null;
  consecutiveFailures: number;
  cycles: number;
}

export interface JobLoopOptions {
  intervalMs: number;
  runCycle: () => Promise<unknown>;
  onCycleError?: (err: unknown) => void;
  now?: () => number;
}

export type JobLoopStopOutcome = 'drained' | 'timeout';

export interface JobLoop {
  start(): void;
  /** Não inicia ciclo novo; espera o em andamento até `timeoutMs`. */
  stop(timeoutMs: number): Promise<JobLoopStopOutcome>;
  state(): JobLoopState;
}

export function createJobLoop(opts: JobLoopOptions): JobLoop {
  const now = opts.now ?? Date.now;
  const state: JobLoopState = {
    startedAt: now(),
    running: false,
    stopping: false,
    cycleStartedAt: null,
    lastCycleFinishedAt: null,
    lastCycleOkAt: null,
    consecutiveFailures: 0,
    cycles: 0,
  };
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;

  const tick = (): void => {
    if (state.stopping || inFlight) {
      return;
    }
    state.cycleStartedAt = now();
    state.cycles += 1;
    inFlight = (async () => {
      try {
        await opts.runCycle();
        state.lastCycleOkAt = now();
        state.consecutiveFailures = 0;
      } catch (err) {
        state.consecutiveFailures += 1;
        opts.onCycleError?.(err);
      } finally {
        state.lastCycleFinishedAt = now();
        state.cycleStartedAt = null;
        inFlight = null;
      }
    })();
  };

  return {
    start() {
      if (state.running || state.stopping) {
        return;
      }
      state.running = true;
      state.startedAt = now();
      timer = setInterval(tick, opts.intervalMs);
      tick();
    },

    async stop(timeoutMs) {
      state.stopping = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const current = inFlight;
      if (!current) {
        return 'drained';
      }
      let expire: (outcome: JobLoopStopOutcome) => void = () => undefined;
      const expired = new Promise<JobLoopStopOutcome>((resolve) => {
        expire = resolve;
      });
      const limit = setTimeout(() => {
        expire('timeout');
      }, timeoutMs);
      const outcome = await Promise.race([
        current.then((): JobLoopStopOutcome => 'drained'),
        expired,
      ]);
      clearTimeout(limit);
      return outcome;
    },

    state() {
      return { ...state };
    },
  };
}
