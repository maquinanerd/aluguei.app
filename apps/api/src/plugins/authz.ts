import type { FastifyRequest } from 'fastify';
import {
  DomainError,
  assertPlanIncludesModule,
  hasPermission,
  organizationCanOperate,
} from '@aluguei/domain';
import type { OrganizationStatus, Permission, PlanModule } from '@aluguei/domain';
import type { AuthUser, SessionUser } from './session.js';
import type { PortalAuth } from './portal-session.js';

const ORG_NOT_ACTIVE_MESSAGES: Record<OrganizationStatus, string> = {
  PENDING_APPROVAL: 'Cadastro da imobiliária em análise',
  ACTIVE: 'Imobiliária ativa',
  SUSPENDED: 'Imobiliária suspensa',
  REJECTED: 'Cadastro da imobiliária recusado',
};

/** Recusa (403) imobiliária que não pode operar, com o status para a interface. */
export function assertOrganizationCanOperate(status: OrganizationStatus): void {
  if (!organizationCanOperate(status)) {
    throw new DomainError('FORBIDDEN', ORG_NOT_ACTIVE_MESSAGES[status], {
      reason: 'ORG_NOT_ACTIVE',
      status,
    });
  }
}

/**
 * Exige sessão válida, com ou sem imobiliária ativa — só para as rotas da própria
 * conta (`/auth/me`, logout, troca de imobiliária) e da plataforma.
 */
export function requireSession(request: FastifyRequest): SessionUser {
  if (!request.sessionUser) {
    throw new DomainError('UNAUTHORIZED', 'Autenticação necessária');
  }
  return request.sessionUser;
}

/**
 * Exige autenticação numa imobiliária que pode operar: 401 sem sessão; 403 com
 * `details.reason = ORG_NOT_ACTIVE` quando a imobiliária está em análise,
 * suspensa ou recusada.
 */
export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.auth) {
    throw new DomainError('UNAUTHORIZED', 'Autenticação necessária');
  }
  assertOrganizationCanOperate(request.auth.orgStatus);
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

/**
 * Retorna hook onRequest que exige o módulo no plano da imobiliária: 403 com
 * `details.reason = PLAN_MODULE_NOT_INCLUDED` e `details.module`, que é o que o
 * painel usa para mostrar a tela "Fora do seu plano" em vez do erro genérico.
 * Async pelo mesmo motivo de `requirePermission`.
 */
export function requireModule(module: PlanModule) {
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (request: FastifyRequest): Promise<void> => {
    const auth = requireAuth(request);
    assertPlanIncludesModule(auth.planModules, module);
  };
}

/** Exige admin da plataforma (allowlist `PLATFORM_ADMIN_EMAILS`): 401 sem sessão, 403 sem acesso. */
export function requirePlatformAdmin(request: FastifyRequest): SessionUser {
  const session = requireSession(request);
  if (!session.platformAdmin) {
    throw new DomainError('FORBIDDEN', 'Acesso restrito à administração da plataforma');
  }
  return session;
}

/** Exige autenticação do portal externo; lança 401 sem `request.portalAuth`. */
export function requirePortalAuth(request: FastifyRequest): PortalAuth {
  if (!request.portalAuth) {
    throw new DomainError('UNAUTHORIZED', 'Sessão de portal necessária');
  }
  assertOrganizationCanOperate(request.portalAuth.orgStatus);
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
