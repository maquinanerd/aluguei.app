import { and, asc, desc, eq, gt, inArray, notExists } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  charges,
  contracts,
  leaseAmendments,
  leaseLandlords,
  leases,
  parties,
  payments,
  propertyFinancialTerms,
  propertyOwners,
  rentalApplications,
  splitRules,
} from '@aluguei/db';
import type { AppDb, DbExecutor } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  addDays,
  assertLateChargeTerms,
  assertReadjustmentWithinLease,
  assertRenewal,
  assertRentChangeAfterHistory,
  isChargeStatus,
  isLeaseStatus,
  landlordSharesFromOwners,
  monthStartOf,
  nextMonthStart,
  planLeaseEnd,
  readjustedRent,
  rentForPeriod,
  saoPauloDate,
  transitionCharge,
  transitionLease,
} from '@aluguei/domain';
import type { RentChange } from '@aluguei/domain';
import {
  chargeSchema,
  createLeaseRequestSchema,
  endLeaseRequestSchema,
  leaseAggregateSchema,
  leaseAmendmentSchema,
  leaseMutationResponseSchema,
  leaseSchema,
  listLeasesQuerySchema,
  listLeasesResponseSchema,
  readjustLeaseRequestSchema,
  renewLeaseRequestSchema,
  updateLeaseTermsRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { postChargeCancellation } from '../finance/settlement.js';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { assertPlanAllowsOneMore } from '../platform/usage.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type LeaseRow = typeof leases.$inferSelect;
type AmendmentRow = typeof leaseAmendments.$inferSelect;

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
    lateFeeBps: row.lateFeeBps,
    interestMonthlyBps: row.interestMonthlyBps,
    dueDay: row.dueDay,
    endReason: row.endReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toAmendmentDto(row: AmendmentRow): unknown {
  return leaseAmendmentSchema.parse({
    id: row.id,
    kind: row.kind,
    effectiveFrom: row.effectiveFrom,
    previousEndDate: row.previousEndDate,
    newEndDate: row.newEndDate,
    previousRentCents: row.previousRentCents,
    newRentCents: row.newRentCents,
    indexName: row.indexName,
    adjustmentBps: row.adjustmentBps,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  });
}

/** Mudanças de aluguel registradas na locação, para o aluguel de cada período (P1-20). */
export async function rentChangesFor(db: DbExecutor, leaseId: string): Promise<RentChange[]> {
  const rows = await db
    .select({
      effectiveFrom: leaseAmendments.effectiveFrom,
      previousRentCents: leaseAmendments.previousRentCents,
      newRentCents: leaseAmendments.newRentCents,
    })
    .from(leaseAmendments)
    .where(eq(leaseAmendments.leaseId, leaseId))
    .orderBy(asc(leaseAmendments.createdAt));
  return rows.flatMap((row) =>
    row.effectiveFrom !== null && row.previousRentCents !== null && row.newRentCents !== null
      ? [
          {
            effectiveFrom: row.effectiveFrom,
            previousRentCents: row.previousRentCents,
            newRentCents: row.newRentCents,
          },
        ]
      : [],
  );
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
  const [leaseCharges, splitRule, landlords, amendments] = await Promise.all([
    db.select().from(charges).where(eq(charges.leaseId, leaseId)).orderBy(desc(charges.dueDate)),
    db.select().from(splitRules).where(eq(splitRules.leaseId, leaseId)).limit(1),
    db
      .select({ partyId: leaseLandlords.partyId, shareBps: leaseLandlords.shareBps })
      .from(leaseLandlords)
      .where(eq(leaseLandlords.leaseId, leaseId))
      .orderBy(desc(leaseLandlords.shareBps), asc(leaseLandlords.createdAt)),
    db
      .select()
      .from(leaseAmendments)
      .where(eq(leaseAmendments.leaseId, leaseId))
      .orderBy(desc(leaseAmendments.createdAt)),
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
    landlords,
    amendments: amendments.map((row) => toAmendmentDto(row)),
  });
}

/** Locação da organização travada para a mudança (P1-20: renovação e encerramento não se cruzam). */
async function lockLease(tx: DbExecutor, orgId: string, leaseId: string): Promise<LeaseRow> {
  const [lease] = await tx
    .select()
    .from(leases)
    .where(and(eq(leases.id, leaseId), eq(leases.orgId, orgId)))
    .for('update');
  if (!lease) {
    throw new DomainError('NOT_FOUND', 'Locação não encontrada');
  }
  return lease;
}

/**
 * Aluguel em vigor depois de uma mudança registrada: quando ela já começou (neste mês ou antes),
 * a locação passa a mostrar o novo valor sem esperar a varredura diária.
 */
async function applyCurrentRent(
  tx: DbExecutor,
  lease: LeaseRow,
  effectiveFrom: string | null,
): Promise<LeaseRow> {
  const currentMonth = monthStartOf(saoPauloDate(new Date()));
  if (effectiveFrom === null || effectiveFrom > currentMonth) {
    return lease;
  }
  return first(
    await tx
      .update(leases)
      .set({
        monthlyRentCents: rentForPeriod(
          lease.monthlyRentCents,
          await rentChangesFor(tx, lease.id),
          currentMonth,
        ),
        updatedAt: new Date(),
      })
      .where(eq(leases.id, lease.id))
      .returning(),
  );
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
      // P0-05 (defesa em profundidade): toda leitura derivada é filtrada pela org.
      const [application] = contract.applicationId
        ? await db
            .select()
            .from(rentalApplications)
            .where(
              and(
                eq(rentalApplications.id, contract.applicationId),
                eq(rentalApplications.orgId, auth.orgId),
              ),
            )
            .limit(1)
        : [undefined];
      const propertyId = application?.propertyId ?? '';
      if (!propertyId) {
        throw new DomainError('INVALID_INPUT', 'Contrato sem imóvel associado');
      }
      const [tenant] = application
        ? await db
            .select()
            .from(parties)
            .where(and(eq(parties.id, application.partyId), eq(parties.orgId, auth.orgId)))
            .limit(1)
        : [undefined];
      const owners = await db
        .select({
          partyId: propertyOwners.partyId,
          ownershipSharePct: propertyOwners.ownershipSharePct,
        })
        .from(propertyOwners)
        .where(and(eq(propertyOwners.propertyId, propertyId), eq(propertyOwners.orgId, auth.orgId)))
        .orderBy(asc(propertyOwners.createdAt));
      // Coproprietários com participação faltando ou soma diferente de 100% barram a locação (P1-08).
      const shares = landlordSharesFromOwners(owners);
      const principal = [...shares].sort((a, b) => b.shareBps - a.shareBps)[0] ?? null;
      const [terms] = await db
        .select()
        .from(propertyFinancialTerms)
        .where(
          and(
            eq(propertyFinancialTerms.propertyId, propertyId),
            eq(propertyFinancialTerms.orgId, auth.orgId),
          ),
        )
        .limit(1);

      transitionLease('PENDING', 'ACTIVE');
      const lease = await db.transaction(async (tx) => {
        // Limite de locações em vigor do plano: 409 PLAN_LIMIT_REACHED antes de escrever.
        await assertPlanAllowsOneMore(tx, auth.orgId, 'activeLeases');
        const created = first(
          await tx
            .insert(leases)
            .values({
              orgId: auth.orgId,
              contractId: contract.id,
              tenantPartyId: tenant?.id ?? null,
              landlordPartyId: principal?.partyId ?? null,
              propertyId,
              status: 'ACTIVE',
              startDate: saoPauloDate(new Date()),
              monthlyRentCents: terms?.monthlyRentCents ?? 0,
              condoFeeCents: terms?.condoFeeCents ?? null,
            })
            .returning(),
        );
        if (shares.length > 0) {
          await tx.insert(leaseLandlords).values(
            shares.map((share) => ({
              orgId: auth.orgId,
              leaseId: created.id,
              partyId: share.partyId,
              shareBps: share.shareBps,
            })),
          );
        }
        await tx.insert(splitRules).values({
          orgId: auth.orgId,
          leaseId: created.id,
          landlordPartyId: principal?.partyId ?? null,
          agencyShareBps: 1000,
          landlordShareBps: 9000,
        });
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.LEASE_CREATED,
          entityType: 'LEASE',
          entityId: created.id,
          payload: { landlords: shares },
        });
        return created;
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

  // Multa, juros e dia de vencimento (auditoria 2026-09-10, P1-07).
  app.patch(
    '/leases/:id/terms',
    { onRequest: [requirePermission('finance:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateLeaseTermsRequestSchema.parse(request.body);
      const updated = await db.transaction(async (tx) => {
        const lease = await lockLease(tx, auth.orgId, id);
        const next = {
          lateFeeBps: input.lateFeeBps ?? lease.lateFeeBps,
          interestMonthlyBps: input.interestMonthlyBps ?? lease.interestMonthlyBps,
          dueDay: input.dueDay ?? lease.dueDay,
        };
        assertLateChargeTerms(next);
        const changes: Record<string, { from: number; to: number }> = {};
        for (const key of ['lateFeeBps', 'interestMonthlyBps', 'dueDay'] as const) {
          if (next[key] !== lease[key]) {
            changes[key] = { from: lease[key], to: next[key] };
          }
        }
        if (Object.keys(changes).length === 0) {
          return lease;
        }
        const row = first(
          await tx
            .update(leases)
            .set({ ...next, updatedAt: new Date() })
            .where(eq(leases.id, lease.id))
            .returning(),
        );
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.LEASE_TERMS_UPDATED,
          entityType: 'LEASE',
          entityId: lease.id,
          payload: { changes },
        });
        return row;
      });
      return { lease: toLeaseDto(updated) };
    },
  );

  // Renovação: novo término e, opcionalmente, aluguel novo a partir do mês seguinte (P1-20).
  app.post(
    '/leases/:id/renew',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = renewLeaseRequestSchema.parse(request.body);
      const result = await db.transaction(async (tx) => {
        const lease = await lockLease(tx, auth.orgId, id);
        assertRenewal({
          status: lease.status,
          startDate: lease.startDate,
          endDate: lease.endDate,
          newEndDate: input.endDate,
        });
        let effectiveFrom: string | null = null;
        let previousRentCents: number | null = null;
        let newRentCents: number | null = null;
        if (input.monthlyRentCents !== undefined) {
          const today = saoPauloDate(new Date());
          effectiveFrom = lease.endDate
            ? monthStartOf(addDays(lease.endDate, 1))
            : nextMonthStart(today);
          const changes = await rentChangesFor(tx, lease.id);
          assertRentChangeAfterHistory(changes, effectiveFrom);
          previousRentCents = rentForPeriod(lease.monthlyRentCents, changes, effectiveFrom);
          newRentCents = input.monthlyRentCents;
        }
        const amendment = first(
          await tx
            .insert(leaseAmendments)
            .values({
              orgId: auth.orgId,
              leaseId: lease.id,
              kind: 'RENEWAL',
              effectiveFrom,
              previousEndDate: lease.endDate,
              newEndDate: input.endDate,
              previousRentCents,
              newRentCents,
              createdBy: auth.userId,
            })
            .returning(),
        );
        const extended = first(
          await tx
            .update(leases)
            .set({ endDate: input.endDate, updatedAt: new Date() })
            .where(eq(leases.id, lease.id))
            .returning(),
        );
        const row = await applyCurrentRent(tx, extended, effectiveFrom);
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.LEASE_RENEWED,
          entityType: 'LEASE',
          entityId: lease.id,
          payload: {
            previousEndDate: lease.endDate,
            newEndDate: input.endDate,
            effectiveFrom,
            previousRentCents,
            newRentCents,
          },
        });
        return { lease: row, amendment };
      });
      return reply.status(201).send(
        leaseMutationResponseSchema.parse({
          lease: toLeaseDto(result.lease),
          amendment: toAmendmentDto(result.amendment),
        }),
      );
    },
  );

  // Reajuste por índice ou por valor, a partir do primeiro dia de um mês (P1-20).
  app.post(
    '/leases/:id/readjust',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = readjustLeaseRequestSchema.parse(request.body);
      const result = await db.transaction(async (tx) => {
        const lease = await lockLease(tx, auth.orgId, id);
        if (lease.status === 'ENDED' || lease.status === 'PENDING') {
          throw new DomainError('INVALID_TRANSITION', 'Só locação em vigor pode ser reajustada', {
            status: lease.status,
          });
        }
        assertReadjustmentWithinLease({
          startDate: lease.startDate,
          endDate: lease.endDate,
          effectiveFrom: input.effectiveFrom,
        });
        const changes = await rentChangesFor(tx, lease.id);
        assertRentChangeAfterHistory(changes, input.effectiveFrom);
        const previousRentCents = rentForPeriod(
          lease.monthlyRentCents,
          changes,
          input.effectiveFrom,
        );
        const newRentCents =
          input.adjustmentBps !== undefined
            ? readjustedRent(previousRentCents, input.adjustmentBps)
            : (input.newMonthlyRentCents ?? previousRentCents);
        const amendment = first(
          await tx
            .insert(leaseAmendments)
            .values({
              orgId: auth.orgId,
              leaseId: lease.id,
              kind: 'READJUSTMENT',
              effectiveFrom: input.effectiveFrom,
              previousRentCents,
              newRentCents,
              indexName: input.indexName,
              adjustmentBps: input.adjustmentBps ?? null,
              createdBy: auth.userId,
            })
            .returning(),
        );
        const row = await applyCurrentRent(tx, lease, input.effectiveFrom);
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.LEASE_READJUSTED,
          entityType: 'LEASE',
          entityId: lease.id,
          payload: {
            effectiveFrom: input.effectiveFrom,
            indexName: input.indexName,
            adjustmentBps: input.adjustmentBps ?? null,
            previousRentCents,
            newRentCents,
          },
        });
        return { lease: row, amendment };
      });
      return reply.status(201).send(
        leaseMutationResponseSchema.parse({
          lease: toLeaseDto(result.lease),
          amendment: toAmendmentDto(result.amendment),
        }),
      );
    },
  );

  // Encerramento: TERMINATING até a data de fim; ENDED quando ela já passou (P1-20).
  app.post(
    '/leases/:id/end',
    { onRequest: [requirePermission('finance:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = endLeaseRequestSchema.parse(request.body);
      const result = await db.transaction(async (tx) => {
        const lease = await lockLease(tx, auth.orgId, id);
        if (!isLeaseStatus(lease.status)) {
          throw new Error(`status de locação inválido: ${lease.status}`);
        }
        if (input.endDate < lease.startDate) {
          throw new DomainError('INVALID_INPUT', 'O término não pode ser antes do início', {
            startDate: lease.startDate,
          });
        }
        const plan = planLeaseEnd({
          status: lease.status,
          endDate: input.endDate,
          today: saoPauloDate(new Date()),
        });
        let status = lease.status;
        for (const next of plan) {
          status = transitionLease(status, next);
        }

        // Cobranças agendadas ou já abertas de meses depois do término, sem tentativa de
        // pagamento, saem. Vencidas e com pagamento ficam para a equipe resolver.
        const afterEnd = await tx
          .select()
          .from(charges)
          .where(
            and(
              eq(charges.leaseId, lease.id),
              inArray(charges.status, ['SCHEDULED', 'OPEN']),
              gt(charges.periodStart, monthStartOf(input.endDate)),
              notExists(
                tx
                  .select({ id: payments.id })
                  .from(payments)
                  .where(eq(payments.chargeId, charges.id)),
              ),
            ),
          )
          .for('update');
        for (const charge of afterEnd) {
          if (!isChargeStatus(charge.status)) {
            throw new Error(`status de cobrança inválido: ${charge.status}`);
          }
          transitionCharge(charge.status, 'CANCELLED');
          await tx
            .update(charges)
            .set({ status: 'CANCELLED', updatedAt: new Date() })
            .where(and(eq(charges.id, charge.id), eq(charges.status, charge.status)));
          await postChargeCancellation(tx, charge);
          await writeAudit(tx, {
            orgId: auth.orgId,
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS.CHARGE_CANCELLED,
            entityType: 'CHARGE',
            entityId: charge.id,
            payload: { reason: 'lease_end', leaseId: lease.id },
          });
        }

        const amendment = first(
          await tx
            .insert(leaseAmendments)
            .values({
              orgId: auth.orgId,
              leaseId: lease.id,
              kind: 'TERMINATION',
              previousEndDate: lease.endDate,
              newEndDate: input.endDate,
              reason: input.reason,
              createdBy: auth.userId,
            })
            .returning(),
        );
        const row = first(
          await tx
            .update(leases)
            .set({ status, endDate: input.endDate, endReason: input.reason, updatedAt: new Date() })
            .where(eq(leases.id, lease.id))
            .returning(),
        );
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action:
            status === 'ENDED'
              ? AUDIT_ACTIONS.LEASE_ENDED
              : AUDIT_ACTIONS.LEASE_TERMINATION_REQUESTED,
          entityType: 'LEASE',
          entityId: lease.id,
          payload: {
            previousStatus: lease.status,
            status,
            endDate: input.endDate,
            cancelledCharges: afterEnd.map((charge) => charge.id),
          },
        });
        return { lease: row, amendment };
      });
      return leaseMutationResponseSchema.parse({
        lease: toLeaseDto(result.lease),
        amendment: toAmendmentDto(result.amendment),
      });
    },
  );

  return Promise.resolve();
};
