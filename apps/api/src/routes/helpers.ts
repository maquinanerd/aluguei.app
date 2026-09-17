import type { FastifyReply } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { memberships } from '@aluguei/db';
import type { AppDb, organizations, users } from '@aluguei/db';
import { DomainError } from '@aluguei/domain';
import { setSessionCookie } from '../plugins/session.js';

export const SESSION_COOKIE_NAME = 'aluguei_session';

/**
 * Retorna a primeira linha. Ausência vira 404 (nunca 500): rotas filhas de um
 * recurso de outra organização respondem "não encontrado" (P0-05).
 */
export function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) {
    throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
  }
  return row;
}

/** Tabela multi-tenant: toda entidade referenciável tem `id` e `org_id`. */
export type OrgScopedTable = PgTable & { id: AnyPgColumn; orgId: AnyPgColumn };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id fora do formato uuid não chega ao banco (evita 22P02 → 500). */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Garante que TODOS os ids pertencem à organização. Id de outra org e id
 * inexistente produzem a mesma resposta (404, mesma mensagem) — sem oráculo de
 * existência. `extra` restringe ainda mais o dono (mesma vistoria, mesma
 * conexão, mídia pública...).
 */
export async function assertAllOwnedByOrg(
  db: AppDb,
  table: OrgScopedTable,
  ids: readonly string[] | null | undefined,
  orgId: string,
  message: string,
  extra?: SQL,
): Promise<void> {
  const unique = [...new Set(ids ?? [])];
  if (unique.length === 0) {
    return;
  }
  if (!unique.every(isUuid)) {
    throw new DomainError('NOT_FOUND', message);
  }
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(inArray(table.id, unique), eq(table.orgId, orgId), extra));
  if (rows.length !== unique.length) {
    throw new DomainError('NOT_FOUND', message);
  }
}

/** Idem para um id único; `null`/`undefined` é no-op (referência opcional). */
export async function assertOwnedByOrg(
  db: AppDb,
  table: OrgScopedTable,
  id: string | null | undefined,
  orgId: string,
  message: string,
  extra?: SQL,
): Promise<void> {
  if (id === null || id === undefined) {
    return;
  }
  await assertAllOwnedByOrg(db, table, [id], orgId, message, extra);
}

/** Garante que o usuário é membro da organização (responsável por tarefa etc.). */
export async function assertOrgMember(
  db: AppDb,
  orgId: string,
  userId: string | null | undefined,
  message: string,
): Promise<void> {
  if (userId === null || userId === undefined) {
    return;
  }
  if (!isUuid(userId)) {
    throw new DomainError('NOT_FOUND', message);
  }
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) {
    throw new DomainError('NOT_FOUND', message);
  }
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

export function toOrgDto(o: OrgRow): {
  id: string;
  name: string;
  slug: string;
  status: string;
  statusReason: string | null;
} {
  return { id: o.id, name: o.name, slug: o.slug, status: o.status, statusReason: o.statusReason };
}

export function toMembershipDto(m: MembershipRow): {
  id: string;
  orgId: string;
  role: 'owner' | 'admin' | 'agent' | 'inspector' | 'finance' | 'viewer';
  createdAt: string;
} {
  return { id: m.id, orgId: m.orgId, role: m.role, createdAt: m.createdAt.toISOString() };
}
