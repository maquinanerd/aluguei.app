import { createServer } from 'node:http';
import type { JobLoopState } from './job-loop.js';

/**
 * Health HTTP do worker (auditoria 2026-09-10, P2-10): `GET /health` responde 200 com o loop
 * saudável e 503 com o motivo nos demais casos. O corpo só tem estado do loop, nunca
 * configuração ou dado de job.
 */
export interface HealthPolicy {
  /** Sem ciclo bem-sucedido (ou sem nenhum, desde o início) por mais que isso: `stale`. */
  staleAfterMs: number;
  /** Ciclo em andamento há mais que isso: `cycle_stuck` (o reaper usa 5 minutos). */
  maxCycleMs: number;
  /** Falhas de ciclo seguidas a partir das quais o worker é `failing`. */
  maxConsecutiveFailures: number;
}

export type HealthReason = 'ok' | 'stopping' | 'not_started' | 'cycle_stuck' | 'failing' | 'stale';

export interface HealthVerdict {
  healthy: boolean;
  reason: HealthReason;
}

export function evaluateWorkerHealth(
  state: JobLoopState,
  policy: HealthPolicy,
  now: number,
): HealthVerdict {
  if (state.stopping) {
    return { healthy: false, reason: 'stopping' };
  }
  if (!state.running) {
    return { healthy: false, reason: 'not_started' };
  }
  if (state.cycleStartedAt !== null && now - state.cycleStartedAt > policy.maxCycleMs) {
    return { healthy: false, reason: 'cycle_stuck' };
  }
  if (state.consecutiveFailures >= policy.maxConsecutiveFailures) {
    return { healthy: false, reason: 'failing' };
  }
  const lastOk = state.lastCycleOkAt ?? state.startedAt;
  if (now - lastOk > policy.staleAfterMs) {
    return { healthy: false, reason: 'stale' };
  }
  return { healthy: true, reason: 'ok' };
}

/** Política padrão para um intervalo de poll: prazo de 12 intervalos (mínimo 60 s). */
export function defaultHealthPolicy(pollIntervalMs: number): HealthPolicy {
  return {
    staleAfterMs: Math.max(60_000, pollIntervalMs * 12),
    maxCycleMs: 5 * 60_000,
    maxConsecutiveFailures: 3,
  };
}

export interface HealthServer {
  port: number;
  close(): Promise<void>;
}

export interface HealthServerOptions {
  port: number;
  host?: string;
  state: () => JobLoopState;
  policy: HealthPolicy;
  now?: () => number;
}

export function startHealthServer(opts: HealthServerOptions): Promise<HealthServer> {
  const now = opts.now ?? Date.now;
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'GET' || path !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'NotFound' }));
      return;
    }
    const state = opts.state();
    const at = now();
    const verdict = evaluateWorkerHealth(state, opts.policy, at);
    res.writeHead(verdict.healthy ? 200 : 503, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(
      JSON.stringify({
        status: verdict.healthy ? 'ok' : 'unavailable',
        service: 'worker',
        reason: verdict.reason,
        uptimeMs: Math.max(0, at - state.startedAt),
        cycles: state.cycles,
        consecutiveFailures: state.consecutiveFailures,
        lastCycleOkAt:
          state.lastCycleOkAt === null ? null : new Date(state.lastCycleOkAt).toISOString(),
      }),
    );
  });
  // Conexões keep-alive seguram o close; o health não precisa delas.
  server.keepAliveTimeout = 1_000;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      server.off('error', reject);
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
            server.closeAllConnections();
          }),
      });
    });
  });
}
