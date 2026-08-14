import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { whatsappConnections } from '@aluguei/db';
import { DomainError } from '@aluguei/domain';
import {
  createWhatsAppConnectionRequestSchema,
  listWhatsAppConnectionsResponseSchema,
  whatsAppConnectionSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { first } from './helpers.js';

function toConnectionDto(row: typeof whatsappConnections.$inferSelect): unknown {
  return whatsAppConnectionSchema.parse({
    id: row.id,
    orgId: row.orgId,
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
}

export const whatsappConnectionRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get(
    '/whatsapp/connections',
    { onRequest: [requirePermission('org:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const rows = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.orgId, auth.orgId));
      return listWhatsAppConnectionsResponseSchema.parse({
        connections: rows.map((row) => toConnectionDto(row)),
      });
    },
  );

  app.post(
    '/whatsapp/connections',
    { onRequest: [requirePermission('org:manage')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createWhatsAppConnectionRequestSchema.parse(request.body);
      const [existing] = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.phoneNumberId, input.phoneNumberId))
        .limit(1);
      if (existing) {
        throw new DomainError('CONFLICT', 'Número já cadastrado em uma organização');
      }
      const connection = first(
        await db
          .insert(whatsappConnections)
          .values({
            orgId: auth.orgId,
            phoneNumberId: input.phoneNumberId,
            businessAccountId: input.businessAccountId ?? null,
          })
          .returning(),
      );
      return reply.status(201).send({ connection: toConnectionDto(connection) });
    },
  );

  return Promise.resolve();
};
