import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { charges, leases, payments } from '@aluguei/db';

import {
  AUDIT_ACTIONS,
  DomainError,
  calculateChargeBreakdown,
  chargeDueDate,
  isChargeStatus,
  rentForPeriod,
  saoPauloDate,
  transitionCharge,
} from '@aluguei/domain';
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
import { initiatePayment } from '../finance/initiation.js';
import {
  applyProviderRefund,
  postChargeCancellation,
  postChargeIssuance,
  splitRuleFor,
} from '../finance/settlement.js';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { rentChangesFor } from './leases.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

type ChargeRow = typeof charges.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

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

function toPaymentDto(row: PaymentRow): unknown {
  return {
    id: row.id,
    orgId: row.orgId,
    chargeId: row.chargeId,
    amountCents: row.amountCents,
    method: row.method,
    status: row.status,
    providerPaymentId: row.providerPaymentId,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A cobrança é mensal: o período sempre começa no dia 1 (uma por locação/mês). */
function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
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
      const periodStart = monthStart(input.periodStart ?? saoPauloDate(new Date()));
      const dueDate = input.dueDate ?? chargeDueDate(periodStart, lease.dueDay);
      const breakdown = calculateChargeBreakdown({
        rentCents:
          input.amountOverrideCents ??
          rentForPeriod(lease.monthlyRentCents, await rentChangesFor(db, lease.id), periodStart),
        condoFeeCents: lease.condoFeeCents ?? 0,
        lateFeeBps: lease.lateFeeBps,
        interestMonthlyBps: lease.interestMonthlyBps,
        dueDate,
        paidOn: dueDate,
      });

      // Emissão e reconhecimento contábil na mesma transação (P0-01).
      const charge = await db.transaction(async (tx) => {
        const created = first(
          await tx
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
        const { agencyShareBps } = await splitRuleFor(tx, lease.id);
        await postChargeIssuance(tx, created, agencyShareBps);
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.CHARGE_CREATED,
          entityType: 'CHARGE',
          entityId: created.id,
          payload: { amountCents: created.amountCents, periodStart },
        });
        return created;
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
      // Iniciação idempotente: reaproveita a tentativa pendente (P0-03).
      const result = await initiatePayment(db, app.payments, {
        orgId: auth.orgId,
        chargeId: id,
        method: input.method,
        actorUserId: auth.userId,
        recalculate: true,
        via: 'backoffice',
      });
      return reply.status(result.reused ? 200 : 201).send(
        paymentInitiationResponseSchema.parse({
          payment: toPaymentDto(result.payment),
          pixQrCode: result.pixQrCode,
          boletoUrl: result.boletoUrl,
          providerChargeId: result.providerChargeId,
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
        throw new Error(`status de cobrança inválido: ${charge.status}`);
      }
      transitionCharge(charge.status, 'CANCELLED');

      // Cancela as tentativas NO PROVIDER antes: cobrança já recebida não se
      // cancela — o dinheiro está a caminho e precisa ser registrado (P0-03).
      const pendingPayments = await db
        .select()
        .from(payments)
        .where(and(eq(payments.chargeId, charge.id), eq(payments.status, 'PENDING')));
      const provider = app.payments;
      if (provider) {
        for (const payment of pendingPayments) {
          if (!payment.providerPaymentId) {
            continue;
          }
          const status = await provider.getChargeStatus(payment.providerPaymentId);
          if (status === 'CONFIRMED' || status === 'REFUNDED') {
            throw new DomainError(
              'CONFLICT',
              'Cobrança já recebida no provider; aguarde a confirmação do pagamento',
            );
          }
          try {
            await provider.cancelCharge(payment.providerPaymentId);
          } catch (err) {
            throw new DomainError(
              'PROVIDER_ERROR',
              `Falha ao cancelar a cobrança no provider: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
            );
          }
        }
      }

      const cancelled = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(charges)
          .where(eq(charges.id, charge.id))
          .for('update');
        if (!locked || !isChargeStatus(locked.status)) {
          throw new DomainError('NOT_FOUND', 'Cobrança não encontrada');
        }
        transitionCharge(locked.status, 'CANCELLED');
        const [updated] = await tx
          .update(charges)
          .set({ status: 'CANCELLED', updatedAt: new Date() })
          .where(and(eq(charges.id, locked.id), eq(charges.status, locked.status)))
          .returning();
        if (!updated) {
          throw new DomainError('CONFLICT', 'A cobrança mudou de estado durante o cancelamento');
        }
        await tx
          .update(payments)
          .set({ status: 'CANCELLED', updatedAt: new Date() })
          .where(and(eq(payments.chargeId, updated.id), eq(payments.status, 'PENDING')));
        await postChargeCancellation(tx, updated);
        await writeAudit(tx, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.CHARGE_CANCELLED,
          entityType: 'CHARGE',
          entityId: updated.id,
        });
        return updated;
      });
      return { charge: toChargeDto(cancelled) };
    },
  );

  app.post(
    '/charges/:id/refund',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
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
      if (charge.status !== 'PAID' || !charge.paidPaymentId) {
        throw new DomainError('INVALID_TRANSITION', 'Nenhum pagamento confirmado para estornar');
      }
      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.id, charge.paidPaymentId), eq(payments.orgId, auth.orgId)))
        .limit(1);
      if (!payment || payment.status !== 'CONFIRMED') {
        throw new DomainError('INVALID_TRANSITION', 'Nenhum pagamento confirmado para estornar');
      }
      const provider = app.payments;
      if (!provider) {
        throw new DomainError('INVALID_INPUT', 'Pagamento não configurado');
      }
      if (!payment.providerPaymentId) {
        throw new DomainError('INVALID_INPUT', 'Pagamento sem identificação no provider');
      }

      // Quem estorna é o provider; o sistema só registra o estorno confirmado
      // por ele (auditoria 2026-09-10, P0-02).
      try {
        await provider.refundPayment(payment.providerPaymentId);
      } catch (err) {
        throw new DomainError(
          'PROVIDER_ERROR',
          `Falha ao estornar no provider: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
        );
      }
      const status = await provider.getChargeStatus(payment.providerPaymentId);
      if (status !== 'REFUNDED') {
        await writeAudit(db, {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
          entityType: 'CHARGE',
          entityId: charge.id,
          payload: { paymentId: payment.id, providerStatus: status, applied: false },
        });
        return reply.status(202).send(
          refundResponseSchema.parse({
            payment: toPaymentDto(payment),
            charge: toChargeDto(charge),
          }),
        );
      }

      await applyProviderRefund(db, auth.orgId, payment.id);
      const [refundedPayment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .limit(1);
      const [refundedCharge] = await db
        .select()
        .from(charges)
        .where(eq(charges.id, charge.id))
        .limit(1);
      if (!refundedPayment || !refundedCharge) {
        throw new Error('estorno aplicado sem registro correspondente');
      }
      return reply.status(200).send(
        refundResponseSchema.parse({
          payment: toPaymentDto(refundedPayment),
          charge: toChargeDto(refundedCharge),
        }),
      );
    },
  );

  return Promise.resolve();
};
