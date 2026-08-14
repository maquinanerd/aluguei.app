import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  partyConsents,
  partyIdentities,
  rentalApplications,
  screeningRequests,
  screeningResults,
  webhookInbox,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  applicationTransitionIssues,
  canTransitionRentalApplication,
  isRentalApplicationStatus,
  transitionRentalApplication,
} from '@aluguei/domain';
import type { RentalApplicationStatus } from '@aluguei/domain';
import {
  consentSchema,
  createPartyConsentRequestSchema,
  createPartyConsentResponseSchema,
  createRentalApplicationRequestSchema,
  listPartyConsentsResponseSchema,
  listRentalApplicationsQuerySchema,
  rentalApplicationAggregateSchema,
  rentalApplicationSchema,
  requestScreeningRequestSchema,
  updateRentalApplicationStatusRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type AppRow = typeof rentalApplications.$inferSelect;

function toAppDto(row: AppRow): unknown {
  return rentalApplicationSchema.parse({
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    partyId: row.partyId,
    propertyId: row.propertyId,
    proposalId: row.proposalId,
    status: row.status,
    decisionReason: row.decisionReason,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function loadAggregate(db: AppDb, orgId: string, applicationId: string): Promise<unknown> {
  const [application] = await db
    .select()
    .from(rentalApplications)
    .where(and(eq(rentalApplications.id, applicationId), eq(rentalApplications.orgId, orgId)))
    .limit(1);
  if (!application) {
    throw new DomainError('NOT_FOUND', 'Candidatura não encontrada');
  }
  const [latestResult] = await db
    .select()
    .from(screeningResults)
    .where(eq(screeningResults.applicationId, applicationId))
    .orderBy(desc(screeningResults.createdAt))
    .limit(1);
  const [consent] = await db
    .select()
    .from(partyConsents)
    .where(
      and(
        eq(partyConsents.partyId, application.partyId),
        eq(partyConsents.purpose, 'CREDIT_SCREENING'),
        isNull(partyConsents.revokedAt),
      ),
    )
    .limit(1);
  return rentalApplicationAggregateSchema.parse({
    application: toAppDto(application),
    latestScreeningResult: latestResult
      ? {
          id: latestResult.id,
          provider: latestResult.provider,
          score: latestResult.score,
          decision: latestResult.decision,
          decisionRules: latestResult.decisionRules,
          createdAt: latestResult.createdAt.toISOString(),
        }
      : null,
    consent: consent
      ? {
          id: consent.id,
          partyId: consent.partyId,
          purpose: consent.purpose,
          grantedAt: consent.grantedAt.toISOString(),
          revokedAt: consent.revokedAt?.toISOString() ?? null,
        }
      : null,
  });
}

/** Consentimento LGPD obrigatório antes de screening. */
export async function findActiveConsent(db: AppDb, orgId: string, partyId: string) {
  const [consent] = await db
    .select()
    .from(partyConsents)
    .where(
      and(
        eq(partyConsents.orgId, orgId),
        eq(partyConsents.partyId, partyId),
        eq(partyConsents.purpose, 'CREDIT_SCREENING'),
        isNull(partyConsents.revokedAt),
      ),
    )
    .limit(1);
  return consent ?? null;
}

export const rentalApplicationRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/rental-applications',
    { onRequest: [requirePermission('screening:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createRentalApplicationRequestSchema.parse(request.body);
      const application = first(
        await db
          .insert(rentalApplications)
          .values({
            orgId: auth.orgId,
            leadId: input.leadId ?? null,
            partyId: input.partyId,
            propertyId: input.propertyId,
            proposalId: input.proposalId ?? null,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.RENTAL_APPLICATION_CREATED,
        entityType: 'RENTAL_APPLICATION',
        entityId: application.id,
      });
      return reply.status(201).send({ application: toAppDto(application) });
    },
  );

  app.get(
    '/rental-applications',
    { onRequest: [requirePermission('screening:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listRentalApplicationsQuerySchema.parse(request.query);
      const where = and(
        eq(rentalApplications.orgId, auth.orgId),
        query.status ? eq(rentalApplications.status, query.status) : undefined,
        query.leadId ? eq(rentalApplications.leadId, query.leadId) : undefined,
        query.propertyId ? eq(rentalApplications.propertyId, query.propertyId) : undefined,
      );
      const rows = await db
        .select()
        .from(rentalApplications)
        .where(where)
        .orderBy(desc(rentalApplications.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return {
        applications: rows.map((row) => toAppDto(row)),
        total: rows.length,
      };
    },
  );

  app.get(
    '/rental-applications/:id',
    { onRequest: [requirePermission('screening:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      return loadAggregate(db, auth.orgId, id);
    },
  );

  app.patch(
    '/rental-applications/:id/status',
    { onRequest: [requirePermission('screening:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateRentalApplicationStatusRequestSchema.parse(request.body);
      const [application] = await db
        .select()
        .from(rentalApplications)
        .where(and(eq(rentalApplications.id, id), eq(rentalApplications.orgId, auth.orgId)))
        .limit(1);
      if (!application) {
        throw new DomainError('NOT_FOUND', 'Candidatura não encontrada');
      }
      if (
        !isRentalApplicationStatus(application.status) ||
        !isRentalApplicationStatus(input.status)
      ) {
        throw new Error('status inválido');
      }

      const consent = await findActiveConsent(db, auth.orgId, application.partyId);
      const ctx = {
        hasConsent: consent !== null,
        hasRequiredData: true, // propertyId e partyId são NOT NULL no schema
        hasDecisionReason: Boolean(input.decisionReason),
        hasContract: false,
      };
      if (
        !canTransitionRentalApplication(
          application.status as RentalApplicationStatus,
          input.status as RentalApplicationStatus,
          ctx,
        )
      ) {
        const issues = applicationTransitionIssues(
          application.status as RentalApplicationStatus,
          input.status as RentalApplicationStatus,
          ctx,
        );
        throw new DomainError('INVALID_TRANSITION', `Transição inválida (${issues.join('; ')})`);
      }
      transitionRentalApplication(
        application.status as RentalApplicationStatus,
        input.status as RentalApplicationStatus,
        ctx,
      );

      const patch: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.status === 'SUBMITTED') {
        patch.submittedAt = new Date();
      }
      if ((input.status === 'APPROVED' || input.status === 'REJECTED') && input.decisionReason) {
        patch.decisionReason = input.decisionReason;
        patch.decidedBy = auth.userId;
        patch.decidedAt = new Date();
      }
      await db
        .update(rentalApplications)
        .set(patch as never)
        .where(eq(rentalApplications.id, application.id));
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.RENTAL_APPLICATION_DECIDED,
        entityType: 'RENTAL_APPLICATION',
        entityId: application.id,
        payload: { from: application.status, to: input.status },
      });
      return loadAggregate(db, auth.orgId, application.id);
    },
  );

  app.post(
    '/rental-applications/:id/screening',
    { onRequest: [requirePermission('screening:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = requestScreeningRequestSchema.parse(request.body);
      const [application] = await db
        .select()
        .from(rentalApplications)
        .where(and(eq(rentalApplications.id, id), eq(rentalApplications.orgId, auth.orgId)))
        .limit(1);
      if (!application) {
        throw new DomainError('NOT_FOUND', 'Candidatura não encontrada');
      }
      // Consentimento obrigatório (LGPD)
      const consent = await findActiveConsent(db, auth.orgId, application.partyId);
      if (!consent) {
        throw new DomainError('INVALID_INPUT', 'Consentimento LGPD de análise de crédito ausente');
      }
      if (application.status === 'DRAFT') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Submeta a candidatura antes de solicitar screening',
        );
      }

      const [requestRow] = await db
        .insert(screeningRequests)
        .values({
          orgId: auth.orgId,
          applicationId: application.id,
          partyId: application.partyId,
          provider: input.provider ?? 'FAKE',
          purpose: 'CREDIT_SCREENING',
          consentId: consent.id,
        })
        .returning();
      if (!requestRow) {
        throw new Error('screening request insert failed');
      }
      if (application.status === 'SUBMITTED') {
        await db
          .update(rentalApplications)
          .set({ status: 'SCREENING', updatedAt: new Date() })
          .where(eq(rentalApplications.id, application.id));
      }
      await db
        .insert(webhookInbox)
        .values({
          orgId: auth.orgId,
          provider: 'SCREENING',
          providerEventId: `${auth.orgId}:${application.id}:SCREENING`,
          payload: { screeningRequestId: requestRow.id },
        })
        .onConflictDoNothing();
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.SCREENING_REQUESTED,
        entityType: 'RENTAL_APPLICATION',
        entityId: application.id,
        payload: { provider: input.provider ?? 'FAKE' },
      });
      return reply.status(202).send({ requestId: requestRow.id, status: 'SCREENING' as const });
    },
  );

  // Consentimentos (party:write / party:read)
  app.post(
    '/parties/:partyId/consents',
    { onRequest: [requirePermission('party:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { partyId } = z.object({ partyId: uuidSchema }).parse(request.params);
      const input = createPartyConsentRequestSchema.parse(request.body);
      const [party] = await db
        .select()
        .from(partyIdentities)
        .where(and(eq(partyIdentities.partyId, partyId), eq(partyIdentities.orgId, auth.orgId)))
        .limit(1);
      if (!party) {
        throw new DomainError('NOT_FOUND', 'Parte não encontrada');
      }
      const existing = await findActiveConsent(db, auth.orgId, partyId);
      if (existing) {
        throw new DomainError('CONFLICT', 'Consentimento já ativo');
      }
      const consent = first(
        await db
          .insert(partyConsents)
          .values({ orgId: auth.orgId, partyId, purpose: input.purpose })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CONSENT_GRANTED,
        entityType: 'PARTY',
        entityId: partyId,
        payload: { purpose: input.purpose },
      });
      return reply.status(201).send(
        createPartyConsentResponseSchema.parse({
          consent: {
            id: consent.id,
            partyId: consent.partyId,
            purpose: consent.purpose,
            grantedAt: consent.grantedAt.toISOString(),
            revokedAt: consent.revokedAt?.toISOString() ?? null,
          },
        }),
      );
    },
  );

  app.get(
    '/parties/:partyId/consents',
    { onRequest: [requirePermission('party:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const { partyId } = z.object({ partyId: uuidSchema }).parse(request.params);
      const rows = await db
        .select()
        .from(partyConsents)
        .where(and(eq(partyConsents.orgId, auth.orgId), eq(partyConsents.partyId, partyId)));
      return listPartyConsentsResponseSchema.parse({
        consents: rows.map((row) =>
          consentSchema.parse({
            id: row.id,
            partyId: row.partyId,
            purpose: row.purpose,
            grantedAt: row.grantedAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
          }),
        ),
      });
    },
  );

  return Promise.resolve();
};
