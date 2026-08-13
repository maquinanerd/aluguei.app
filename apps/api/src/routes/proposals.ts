import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { proposals } from '@aluguei/db';
import { AUDIT_ACTIONS } from '@aluguei/domain';
import {
  createProposalRequestSchema,
  createProposalResponseSchema,
  listProposalsQuerySchema,
  listProposalsResponseSchema,
  proposalSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

function toProposalDto(row: typeof proposals.$inferSelect): unknown {
  return proposalSchema.parse({
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    partyId: row.partyId,
    propertyId: row.propertyId,
    status: row.status,
    monthlyRentCents: row.monthlyRentCents,
    terms: row.terms,
    validUntil: row.validUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export const proposalRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/proposals',
    { onRequest: [requirePermission('proposal:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createProposalRequestSchema.parse(request.body);

      const proposal = first(
        await db
          .insert(proposals)
          .values({
            orgId: auth.orgId,
            leadId: input.leadId ?? null,
            partyId: input.partyId ?? null,
            propertyId: input.propertyId ?? null,
            monthlyRentCents: input.monthlyRentCents,
            terms: input.terms ?? null,
            validUntil: input.validUntil ? new Date(input.validUntil) : null,
            createdBy: auth.userId,
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PROPOSAL_CREATED,
        entityType: 'PROPOSAL',
        entityId: proposal.id,
        payload: { monthlyRentCents: input.monthlyRentCents },
      });

      return reply
        .status(201)
        .send(createProposalResponseSchema.parse({ proposal: toProposalDto(proposal) }));
    },
  );

  app.get('/proposals', { onRequest: [requirePermission('proposal:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listProposalsQuerySchema.parse(request.query);
    const where = and(
      eq(proposals.orgId, auth.orgId),
      query.status ? eq(proposals.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(proposals)
      .where(where)
      .orderBy(desc(proposals.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return listProposalsResponseSchema.parse({
      proposals: rows.map((row) => toProposalDto(row)),
      total: rows.length,
    });
  });
  return Promise.resolve();
};
