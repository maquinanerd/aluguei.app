import { pino, type Logger, type LoggerOptions } from 'pino';

export interface CreateLoggerOptions {
  level?: string;
}

/** Paths de redação suportados por pino/fast-redact (1 segmento por `*`, case-sensitive). */
const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'req.headers.authorization',
  '*.headers.authorization',
  'apiKey',
  '*.apiKey',
  'access_token',
  'refresh_token',
  'client_secret',
  'x-api-key',
  '*.x-api-key',
];

/** Opções de pino com redação — reutilizáveis pelo Fastify (que cria o logger internamente). */
export function loggerOptions(opts: CreateLoggerOptions = {}): LoggerOptions {
  return {
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  };
}

/** Logger estruturado com redação de campos sensíveis. */
export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  return pino(loggerOptions(opts));
}
