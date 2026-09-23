import { hasPermission } from './rbac';
import type { OrganizationStatus } from './account-status';
import type { Permission, PlanModule, Role } from '@aluguei/domain';

/** Sessão do painel (shape de /auth/me). */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  statusReason: string | null;
}

export interface SessionMembership {
  id: string;
  orgId: string;
  role: Role;
  createdAt: string;
}

/** Plano da imobiliária ativa, como `/auth/me` devolve (ADR-095/096). */
export interface SessionPlan {
  id: string;
  code: string;
  name: string;
  modules: PlanModule[];
  monthlyPriceCents: number | null;
  limits: {
    maxUsers: number | null;
    maxProperties: number | null;
    maxPublishedListings: number | null;
    maxActiveLeases: number | null;
  };
}

export interface Session {
  user: SessionUser;
  activeOrg: SessionOrg | null;
  memberships: SessionMembership[];
  /** Nulo sem imobiliária ativa (admin da plataforma, por exemplo). */
  plan: SessionPlan | null;
  /** E-mail na allowlist PLATFORM_ADMIN_EMAILS da API. */
  platformAdmin: boolean;
}

/** O plano inclui o módulo? Sem plano na sessão, nada é liberado por engano. */
export function hasModule(session: Session, module: PlanModule): boolean {
  return session.plan?.modules.includes(module) ?? false;
}

/** Função do usuário na org ativa (fallback: viewer). */
export function activeRole(session: Session): Role {
  if (!session.activeOrg) return 'viewer';
  const m = session.memberships.find((x) => x.orgId === session.activeOrg?.id);
  return m?.role ?? 'viewer';
}

export function can(session: Session, permission: Permission): boolean {
  return hasPermission(activeRole(session), permission);
}

export function anyPermission(session: Session, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(session, p));
}
