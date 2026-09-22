import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '@aluguei/domain';
import { captureError } from '@aluguei/observability';

const DOMAIN_STATUS: Record<string, number> = {
  INVALID_TRANSITION: 409,
  DUPLICATE_IDENTITY: 409,
  CONFLICT: 409,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PROVIDER_ERROR: 502,
  PLAN_LIMIT_REACHED: 409,
};

/**
 * Código de erro do PostgreSQL. O drizzle embrulha o erro do driver (e uma
 * falha dentro de transação pode vir embrulhada mais de uma vez), então a
 * cadeia de causas é percorrida.
 */
function postgresErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate.code;
    }
    current = candidate.cause;
  }
  return null;
}

/** Error handler padrão: DomainError → status + ErrorResponse; ZodError → 400. */
export function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof DomainError) {
      const status = DOMAIN_STATUS[err.code] ?? 400;
      return reply.status(status).send({
        error: 'DomainError',
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      });
    }

    if (err instanceof ZodError) {
      const message = err.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return reply.status(400).send({
        error: 'ValidationError',
        code: 'VALIDATION',
        message,
      });
    }

    // Violação de unicidade do banco é conflito de negócio, não erro interno
    // (ex.: segunda cobrança do mesmo mês, segunda tentativa de pagamento
    // pendente) — auditoria 2026-09-10, P2-09.
    const pgCode = postgresErrorCode(err);
    if (pgCode === '23505') {
      request.log.debug({ code: pgCode }, 'unique violation');
      return reply.status(409).send({
        error: 'DomainError',
        code: 'CONFLICT',
        message: 'Registro já existente',
      });
    }

    // Erros de framework com statusCode explícito (ex.: 429 rate limit, 413
    // bodyLimit, 400 body parse) não podem virar 500 genérico.
    const frameworkError = err as {
      statusCode?: unknown;
      message?: string;
      name?: string;
      code?: string;
    };
    const statusCode =
      typeof frameworkError.statusCode === 'number' ? frameworkError.statusCode : null;
    if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
      const message = frameworkError.message ?? 'Requisição inválida';
      request.log.debug({ code: statusCode }, 'request rejected by framework');
      return reply.status(statusCode).send({
        error: 'RequestError',
        code: frameworkError.code ?? 'REQUEST',
        message,
      });
    }

    // O serializador do pino descarta `cause` e `code`: sem isso um erro do
    // banco chega ao log como "Failed query", sem o motivo.
    const cause = (err as { cause?: { message?: unknown; code?: unknown; constraint?: unknown } })
      .cause;
    // Captura de erro (auditoria 2026-09-10, P2-11): origem, rota, pilha e marca no span ativo.
    captureError(request.log, err, {
      kind: 'http_5xx',
      method: request.method,
      route: request.routeOptions.url ?? request.url,
      statusCode: 500,
      pgCode,
      causeMessage: typeof cause?.message === 'string' ? cause.message : undefined,
      causeCode: typeof cause?.code === 'string' ? cause.code : undefined,
      causeConstraint: typeof cause?.constraint === 'string' ? cause.constraint : undefined,
    });
    return reply.status(500).send({
      error: 'InternalServerError',
      code: 'INTERNAL',
      message: 'Erro interno',
    });
  });
}
