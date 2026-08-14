import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '@aluguei/domain';

const DOMAIN_STATUS: Record<string, number> = {
  INVALID_TRANSITION: 409,
  DUPLICATE_IDENTITY: 409,
  CONFLICT: 409,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PROVIDER_ERROR: 502,
};

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

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: 'InternalServerError',
      code: 'INTERNAL',
      message: 'Erro interno',
    });
  });
}
