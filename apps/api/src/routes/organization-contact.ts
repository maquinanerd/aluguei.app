import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { channelConnections, organizations } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError } from '@aluguei/domain';
import {
  organizationContactResponseSchema,
  updateOrganizationContactRequestSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { enqueueChannelJob } from './channel-jobs.js';

/**
 * Contato público da imobiliária (ADR-107): o e-mail que vai no `ContactInfo` de cada anúncio do
 * feed do Grupo OLX. É um campo próprio — nunca o e-mail de login de alguém da equipe.
 */
export const organizationContactRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get(
    '/organization/contact',
    { onRequest: [requirePermission('listing:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const [org] = await db
        .select({ publicContactEmail: organizations.publicContactEmail })
        .from(organizations)
        .where(eq(organizations.id, auth.orgId))
        .limit(1);
      if (!org) {
        throw new DomainError('NOT_FOUND', 'Imobiliária não encontrada');
      }
      return organizationContactResponseSchema.parse(org);
    },
  );

  app.put(
    '/organization/contact',
    { onRequest: [requirePermission('org:manage')] },
    async (request) => {
      const auth = requireAuth(request);
      const input = updateOrganizationContactRequestSchema.parse(request.body);
      const [org] = await db
        .update(organizations)
        .set({ publicContactEmail: input.publicContactEmail, updatedAt: new Date() })
        .where(eq(organizations.id, auth.orgId))
        .returning({ publicContactEmail: organizations.publicContactEmail });
      if (!org) {
        throw new DomainError('NOT_FOUND', 'Imobiliária não encontrada');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.ORG_CONTACT_UPDATED,
        entityType: 'ORGANIZATION',
        entityId: auth.orgId,
        payload: { hasPublicContactEmail: org.publicContactEmail !== null },
      });
      // O e-mail entra em todo anúncio do Grupo OLX: reavalia a imobiliária inteira no worker.
      const [connection] = await db
        .select({ id: channelConnections.id })
        .from(channelConnections)
        .where(
          and(eq(channelConnections.orgId, auth.orgId), eq(channelConnections.channel, 'grupoolx')),
        )
        .limit(1);
      if (connection) {
        await enqueueChannelJob(db, {
          orgId: auth.orgId,
          listingId: null,
          channel: 'grupoolx',
          jobType: 'RECONCILE',
        });
      }
      return organizationContactResponseSchema.parse(org);
    },
  );

  return Promise.resolve();
};
