import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { charges, leases, payments } from '@aluguei/db';

import {
  AUDIT_ACTIONS,
  DomainError,
  calculateChargeBreakdown,
  isChargeStatus,
  isPaymentStatus,
  transitionCharge,
  transitionPayment,
} from '@aluguei/domain';
import type { ChargeStatus, PaymentStatus } from '@aluguei/domain';
import {
  chargeSchema,
  createChargeRequestSchema,
  createPaymentRequestSchema,
  listChargesQuerySchema,
  listChargesResponseSchema,
  paymentInitiationResponseSchema,
  refundResponseSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { postLedgerTransaction } from '../ledger.js';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type ChargeRow = typeof charges.$inferSelect;

export function toChargeDto(row: ChargeRow): unknown {
  return chargeSchema.parse({
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
  });
}

export const chargeRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/charges',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createChargeRequestSchema.parse(request.body);
      const [lease] = await db
        .select()
        .from(leases)
        .where(and(eq(leases.id, input.leaseId), eq(leases.orgId, auth.orgId)))
        .limit(1);
      if (!lease) {
        throw new DomainError('NOT_FOUND', 'Locação não encontrada');
      }
      const periodStart = input.periodStart ?? new Date().toISOString().slice(0, 8) + '01';
      const dueDate =
        input.dueDate ??
        new Date(new Date(`${periodStart}T00:00:00.000Z`).getTime() + 10 * 86_400_000)
          .toISOString()
          .slice(0, 10);
      const breakdown = calculateChargeBreakdown({
        rentCents: input.amountOverrideCents ?? lease.monthlyRentCents,
        condoFeeCents: lease.condoFeeCents ?? 0,
        dueDate,
        paidOn: dueDate,
      });
      const charge = first(
        await db
          .insert(charges)
          .values({
            orgId: auth.orgId,
            leaseId: lease.id,
            periodStart,
            dueDate,
            status: 'SCHEDULED',
            amountCents: breakdown.amountCents,
            rentCents: breakdown.rentCents,
            condoFeeCents: breakdown.condoFeeCents,
            lateFeeCents: breakdown.lateFeeCents,
            interestCents: breakdown.interestCents,
            taxesCents: breakdown.taxesCents,
            discountCents: breakdown.discountCents,
          })
          .returning(),
      );
      await postLedgerTransaction(db, auth.orgId, randomUUID(), 'CHARGE', charge.id, [
        { code: 'AR_RECEIVABLE', amountCents: charge.amountCents },
        {
          code: 'AGENCY_FEE_REVENUE',
          amountCents: -Math.floor((charge.rentCents * 1000) / 10_000),
        },
        {
          code: 'LANDLORD_PAYABLE',
          amountCents: -(charge.amountCents - Math.floor((charge.rentCents * 1000) / 10_000)),
        },
      ]);
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHARGE_CREATED,
        entityType: 'CHARGE',
        entityId: charge.id,
        payload: { amountCents: charge.amountCents },
      });
      return reply.status(201).send({ charge: toChargeDto(charge) });
    },
  );

  app.get('/charges', { onRequest: [requirePermission('finance:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listChargesQuerySchema.parse(request.query);
    const where = and(
      eq(charges.orgId, auth.orgId),
      query.status ? eq(charges.status, query.status) : undefined,
      query.leaseId ? eq(charges.leaseId, query.leaseId) : undefined,
    );
    const rows = await db
      .select()
      .from(charges)
      .where(where)
      .orderBy(desc(charges.dueDate))
      .limit(query.limit)
      .offset(query.offset);
    return listChargesResponseSchema.parse({
      charges: rows.map((row) => toChargeDto(row)),
      total: rows.length,
    });
  });

  app.get('/charges/:id', { onRequest: [requirePermission('finance:read')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const [row] = await db
      .select()
      .from(charges)
      .where(and(eq(charges.id, id), eq(charges.orgId, auth.orgId)))
      .limit(1);
    if (!row) {
      throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
    }
    return { charge: toChargeDto(row) };
  });

  app.post(
    '/charges/:id/payment',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = createPaymentRequestSchema.parse(request.body);
      if (!app.payments) {
        throw new DomainError('INVALID_INPUT', 'Pagamento não configurado');
      }
      const [charge] = await db
        .select()
        .from(charges)
        .where(and(eq(charges.id, id), eq(charges.orgId, auth.orgId)))
        .limit(1);
      if (!charge) {
        throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
      }
      if (!isChargeStatus(charge.status)) {
        throw new Error('charge status inválido');
      }
      const currentStatus = charge.status as ChargeStatus;
      if (
        currentStatus !== 'OPEN' &&
        currentStatus !== 'OVERDUE' &&
        currentStatus !== 'SCHEDULED'
      ) {
        throw new DomainError('INVALID_TRANSITION', `Cobrança ${currentStatus} não pode ser paga`);
      }
      transitionCharge(
        currentStatus === 'SCHEDULED'
          ? 'SCHEDULED'
          : currentStatus === 'OVERDUE'
            ? 'OVERDUE'
            : 'OPEN',
        'OPEN',
      );
      // Abre a charge (recálculo de multa/juros no momento do pagamento)
      const today = new Date().toISOString().slice(0, 10);
      const breakdown = calculateChargeBreakdown({
        rentCents: charge.rentCents,
        condoFeeCents: charge.condoFeeCents,
        taxesCents: charge.taxesCents,
        discountCents: charge.discountCents,
        dueDate: charge.dueDate,
        paidOn: today,
      });
      const [openCharge] = await db
        .update(charges)
        .set({
          status: 'OPEN',
          amountCents: breakdown.amountCents,
          lateFeeCents: breakdown.lateFeeCents,
          interestCents: breakdown.interestCents,
          updatedAt: new Date(),
        })
        .where(eq(charges.id, charge.id))
        .returning();
      if (!openCharge) {
        throw new Error('charge open failed');
      }

      const payment = first(
        await db
          .insert(payments)
          .values({
            orgId: auth.orgId,
            chargeId: charge.id,
            amountCents: breakdown.amountCents,
            method: input.method,
            status: 'PENDING',
          })
          .returning(),
      );
      const providerResult = await app.payments.createCharge({
        amountCents: breakdown.amountCents,
        description: `Aluguel ${charge.periodStart}`,
        dueDate: charge.dueDate,
      });
      await db
        .update(charges)
        .set({ providerChargeId: providerResult.providerChargeId, updatedAt: new Date() })
        .where(eq(charges.id, charge.id));
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PAYMENT_INITIATED,
        entityType: 'CHARGE',
        entityId: charge.id,
        payload: { paymentId: payment.id, amountCents: breakdown.amountCents },
      });
      return reply.status(201).send(
        paymentInitiationResponseSchema.parse({
          payment: {
            id: payment.id,
            orgId: payment.orgId,
            chargeId: payment.chargeId,
            amountCents: payment.amountCents,
            method: payment.method,
            status: payment.status,
            providerPaymentId: payment.providerPaymentId,
            paidAt: payment.paidAt?.toISOString() ?? null,
            createdAt: payment.createdAt.toISOString(),
          },
          pixQrCode: providerResult.pixQrCode ?? null,
          boletoUrl: providerResult.boletoUrl ?? null,
          providerChargeId: providerResult.providerChargeId,
        }),
      );
    },
  );

  app.post(
    '/charges/:id/cancel',
    { onRequest: [requirePermission('finance:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [charge] = await db
        .select()
        .from(charges)
        .where(and(eq(charges.id, id), eq(charges.orgId, auth.orgId)))
        .limit(1);
      if (!charge) {
        throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
      }
      if (!isChargeStatus(charge.status)) {
        throw new Error('charge status inválido');
      }
      transitionCharge(charge.status as ChargeStatus, 'CANCELLED');
      const [cancelled] = await db
        .update(charges)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(charges.id, charge.id))
        .returning();
      if (!cancelled) {
        throw new Error('charge cancel failed');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.CHARGE_CANCELLED,
        entityType: 'CHARGE',
        entityId: charge.id,
      });
      return { charge: toChargeDto(cancelled) };
    },
  );

  app.post(
    '/charges/:id/refund',
    { onRequest: [requirePermission('finance:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const [charge] = await db
        .select()
        .from(charges)
        .where(and(eq(charges.id, id), eq(charges.orgId, auth.orgId)))
        .limit(1);
      if (!charge) {
        throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
      }
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.chargeId, charge.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (!payment || !isPaymentStatus(payment.status)) {
        throw new DomainError('INVALID_TRANSITION', 'Nenhum pagamento confirmado para estornar');
      }
      transitionPayment(payment.status as PaymentStatus, 'REFUNDED');
      transitionCharge(charge.status as ChargeStatus, 'REFUNDED');
      const [refundedPayment] = await db
        .update(payments)
        .set({ status: 'REFUNDED', paidAt: new Date() })
        .where(eq(payments.id, payment.id))
        .returning();
      const [refundedCharge] = await db
        .update(charges)
        .set({ status: 'REFUNDED', updatedAt: new Date() })
        .where(eq(charges.id, charge.id))
        .returning();
      if (!refundedPayment || !refundedCharge) {
        throw new Error('refund failed');
      }
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
        entityType: 'CHARGE',
        entityId: charge.id,
        payload: { paymentId: payment.id },
      });
      return refundResponseSchema.parse({
        payment: {
          id: refundedPayment.id,
          orgId: refundedPayment.orgId,
          chargeId: refundedPayment.chargeId,
          amountCents: refundedPayment.amountCents,
          method: refundedPayment.method,
          status: refundedPayment.status,
          providerPaymentId: refundedPayment.providerPaymentId,
          paidAt: refundedPayment.paidAt?.toISOString() ?? null,
          createdAt: refundedPayment.createdAt.toISOString(),
        },
        charge: toChargeDto(refundedCharge),
      });
    },
  );

  return Promise.resolve();
};
