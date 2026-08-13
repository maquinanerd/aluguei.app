import type { FastifyReply } from 'fastify';
import type { memberships, organizations, users } from '@aluguei/db';
import { setSessionCookie } from '../plugins/session.js';

export const SESSION_COOKIE_NAME = 'aluguei_session';

/** Retorna a primeira linha ou lança (inserts/selects .limit(1) sempre têm 1 linha). */
export function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error('expected at least one row');
  }
  return row;
}

export function setAuthCookie(
  reply: FastifyReply,
  token: string,
  ttlSeconds: number,
  secure: boolean,
): void {
  setSessionCookie(reply, SESSION_COOKIE_NAME, token, ttlSeconds, secure);
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

type UserRow = typeof users.$inferSelect;
type OrgRow = typeof organizations.$inferSelect;
type MembershipRow = typeof memberships.$inferSelect;

export function toUserDto(u: UserRow): { id: string; email: string; name: string } {
  return { id: u.id, email: u.email, name: u.name };
}

export function toOrgDto(o: OrgRow): { id: string; name: string; slug: string } {
  return { id: o.id, name: o.name, slug: o.slug };
}

export function toMembershipDto(m: MembershipRow): {
  id: string;
  orgId: string;
  role: 'owner' | 'admin' | 'agent' | 'inspector' | 'finance' | 'viewer';
  createdAt: string;
} {
  return { id: m.id, orgId: m.orgId, role: m.role, createdAt: m.createdAt.toISOString() };
}
