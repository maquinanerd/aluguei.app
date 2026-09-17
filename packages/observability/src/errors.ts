import { activeSpan, markSpanError } from './telemetry.js';

/**
 * Captura de erro (auditoria 2026-09-10, P2-11): sem Sentry (rascunho de ADR da Trilha F), o
 * registro é log estruturado com origem e pilha mais a marca no span ativo — o mesmo trace que
 * já carrega HTTP e pg. Um coletor OTLP ou o agregador de logs viram a fonte de alerta.
 */
export type CapturedErrorKind =
  'http_5xx' | 'job_failed' | 'unhandled_rejection' | 'uncaught_exception';

export interface ErrorSink {
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface ErrorDetails {
  type: string;
  message: string;
  stack?: string;
}

/**
 * Tipo, mensagem e pilha para o log. A mensagem pode vir saneada (URLs e tokens removidos) e,
 * nesse caso, substitui também a primeira linha da pilha — que repete a mensagem original.
 */
export function errorDetails(err: unknown, message?: string): ErrorDetails {
  if (!(err instanceof Error)) {
    const text = typeof err === 'string' ? err : JSON.stringify(err);
    return { type: typeof err === 'string' ? 'String' : 'Unknown', message: message ?? text };
  }
  const safe = message ?? err.message;
  const details: ErrorDetails = { type: err.name, message: safe };
  if (err.stack) {
    const [first, ...rest] = err.stack.split('\n');
    const header = `${err.name}: ${safe}`;
    details.stack = [first?.includes(err.message) ? header : (first ?? header), ...rest].join('\n');
  }
  return details;
}

export interface CaptureContext extends Record<string, unknown> {
  kind: CapturedErrorKind;
  /** Mensagem já saneada (sem URL nem token), quando houver. */
  message?: string;
}

/** Registra o erro com origem e pilha e marca o span ativo (exceção + status de erro). */
export function captureError(
  logger: ErrorSink | undefined,
  err: unknown,
  context: CaptureContext,
): void {
  markSpanError(activeSpan(), err);
  const { message, ...rest } = context;
  logger?.error(
    { event: 'error.captured', ...rest, err: errorDetails(err, message) },
    'erro capturado',
  );
}

export interface ProcessErrorHandlerOptions {
  /** Emissor dos eventos (testes); padrão `process`. */
  target?: NodeJS.Process;
  /** Chamado depois de registrar: quem encerra decide (shutdown gracioso e exitCode). */
  onFatal?: (err: unknown, kind: CapturedErrorKind) => void;
}

/**
 * Trata `unhandledRejection` e `uncaughtException`: registra e avisa quem encerra, em vez de
 * deixar o processo morrer sem rastro. Devolve a função que desinstala os handlers.
 */
export function installProcessErrorHandlers(
  logger: ErrorSink | undefined,
  opts: ProcessErrorHandlerOptions = {},
): () => void {
  const target = opts.target ?? process;
  const onRejection = (err: unknown): void => {
    captureError(logger, err, { kind: 'unhandled_rejection' });
    opts.onFatal?.(err, 'unhandled_rejection');
  };
  const onException = (err: unknown): void => {
    captureError(logger, err, { kind: 'uncaught_exception' });
    opts.onFatal?.(err, 'uncaught_exception');
  };
  target.on('unhandledRejection', onRejection);
  target.on('uncaughtException', onException);
  return () => {
    target.off('unhandledRejection', onRejection);
    target.off('uncaughtException', onException);
  };
}
