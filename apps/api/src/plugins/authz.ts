import type { FastifyRequest } from 'fastify';
import { DomainError, hasPermission } from '@aluguei/domain';
import type { Permission } from '@aluguei/domain';
import type { AuthUser } from './session.js';

/** Exige autenticação; lança 401 sem `request.auth`. */
export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.auth) {
    throw new DomainError('UNAUTHORIZED', 'Autenticação necessária');
  }
  return request.auth;
}

/**
 * Retorna hook onRequest que exige permissão RBAC (403 quando falta).
 * Async por design: hooks sync do Fastify que lançam podem deixar a request
 * pendurada (verificado em Fastify 5.12); o await garante rejeição via Promise.
 */
export function requirePermission(permission: Permission) {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (request: FastifyRequest): Promise<void> => {
    const auth = requireAuth(request);
    if (!hasPermission(auth.role, permission)) {
      throw new DomainError('FORBIDDEN', `Permissão insuficiente: ${permission}`);
    }
  };
}
