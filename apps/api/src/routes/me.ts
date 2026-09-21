import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { memberships, users } from '@aluguei/db';
import { listMyMembershipsResponseSchema, meMembersResponseSchema } from '@aluguei/contracts';
import { requireAuth, requireSession } from '../plugins/authz.js';
import { toMembershipDto } from './helpers.js';

export const meRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/me/memberships', async (request) => {
    const session = requireSession(request);
    const rows = await db.select().from(memberships).where(eq(memberships.userId, session.userId));
    return listMyMembershipsResponseSchema.parse({
      memberships: rows.map(toMembershipDto),
    });
  });

  /**
   * Equipe da organização ativa, para escolher o responsável de um lead (auditoria 2026-09-10,
   * P2-03). Qualquer membro vê nome e função dos colegas — sem e-mail: a gestão da equipe, com
   * contato, continua em `/organizations/:orgId/members` (`member:read`).
   */
  app.get('/me/members', async (request) => {
    const auth = requireAuth(request);
    const rows = await db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        name: users.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, auth.orgId))
      .orderBy(asc(users.name));
    return meMembersResponseSchema.parse({ members: rows });
  });
  return Promise.resolve();
};
