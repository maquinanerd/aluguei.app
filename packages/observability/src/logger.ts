import { pino, stdSerializers, type Logger, type LoggerOptions } from 'pino';
import { redactPiiDeep, redactPiiText, redactUrl } from './pii.js';

export interface CreateLoggerOptions {
  level?: string;
}

/** Paths de redação suportados por pino/fast-redact (1 segmento por `*`, case-sensitive). */
const SECRET_PATHS = [
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

/**
 * Cookies e dado pessoal por caminho (auditoria 2026-09-10, P2-11). O que nenhum caminho
 * alcança — texto livre, erros, objetos fundos — sai pela redação por padrão de valor.
 */
const PII_PATHS = [
  'cookie',
  '*.cookie',
  'cookies',
  '*.cookies',
  'headers.cookie',
  '*.headers.cookie',
  '*.*.headers.cookie',
  'headers["set-cookie"]',
  '*.headers["set-cookie"]',
  '*.*.headers["set-cookie"]',
  'cpf',
  '*.cpf',
  'cnpj',
  '*.cnpj',
  'document',
  '*.document',
  'email',
  '*.email',
  'phone',
  '*.phone',
  'waContactId',
  '*.waContactId',
  'identities[*].value',
  '*.identities[*].value',
];

/** Requisição do Fastify (tem `raw`): os campos do serializer padrão, com a URL redigida. */
interface FastifyRequestLike {
  raw: unknown;
  method?: string;
  url?: string;
  host?: string;
  ip?: string;
  headers?: Record<string, unknown>;
  socket?: { remotePort?: number };
}

function isFastifyRequest(value: unknown): value is FastifyRequestLike {
  return value !== null && typeof value === 'object' && 'raw' in value;
}

function serializeRequest(req: unknown): unknown {
  if (!isFastifyRequest(req)) {
    return redactPiiDeep(req);
  }
  return {
    method: req.method,
    url: typeof req.url === 'string' ? redactUrl(req.url) : req.url,
    version: req.headers?.['accept-version'],
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  };
}

function serializeError(err: unknown): unknown {
  if (!(err instanceof Error)) {
    return redactPiiDeep(err);
  }
  // O serializer padrão devolve objetos com protótipo próprio (inclusive nas causas): a cópia
  // em JSON vira objeto simples, que a redação atravessa — mensagem, pilha e causas.
  const serialized = JSON.parse(JSON.stringify(stdSerializers.err(err))) as unknown;
  return redactPiiDeep(serialized);
}

/** Opções de pino com redação — reutilizáveis pelo Fastify (que cria o logger internamente). */
export function loggerOptions(opts: CreateLoggerOptions = {}): LoggerOptions {
  return {
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [...SECRET_PATHS, ...PII_PATHS],
      censor: '[REDACTED]',
    },
    serializers: {
      err: serializeError,
      req: serializeRequest,
    },
    formatters: {
      // Cópia redigida do objeto do log (instâncias ficam para os serializers).
      log: (object) => redactPiiDeep(object) as Record<string, unknown>,
    },
    hooks: {
      // Mensagem e argumentos de interpolação.
      logMethod(args, method) {
        const redacted = args.map((arg) => (typeof arg === 'string' ? redactPiiText(arg) : arg));
        method.apply(this, redacted as Parameters<typeof method>);
      },
    },
  };
}

/** Logger estruturado com redação de segredos e de dado pessoal. */
export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  return pino(loggerOptions(opts));
}
