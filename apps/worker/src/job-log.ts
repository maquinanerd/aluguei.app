import { performance } from 'node:perf_hooks';

/**
 * Log estruturado por job (auditoria 2026-09-10, P2-10): início, fim e falha, com fila, id,
 * tipo, tentativa, organização, duração e mensagem de erro. Compatível com o pino (objeto e
 * mensagem), que redige dado pessoal antes de gravar.
 */
export interface JobLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export type JobQueue = 'inbox' | 'channel' | 'meta';

export interface JobRef {
  queue: JobQueue;
  jobId: string;
  /** Provider do inbox, `canal:operação` nos canais, tipo do job da Meta. */
  jobType: string;
  attempt: number;
  orgId: string;
}

export interface JobLogHandle {
  /** Job concluído: `SUCCESS`, ou `IGNORED` quando outra execução já detinha o claim. */
  finished(status: string, extra?: Record<string, unknown>): void;
  /** Job com erro: status gravado na fila (`FAILED` ou `DEAD`) e a mensagem já saneada. */
  failed(status: string, error: string, extra?: Record<string, unknown>): void;
}

export function startJobLog(logger: JobLogger | undefined, ref: JobRef): JobLogHandle {
  const startedAt = performance.now();
  const durationMs = (): number => Math.round(performance.now() - startedAt);
  logger?.info({ event: 'job.started', ...ref }, 'job iniciado');
  return {
    finished(status, extra = {}) {
      logger?.info(
        { event: 'job.finished', ...ref, status, durationMs: durationMs(), ...extra },
        'job concluído',
      );
    },
    failed(status, error, extra = {}) {
      logger?.error(
        { event: 'job.failed', ...ref, status, durationMs: durationMs(), error, ...extra },
        'job falhou',
      );
    },
  };
}
