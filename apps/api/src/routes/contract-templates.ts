import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { contractTemplates } from '@aluguei/db';

import { AUDIT_ACTIONS, DomainError } from '@aluguei/domain';
import {
  approveContractTemplateResponseSchema,
  contractTemplateSchema,
  createContractTemplateRequestSchema,
  createContractTemplateVersionRequestSchema,
  listContractTemplatesQuerySchema,
  listContractTemplatesResponseSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type TemplateRow = typeof contractTemplates.$inferSelect;

function toTemplateDto(row: TemplateRow): unknown {
  return contractTemplateSchema.parse({
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    version: row.version,
    status: row.status,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export const contractTemplateRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/contract-templates',
    { onRequest: [requirePermission('contract:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createContractTemplateRequestSchema.parse(request.body);
      const template = first(
        await db
          .insert(contractTemplates)
          .values({ orgId: auth.orgId, name: input.name, version: 1, body: input.body })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_TEMPLATE_CREATED,
        entityType: 'CONTRACT_TEMPLATE',
        entityId: template.id,
      });
      return reply.status(201).send({ template: toTemplateDto(template) });
    },
  );

  app.get(
    '/contract-templates',
    { onRequest: [requirePermission('contract:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listContractTemplatesQuerySchema.parse(request.query);
      const where = and(
        eq(contractTemplates.orgId, auth.orgId),
        query.status ? eq(contractTemplates.status, query.status) : undefined,
        query.name ? eq(contractTemplates.name, query.name) : undefined,
      );
      const rows = await db
        .select()
        .from(contractTemplates)
        .where(where)
        .orderBy(desc(contractTemplates.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return listContractTemplatesResponseSchema.parse({
        templates: rows.map((row) => toTemplateDto(row)),
        total: rows.length,
      });
    },
  );

  app.patch(
    '/contract-templates/:id/approve',
    { onRequest: [requirePermission('contract:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(and(eq(contractTemplates.id, id), eq(contractTemplates.orgId, auth.orgId)))
        .limit(1);
      if (!template) {
        throw new DomainError('NOT_FOUND', 'Template não encontrado');
      }
      if (template.status === 'APPROVED') {
        return approveContractTemplateResponseSchema.parse({ template: toTemplateDto(template) });
      }
      const updated = first(
        await db
          .update(contractTemplates)
          .set({
            status: 'APPROVED',
            approvedBy: auth.userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contractTemplates.id, template.id))
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_TEMPLATE_APPROVED,
        entityType: 'CONTRACT_TEMPLATE',
        entityId: template.id,
      });
      return approveContractTemplateResponseSchema.parse({ template: toTemplateDto(updated) });
    },
  );

  app.post(
    '/contract-templates/:id/versions',
    { onRequest: [requirePermission('contract:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createContractTemplateVersionRequestSchema.parse(request.body);
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(and(eq(contractTemplates.id, id), eq(contractTemplates.orgId, auth.orgId)))
        .limit(1);
      if (!template) {
        throw new DomainError('NOT_FOUND', 'Template não encontrado');
      }
      const version = first(
        await db
          .insert(contractTemplates)
          .values({
            orgId: auth.orgId,
            name: template.name,
            version: template.version + 1,
            body: input.body,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONTRACT_TEMPLATE_VERSIONED,
        entityType: 'CONTRACT_TEMPLATE',
        entityId: version.id,
      });
      return reply.status(201).send({ template: toTemplateDto(version) });
    },
  );

  return Promise.resolve();
};
