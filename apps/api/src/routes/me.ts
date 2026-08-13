import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { memberships } from '@aluguei/db';
import { listMyMembershipsResponseSchema } from '@aluguei/contracts';
import { requireAuth } from '../plugins/authz.js';
import { toMembershipDto } from './helpers.js';

export const meRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/me/memberships', async (request) => {
    const auth = requireAuth(request);
    const rows = await db.select().from(memberships).where(eq(memberships.userId, auth.userId));
    return listMyMembershipsResponseSchema.parse({
      memberships: rows.map(toMembershipDto),
    });
  });
  return Promise.resolve();
};
