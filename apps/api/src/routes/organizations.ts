import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { memberships, users } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, hasPermission, type Role } from '@aluguei/domain';
import {
  uuidSchema,
  createMemberRequestSchema,
  createMemberResponseSchema,
  listMembersResponseSchema,
  removeMemberResponseSchema,
  updateMemberRoleRequestSchema,
  updateMemberRoleResponseSchema,
} from '@aluguei/contracts';
import { requireAuth } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first, toMembershipDto } from './helpers.js';

/** Valida que o usuário é membro da org alvo e tem a permissão (404/403 se não). */
async function assertOrgMemberPermission(
  db: AppDb,
  orgId: string,
  userId: string,
  permission: 'member:read' | 'member:manage',
): Promise<void> {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!membership) {
    throw new DomainError('NOT_FOUND', 'Organização não encontrada');
  }
  if (!hasPermission(membership.role, permission)) {
    throw new DomainError('FORBIDDEN', 'Permissão insuficiente');
  }
}

/** Conta membros com role `owner` na org (guarda do último owner). */
async function countOwners(db: AppDb, orgId: string): Promise<number> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  return rows.filter((row) => row.role === 'owner').length;
}

export const organizationRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/organizations/:orgId/members', async (request) => {
    const auth = requireAuth(request);
    const { orgId } = z.object({ orgId: uuidSchema }).parse(request.params);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:read');

    const rows = await db.select().from(memberships).where(eq(memberships.orgId, orgId));
    const userIds = rows.map((r) => r.userId);
    const memberUsers =
      userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const userMap = new Map(memberUsers.map((u) => [u.id, u]));

    return listMembersResponseSchema.parse({
      members: rows.map((row) => {
        const user = userMap.get(row.userId);
        return {
          id: row.id,
          userId: row.userId,
          name: user?.name ?? '?',
          email: user?.email ?? '?',
          role: row.role,
        };
      }),
    });
  });

  app.post('/organizations/:orgId/members', async (request, reply) => {
    const auth = requireAuth(request);
    const { orgId } = z.object({ orgId: uuidSchema }).parse(request.params);
    const input = createMemberRequestSchema.parse(request.body);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');

    const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!targetUser) {
      throw new DomainError('NOT_FOUND', 'Usuário não encontrado');
    }

    const [existing] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, input.userId)))
      .limit(1);
    if (existing) {
      throw new DomainError('CONFLICT', 'Usuário já é membro');
    }

    const membership = first(
      await db
        .insert(memberships)
        .values({ orgId, userId: input.userId, role: input.role })
        .returning(),
    );

    await writeAudit(db, {
      orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.MEMBER_CREATED,
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      payload: { userId: input.userId, role: input.role },
    });

    return reply
      .status(201)
      .send(createMemberResponseSchema.parse({ membership: toMembershipDto(membership) }));
  });

  app.patch('/organizations/:orgId/members/:userId', async (request) => {
    const auth = requireAuth(request);
    const { orgId, userId } = z
      .object({ orgId: uuidSchema, userId: uuidSchema })
      .parse(request.params);
    const input = updateMemberRoleRequestSchema.parse(request.body);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
      .limit(1);
    if (!membership) {
      throw new DomainError('NOT_FOUND', 'Membro não encontrado');
    }
    // Guarda do último owner: ninguém rebaixa o último owner da org.
    if (
      membership.role === 'owner' &&
      input.role !== 'owner' &&
      (await countOwners(db, orgId)) <= 1
    ) {
      throw new DomainError('CONFLICT', 'Não é possível rebaixar o último owner');
    }

    const updated = first(
      await db
        .update(memberships)
        .set({ role: input.role as Role, updatedAt: new Date() })
        .where(eq(memberships.id, membership.id))
        .returning(),
    );

    await writeAudit(db, {
      orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      payload: { userId, role: input.role },
    });

    return updateMemberRoleResponseSchema.parse({ membership: toMembershipDto(updated) });
  });

  app.delete('/organizations/:orgId/members/:userId', async (request) => {
    const auth = requireAuth(request);
    const { orgId, userId } = z
      .object({ orgId: uuidSchema, userId: uuidSchema })
      .parse(request.params);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');

    if (auth.userId === userId) {
      throw new DomainError('CONFLICT', 'Não é possível remover a si mesmo');
    }

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
      .limit(1);
    if (!membership) {
      throw new DomainError('NOT_FOUND', 'Membro não encontrado');
    }
    // Guarda do último owner: ninguém remove o último owner da org.
    if (membership.role === 'owner' && (await countOwners(db, orgId)) <= 1) {
      throw new DomainError('CONFLICT', 'Não é possível remover o último owner');
    }
    await db.delete(memberships).where(eq(memberships.id, membership.id));

    await writeAudit(db, {
      orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.MEMBER_REMOVED,
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      payload: { userId },
    });

    return removeMemberResponseSchema.parse({ ok: true });
  });
  return Promise.resolve();
};
