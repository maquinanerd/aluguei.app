import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  leads,
  parties,
  partyConsents,
  properties,
  proposals,
  rentalApplications,
  screeningRequests,
  screeningResults,
  webhookInbox,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
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
import { assertOwnedByOrg, first } from './helpers.js';

type AppRow = typeof rentalApplications.$inferSelect;
type AppPatch = Partial<typeof rentalApplications.$inferInsert>;

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
    decisionSource: row.decisionSource,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function applicationStatusOf(row: AppRow): RentalApplicationStatus {
  if (!isRentalApplicationStatus(row.status)) {
    throw new Error(`status de candidatura inválido: ${row.status}`);
  }
  return row.status;
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
    .where(
      and(eq(screeningResults.applicationId, applicationId), eq(screeningResults.orgId, orgId)),
    )
    .orderBy(desc(screeningResults.createdAt))
    .limit(1);
  // P0-05: consentimento LGPD sempre filtrado pela org (nunca o de outra org).
  const consent = await findActiveConsent(db, orgId, application.partyId);
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

/** Resultado de screening mais recente da candidatura (a análise que embasa a decisão). */
async function latestScreeningResultId(
  db: AppDb,
  orgId: string,
  applicationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: screeningResults.id })
    .from(screeningResults)
    .where(
      and(eq(screeningResults.applicationId, applicationId), eq(screeningResults.orgId, orgId)),
    )
    .orderBy(desc(screeningResults.createdAt))
    .limit(1);
  return row?.id ?? null;
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
      // P0-05: pessoa/imóvel/lead/proposta precisam ser da própria organização.
      await assertOwnedByOrg(db, parties, input.partyId, auth.orgId, 'Parte não encontrada');
      await assertOwnedByOrg(db, properties, input.propertyId, auth.orgId, 'Imóvel não encontrado');
      await assertOwnedByOrg(db, leads, input.leadId, auth.orgId, 'Lead não encontrado');
      await assertOwnedByOrg(
        db,
        proposals,
        input.proposalId,
        auth.orgId,
        'Proposta não encontrada',
      );
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
      // Aprovação/rejeição sem motivo não chega aqui: 400 na validação (P1-06).
      const input = updateRentalApplicationStatusRequestSchema.parse(request.body);
      const [application] = await db
        .select()
        .from(rentalApplications)
        .where(and(eq(rentalApplications.id, id), eq(rentalApplications.orgId, auth.orgId)))
        .limit(1);
      if (!application) {
        throw new DomainError('NOT_FOUND', 'Candidatura não encontrada');
      }
      const from = applicationStatusOf(application);
      const to = input.status;
      if (from === to) {
        // Idempotente: repetir o destino não reescreve a decisão registrada.
        return loadAggregate(db, auth.orgId, application.id);
      }

      const [consent, screeningResultId] = await Promise.all([
        findActiveConsent(db, auth.orgId, application.partyId),
        latestScreeningResultId(db, auth.orgId, application.id),
      ]);
      // P1-06: o PATCH é a origem MANUAL. Não inicia a análise (só o pedido de
      // screening), não decide candidatura em SCREENING (só o resultado) e não
      // leva à contratação (só o contrato). Decide apenas a revisão manual.
      transitionRentalApplication(from, to, {
        source: 'MANUAL',
        hasConsent: consent !== null,
        hasRequiredData: true, // propertyId e partyId são NOT NULL no schema
        hasDecisionReason: Boolean(input.decisionReason),
        hasDecidedBy: true, // usuário autenticado
        hasScreeningResult: screeningResultId !== null,
        hasContract: false,
      });

      const now = new Date();
      const patch: AppPatch = { status: to, updatedAt: now };
      if (to === 'SUBMITTED') {
        patch.submittedAt = now;
      }
      const decided = to === 'APPROVED' || to === 'REJECTED';
      if (decided) {
        patch.decisionReason = input.decisionReason ?? null;
        patch.decisionSource = 'MANUAL';
        patch.decidedBy = auth.userId;
        patch.decidedAt = now;
      }
      // Compare-and-set: outra operação concorrente não é sobrescrita.
      const [updated] = await db
        .update(rentalApplications)
        .set(patch)
        .where(
          and(
            eq(rentalApplications.id, application.id),
            eq(rentalApplications.orgId, auth.orgId),
            eq(rentalApplications.status, from),
          ),
        )
        .returning({ id: rentalApplications.id });
      if (!updated) {
        throw new DomainError(
          'CONFLICT',
          'Candidatura alterada por outra operação; recarregue e tente novamente',
        );
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.RENTAL_APPLICATION_DECIDED,
        entityType: 'RENTAL_APPLICATION',
        entityId: application.id,
        payload: {
          from,
          to,
          source: 'MANUAL',
          ...(decided && screeningResultId ? { screeningResultId } : {}),
        },
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
      const from = applicationStatusOf(application);
      if (from === 'DRAFT') {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Submeta a candidatura antes de solicitar screening',
        );
      }
      if (from === 'SCREENING') {
        // Idempotente: análise já em andamento devolve o pedido pendente.
        const [pending] = await db
          .select({ id: screeningRequests.id })
          .from(screeningRequests)
          .where(
            and(
              eq(screeningRequests.applicationId, application.id),
              eq(screeningRequests.orgId, auth.orgId),
              eq(screeningRequests.status, 'PENDING'),
            ),
          )
          .orderBy(desc(screeningRequests.requestedAt))
          .limit(1);
        if (pending) {
          return reply.status(202).send({ requestId: pending.id, status: 'SCREENING' as const });
        }
      }
      // P1-06: esta é a única origem de SCREENING — e sempre com pedido gravado.
      transitionRentalApplication(from, 'SCREENING', {
        source: 'SCREENING_REQUEST',
        hasConsent: true,
        hasRequiredData: true,
        hasDecisionReason: false,
        hasDecidedBy: false,
        hasScreeningResult: false,
        hasContract: false,
      });

      const provider = input.provider ?? 'FAKE';
      const requestRow = await db.transaction(async (tx) => {
        const [moved] = await tx
          .update(rentalApplications)
          .set({ status: 'SCREENING', updatedAt: new Date() })
          .where(
            and(
              eq(rentalApplications.id, application.id),
              eq(rentalApplications.orgId, auth.orgId),
              eq(rentalApplications.status, from),
            ),
          )
          .returning({ id: rentalApplications.id });
        if (!moved) {
          throw new DomainError(
            'CONFLICT',
            'Candidatura alterada por outra operação; recarregue e tente novamente',
          );
        }
        const created = first(
          await tx
            .insert(screeningRequests)
            .values({
              orgId: auth.orgId,
              applicationId: application.id,
              partyId: application.partyId,
              provider,
              purpose: 'CREDIT_SCREENING',
              consentId: consent.id,
            })
            .returning(),
        );
        // Um job por pedido: um novo pedido nunca é descartado pelo dedup do inbox.
        await tx
          .insert(webhookInbox)
          .values({
            orgId: auth.orgId,
            provider: 'SCREENING',
            providerEventId: `${auth.orgId}:${application.id}:SCREENING:${created.id}`,
            payload: { screeningRequestId: created.id },
          })
          .onConflictDoNothing();
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.SCREENING_REQUESTED,
          entityType: 'RENTAL_APPLICATION',
          entityId: application.id,
          payload: { provider, from, to: 'SCREENING', screeningRequestId: created.id },
        });
        return created;
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
      await assertOwnedByOrg(db, parties, partyId, auth.orgId, 'Parte não encontrada');
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
      // P0-05: consentimento de pessoa de outra org nunca é listado (404).
      await assertOwnedByOrg(db, parties, partyId, auth.orgId, 'Parte não encontrada');
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
