import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  charges,
  contracts,
  leases,
  parties,
  propertyFinancialTerms,
  propertyOwners,
  rentalApplications,
  splitRules,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, transitionLease } from '@aluguei/domain';
import {
  chargeSchema,
  createLeaseRequestSchema,
  leaseAggregateSchema,
  leaseSchema,
  listLeasesQuerySchema,
  listLeasesResponseSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type LeaseRow = typeof leases.$inferSelect;

function toLeaseDto(row: LeaseRow): unknown {
  return leaseSchema.parse({
    id: row.id,
    orgId: row.orgId,
    contractId: row.contractId,
    tenantPartyId: row.tenantPartyId,
    landlordPartyId: row.landlordPartyId,
    propertyId: row.propertyId,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    monthlyRentCents: row.monthlyRentCents,
    condoFeeCents: row.condoFeeCents,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function loadLeaseAggregate(
  db: AppDb,
  orgId: string,
  leaseId: string,
): Promise<unknown> {
  const [lease] = await db
    .select()
    .from(leases)
    .where(and(eq(leases.id, leaseId), eq(leases.orgId, orgId)))
    .limit(1);
  if (!lease) {
    throw new DomainError('NOT_FOUND', 'Locação não encontrada');
  }
  const [leaseCharges, splitRule] = await Promise.all([
    db.select().from(charges).where(eq(charges.leaseId, leaseId)).orderBy(desc(charges.dueDate)),
    db.select().from(splitRules).where(eq(splitRules.leaseId, leaseId)).limit(1),
  ]);
  return leaseAggregateSchema.parse({
    lease: toLeaseDto(lease),
    charges: leaseCharges.map((row) =>
      chargeSchema.parse({
        id: row.id,
        orgId: row.orgId,
        leaseId: row.leaseId,
        periodStart: row.periodStart,
        dueDate: row.dueDate,
        status: row.status,
        amountCents: row.amountCents,
        rentCents: row.rentCents,
        condoFeeCents: row.condoFeeCents,
        lateFeeCents: row.lateFeeCents,
        interestCents: row.interestCents,
        taxesCents: row.taxesCents,
        discountCents: row.discountCents,
        paidAt: row.paidAt?.toISOString() ?? null,
        providerChargeId: row.providerChargeId,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
    splitRule: splitRule[0]
      ? {
          agencyShareBps: splitRule[0].agencyShareBps,
          landlordShareBps: splitRule[0].landlordShareBps,
        }
      : null,
  });
}

export const leaseRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/leases',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createLeaseRequestSchema.parse(request.body);
      const [contract] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, input.contractId), eq(contracts.orgId, auth.orgId)))
        .limit(1);
      if (!contract) {
        throw new DomainError('NOT_FOUND', 'Contrato não encontrado');
      }
      if (contract.status !== 'SIGNED') {
        throw new DomainError('INVALID_TRANSITION', 'Locação exige contrato assinado');
      }
      const [application] = contract.applicationId
        ? await db
            .select()
            .from(rentalApplications)
            .where(eq(rentalApplications.id, contract.applicationId))
            .limit(1)
        : [undefined];
      const propertyId = application?.propertyId ?? '';
      if (!propertyId) {
        throw new DomainError('INVALID_INPUT', 'Contrato sem imóvel associado');
      }
      const [tenant] = application
        ? await db.select().from(parties).where(eq(parties.id, application.partyId)).limit(1)
        : [undefined];
      const [landlordOwner] = await db
        .select()
        .from(propertyOwners)
        .where(eq(propertyOwners.propertyId, propertyId))
        .limit(1);
      const [terms] = await db
        .select()
        .from(propertyFinancialTerms)
        .where(eq(propertyFinancialTerms.propertyId, propertyId))
        .limit(1);

      const lease = first(
        await db
          .insert(leases)
          .values({
            orgId: auth.orgId,
            contractId: contract.id,
            tenantPartyId: tenant?.id ?? null,
            landlordPartyId: landlordOwner?.partyId ?? null,
            propertyId,
            status: 'ACTIVE',
            startDate: new Date().toISOString().slice(0, 10),
            monthlyRentCents: terms?.monthlyRentCents ?? 0,
            condoFeeCents: terms?.condoFeeCents ?? null,
          })
          .returning(),
      );
      transitionLease('PENDING', 'ACTIVE');
      await db.insert(splitRules).values({
        orgId: auth.orgId,
        leaseId: lease.id,
        landlordPartyId: landlordOwner?.partyId ?? null,
        agencyShareBps: 1000,
        landlordShareBps: 9000,
      });
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.LEASE_CREATED,
        entityType: 'LEASE',
        entityId: lease.id,
      });
      return reply.status(201).send({ lease: toLeaseDto(lease) });
    },
  );

  app.get('/leases', { onRequest: [requirePermission('finance:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listLeasesQuerySchema.parse(request.query);
    const where = and(
      eq(leases.orgId, auth.orgId),
      query.status ? eq(leases.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(leases)
      .where(where)
      .orderBy(desc(leases.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return listLeasesResponseSchema.parse({
      leases: rows.map((row) => toLeaseDto(row)),
      total: rows.length,
    });
  });

  app.get('/leases/:id', { onRequest: [requirePermission('finance:read')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    return loadLeaseAggregate(db, auth.orgId, id);
  });

  return Promise.resolve();
};
