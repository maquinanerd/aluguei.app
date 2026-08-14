import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const leaseStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'DELINQUENT',
  'TERMINATING',
  'ENDED',
]);
export const chargeStatusSchema = z.enum([
  'SCHEDULED',
  'OPEN',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED',
]);
export const paymentStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED']);
export const paymentMethodSchema = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'MANUAL']);

export const leaseSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  contractId: uuidSchema,
  tenantPartyId: uuidSchema.nullable(),
  landlordPartyId: uuidSchema.nullable(),
  propertyId: uuidSchema,
  status: leaseStatusSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  monthlyRentCents: z.number().int().nonnegative(),
  condoFeeCents: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const chargeSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  leaseId: uuidSchema,
  periodStart: z.string(),
  dueDate: z.string(),
  status: chargeStatusSchema,
  amountCents: z.number().int().nonnegative(),
  rentCents: z.number().int().nonnegative(),
  condoFeeCents: z.number().int().nonnegative(),
  lateFeeCents: z.number().int().nonnegative(),
  interestCents: z.number().int().nonnegative(),
  taxesCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  paidAt: z.string().nullable(),
  providerChargeId: z.string().nullable(),
  createdAt: z.string(),
});

export const paymentSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  chargeId: uuidSchema,
  amountCents: z.number().int().nonnegative(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  providerPaymentId: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});

export const payoutSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  partyId: uuidSchema.nullable(),
  amountCents: z.number().int().nonnegative(),
  status: z.enum(['PENDING', 'PAID', 'FAILED']),
  providerPayoutId: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});

export const ledgerAccountSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  code: z.string(),
  name: z.string(),
  type: z.enum(['ASSET', 'LIABILITY', 'REVENUE', 'EQUITY']),
});

export const ledgerEntrySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  transactionId: uuidSchema,
  accountId: uuidSchema,
  amountCents: z.number().int(),
  entryType: z.enum(['DEBIT', 'CREDIT']),
  referenceType: z.string(),
  referenceId: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
});

export const reconciliationSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  provider: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(['PENDING', 'MATCHED', 'DISCREPANCY']),
  providerTotalCents: z.number().int().nullable(),
  localTotalCents: z.number().int().nullable(),
  createdAt: z.string(),
});

export const bankAccountSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  partyId: uuidSchema,
  kind: z.string(),
  bankCode: z.string(),
  branch: z.string().nullable(),
  accountNumber: z.string().nullable(),
  accountDigit: z.string().nullable(),
  pixKey: z.string().nullable(),
  holderName: z.string(),
  holderDocument: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string(),
});

export const createLeaseRequestSchema = z.object({ contractId: uuidSchema });
export const createLeaseResponseSchema = z.object({ lease: leaseSchema });

export const leaseAggregateSchema = z.object({
  lease: leaseSchema,
  charges: z.array(chargeSchema),
  splitRule: z
    .object({
      agencyShareBps: z.number().int(),
      landlordShareBps: z.number().int(),
    })
    .nullable(),
});

export const listLeasesQuerySchema = paginationQuerySchema.extend({
  status: leaseStatusSchema.optional(),
});

export const listLeasesResponseSchema = z.object({
  leases: z.array(leaseSchema),
  total: z.number().int().nonnegative(),
});

export const createChargeRequestSchema = z.object({
  leaseId: uuidSchema,
  periodStart: z.string().optional(),
  dueDate: z.string().optional(),
  amountOverrideCents: z.number().int().positive().optional(),
});

export const listChargesQuerySchema = paginationQuerySchema.extend({
  status: chargeStatusSchema.optional(),
  leaseId: uuidSchema.optional(),
});

export const listChargesResponseSchema = z.object({
  charges: z.array(chargeSchema),
  total: z.number().int().nonnegative(),
});

export const createPaymentRequestSchema = z.object({ method: paymentMethodSchema });

export const paymentInitiationResponseSchema = z.object({
  payment: paymentSchema,
  pixQrCode: z.string().nullable(),
  boletoUrl: z.string().nullable(),
  providerChargeId: z.string(),
});

export const refundResponseSchema = z.object({
  payment: paymentSchema,
  charge: chargeSchema,
});

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  chargeId: uuidSchema.optional(),
});

export const listPaymentsResponseSchema = z.object({
  payments: z.array(paymentSchema),
  total: z.number().int().nonnegative(),
});

export const listPayoutsResponseSchema = z.object({
  payouts: z.array(payoutSchema),
  total: z.number().int().nonnegative(),
});

export const listLedgerAccountsResponseSchema = z.object({
  accounts: z.array(ledgerAccountSchema),
});

export const listLedgerEntriesQuerySchema = paginationQuerySchema.extend({
  accountId: uuidSchema.optional(),
  transactionId: uuidSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listLedgerEntriesResponseSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  total: z.number().int().nonnegative(),
});

export const createBankAccountRequestSchema = z.object({
  partyId: uuidSchema,
  kind: z.string().optional(),
  bankCode: z.string().min(1),
  branch: z.string().optional(),
  accountNumber: z.string().optional(),
  accountDigit: z.string().optional(),
  pixKey: z.string().optional(),
  holderName: z.string().min(1),
  holderDocument: z.string().min(1),
});

export const createBankAccountResponseSchema = z.object({ bankAccount: bankAccountSchema });

export const createReconciliationResponseSchema = z.object({ ok: z.literal(true) });

export const listReconciliationsResponseSchema = z.object({
  reconciliations: z.array(reconciliationSchema),
  total: z.number().int().nonnegative(),
});

export const paymentWebhookEventSchema = z.object({
  provider: z.enum(['FAKE', 'ASAAS']),
  eventType: z.enum(['PAYMENT_CONFIRMED', 'PAYMENT_REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_OVERDUE']),
  providerEventId: z.string().min(1),
  providerChargeId: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  paidAt: z.string().optional(),
});
