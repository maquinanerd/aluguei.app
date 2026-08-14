import type { FastifyRequest } from 'fastify';
import { DomainError, hasPermission } from '@aluguei/domain';
import type { Permission } from '@aluguei/domain';
import type { AuthUser } from './session.js';
import type { PortalAuth } from './portal-session.js';

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

/** Exige autenticação do portal externo; lança 401 sem `request.portalAuth`. */
export function requirePortalAuth(request: FastifyRequest): PortalAuth {
  if (!request.portalAuth) {
    throw new DomainError('UNAUTHORIZED', 'Sessão de portal necessária');
  }
  return request.portalAuth;
}

/** Hook onRequest que exige portal de um kind específico (TENANT/LANDLORD). */
export function requirePortalKind(kind: PortalAuth['kind']) {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (request: FastifyRequest): Promise<void> => {
    const portal = requirePortalAuth(request);
    if (portal.kind !== kind) {
      throw new DomainError('FORBIDDEN', `Portal de tipo ${kind} necessário`);
    }
  };
}
