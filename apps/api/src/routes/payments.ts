import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  ledgerAccounts,
  ledgerEntries,
  partyBankAccounts,
  partyIdentities,
  payments,
  payouts,
  reconciliations,
} from '@aluguei/db';
import { AUDIT_ACTIONS, DomainError, normalizeDocument } from '@aluguei/domain';
import {
  createBankAccountRequestSchema,
  createBankAccountResponseSchema,
  createReconciliationResponseSchema,
  ledgerAccountSchema,
  ledgerEntrySchema,
  listLedgerAccountsResponseSchema,
  listLedgerEntriesQuerySchema,
  listLedgerEntriesResponseSchema,
  listPaymentsQuerySchema,
  listPayoutsQuerySchema,
  listReconciliationsQuerySchema,
  listPaymentsResponseSchema,
  listPayoutsResponseSchema,
  listReconciliationsResponseSchema,
  paymentSchema,
  payoutSchema,
  reconciliationSchema,
} from '@aluguei/contracts';
import { webhookInbox } from '@aluguei/db';

import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

export const paymentsRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/payments', { onRequest: [requirePermission('finance:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listPaymentsQuerySchema.parse(request.query);
    const where = and(
      eq(payments.orgId, auth.orgId),
      query.status ? eq(payments.status, query.status) : undefined,
      query.chargeId ? eq(payments.chargeId, query.chargeId) : undefined,
    );
    const rows = await db
      .select()
      .from(payments)
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return listPaymentsResponseSchema.parse({
      payments: rows.map((row) =>
        paymentSchema.parse({
          id: row.id,
          orgId: row.orgId,
          chargeId: row.chargeId,
          amountCents: row.amountCents,
          method: row.method,
          status: row.status,
          providerPaymentId: row.providerPaymentId,
          paidAt: row.paidAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      total: rows.length,
    });
  });

  app.get('/payouts', { onRequest: [requirePermission('finance:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listPayoutsQuerySchema.parse(request.query);
    const where = and(
      eq(payouts.orgId, auth.orgId),
      query.status ? eq(payouts.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(payouts)
      .where(where)
      .orderBy(desc(payouts.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    const totalRows = await db.select().from(payouts).where(where);
    return listPayoutsResponseSchema.parse({
      payouts: rows.map((row) =>
        payoutSchema.parse({
          id: row.id,
          orgId: row.orgId,
          partyId: row.partyId,
          amountCents: row.amountCents,
          status: row.status,
          providerPayoutId: row.providerPayoutId,
          paidAt: row.paidAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      total: totalRows.length,
    });
  });

  app.get(
    '/ledger/accounts',
    { onRequest: [requirePermission('finance:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const rows = await db
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.orgId, auth.orgId));
      return listLedgerAccountsResponseSchema.parse({
        accounts: rows.map((row) =>
          ledgerAccountSchema.parse({
            id: row.id,
            orgId: row.orgId,
            code: row.code,
            name: row.name,
            type: row.type,
          }),
        ),
      });
    },
  );

  app.get(
    '/ledger/entries',
    { onRequest: [requirePermission('finance:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listLedgerEntriesQuerySchema.parse(request.query);
      const where = and(
        eq(ledgerEntries.orgId, auth.orgId),
        query.accountId ? eq(ledgerEntries.accountId, query.accountId) : undefined,
        query.transactionId ? eq(ledgerEntries.transactionId, query.transactionId) : undefined,
      );
      const rows = await db
        .select()
        .from(ledgerEntries)
        .where(where)
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return listLedgerEntriesResponseSchema.parse({
        entries: rows.map((row) =>
          ledgerEntrySchema.parse({
            id: row.id,
            orgId: row.orgId,
            transactionId: row.transactionId,
            accountId: row.accountId,
            amountCents: row.amountCents,
            entryType: row.entryType,
            referenceType: row.referenceType,
            referenceId: row.referenceId,
            description: row.description,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        total: rows.length,
      });
    },
  );

  app.post(
    '/bank-accounts',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createBankAccountRequestSchema.parse(request.body);
      const [party] = await db
        .select()
        .from(partyIdentities)
        .where(
          and(eq(partyIdentities.partyId, input.partyId), eq(partyIdentities.orgId, auth.orgId)),
        )
        .limit(1);
      if (!party) {
        throw new DomainError('NOT_FOUND', 'Parte não encontrada');
      }
      // Validação de titular: holder_document deve confeir com identidade CPF/CNPJ da parte.
      const holderDoc = normalizeDocument(input.holderDocument);
      const [docIdentity] = await db
        .select()
        .from(partyIdentities)
        .where(
          and(
            eq(partyIdentities.partyId, input.partyId),
            eq(partyIdentities.orgId, auth.orgId),
            eq(partyIdentities.kind, holderDoc.length === 14 ? 'CNPJ' : 'CPF'),
            eq(partyIdentities.value, holderDoc),
          ),
        )
        .limit(1);
      if (!docIdentity) {
        throw new DomainError(
          'INVALID_INPUT',
          'Titular da conta não confere com documento da parte',
        );
      }
      const account = first(
        await db
          .insert(partyBankAccounts)
          .values({
            orgId: auth.orgId,
            partyId: input.partyId,
            kind: input.kind ?? 'CHECKING',
            bankCode: input.bankCode,
            branch: input.branch ?? null,
            accountNumber: input.accountNumber ?? null,
            accountDigit: input.accountDigit ?? null,
            pixKey: input.pixKey ?? null,
            holderName: input.holderName,
            holderDocument: holderDoc,
            createdBy: auth.userId,
          })
          .returning(),
      );
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.FINANCE_BANK_ACCOUNT_CREATED,
        entityType: 'PARTY',
        entityId: input.partyId,
        payload: { bankAccountId: account.id },
      });
      return reply.status(201).send(
        createBankAccountResponseSchema.parse({
          bankAccount: {
            id: account.id,
            orgId: account.orgId,
            partyId: account.partyId,
            kind: account.kind,
            bankCode: account.bankCode,
            branch: account.branch,
            accountNumber: account.accountNumber,
            accountDigit: account.accountDigit,
            pixKey: account.pixKey,
            holderName: account.holderName,
            holderDocument: account.holderDocument,
            status: account.status,
            createdAt: account.createdAt.toISOString(),
          },
        }),
      );
    },
  );

  app.post(
    '/reconciliations',
    { onRequest: [requirePermission('finance:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const today = new Date().toISOString().slice(0, 10);
      await db
        .insert(webhookInbox)
        .values({
          orgId: auth.orgId,
          provider: 'PAYMENT_RECONCILE',
          providerEventId: `RECON:${auth.orgId}:${today}`,
          payload: { periodStart: today, periodEnd: today },
        })
        .onConflictDoNothing();
      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.RECONCILIATION_REQUESTED,
        entityType: 'RECONCILIATION',
        entityId: today,
      });
      return reply.status(202).send(createReconciliationResponseSchema.parse({ ok: true }));
    },
  );

  app.get(
    '/reconciliations',
    { onRequest: [requirePermission('finance:read')] },
    async (request) => {
      const auth = requireAuth(request);
      const query = listReconciliationsQuerySchema.parse(request.query);
      const where = and(
        eq(reconciliations.orgId, auth.orgId),
        query.status ? eq(reconciliations.status, query.status) : undefined,
      );
      const rows = await db
        .select()
        .from(reconciliations)
        .where(where)
        .orderBy(desc(reconciliations.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      const totalRows = await db.select().from(reconciliations).where(where);
      return listReconciliationsResponseSchema.parse({
        reconciliations: rows.map((row) =>
          reconciliationSchema.parse({
            id: row.id,
            orgId: row.orgId,
            provider: row.provider,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            status: row.status,
            providerTotalCents: row.providerTotalCents,
            localTotalCents: row.localTotalCents,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        total: totalRows.length,
      });
    },
  );

  return Promise.resolve();
};
