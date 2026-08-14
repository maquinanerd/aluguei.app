import { hasPermission } from './rbac';
import type { Permission, Role } from '@aluguei/domain';

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
}

export interface SessionMembership {
  id: string;
  orgId: string;
  role: Role;
  createdAt: string;
}

export interface Session {
  user: SessionUser;
  activeOrg: SessionOrg | null;
  memberships: SessionMembership[];
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
