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
export const paymentStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);
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
  /** Multa por atraso em basis points (G3, P1-07). */
  lateFeeBps: z.number().int().min(0).max(1000),
  /** Juros de mora ao mês em basis points, pro rata die. */
  interestMonthlyBps: z.number().int().min(0).max(100),
  dueDay: z.number().int().min(1).max(28),
  endReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const leaseLandlordSchema = z.object({
  partyId: uuidSchema,
  shareBps: z.number().int().positive().max(10_000),
});

export const leaseAmendmentKindSchema = z.enum(['RENEWAL', 'READJUSTMENT', 'TERMINATION']);

export const leaseAmendmentSchema = z.object({
  id: uuidSchema,
  kind: leaseAmendmentKindSchema,
  effectiveFrom: z.string().nullable(),
  previousEndDate: z.string().nullable(),
  newEndDate: z.string().nullable(),
  previousRentCents: z.number().int().nonnegative().nullable(),
  newRentCents: z.number().int().nonnegative().nullable(),
  indexName: z.string().nullable(),
  adjustmentBps: z.number().int().nullable(),
  reason: z.string().nullable(),
  createdBy: uuidSchema.nullable(),
  createdAt: z.string(),
});

/** Data civil `AAAA-MM-DD` que existe no calendário (2027-02-30 não passa). */
/** Data civil AAAA-MM-DD que existe no calendário (sem instante, sem fuso). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { message: 'Data inexistente' },
  );
const monthStartSchema = isoDateSchema.refine((value) => value.endsWith('-01'), {
  message: 'O reajuste começa no primeiro dia de um mês',
});

export const updateLeaseTermsRequestSchema = z
  .object({
    lateFeeBps: z.number().int().min(0).max(1000).optional(),
    interestMonthlyBps: z.number().int().min(0).max(100).optional(),
    dueDay: z.number().int().min(1).max(28).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um termo' });

export const renewLeaseRequestSchema = z
  .object({
    endDate: isoDateSchema,
    monthlyRentCents: z.number().int().positive().optional(),
  })
  .strict();

export const leaseIndexNameSchema = z.enum(['IGPM', 'IPCA', 'INPC', 'IVAR', 'OUTRO']);

export const readjustLeaseRequestSchema = z
  .object({
    effectiveFrom: monthStartSchema,
    indexName: leaseIndexNameSchema,
    adjustmentBps: z.number().int().gt(-10_000).max(10_000).optional(),
    newMonthlyRentCents: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (value) => (value.adjustmentBps === undefined) !== (value.newMonthlyRentCents === undefined),
    {
      message: 'Informe o índice em basis points ou o novo aluguel, não os dois',
    },
  );

export const endLeaseRequestSchema = z
  .object({
    endDate: isoDateSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const leaseMutationResponseSchema = z.object({
  lease: leaseSchema,
  amendment: leaseAmendmentSchema.nullable(),
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
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED']),
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
  /** Participação de cada proprietário no repasse (G3, P1-08). */
  landlords: z.array(leaseLandlordSchema),
  /** Renovações, reajustes e encerramento, do mais recente ao mais antigo (G3, P1-20). */
  amendments: z.array(leaseAmendmentSchema),
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
  /** Qualquer dia do mês de referência; a cobrança usa o primeiro dia. */
  periodStart: isoDateSchema.optional(),
  /** Data civil; sem ela, o dia de vencimento da locação (G3, P1-07). */
  dueDate: isoDateSchema.optional(),
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

export const listPayoutsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED']).optional(),
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

export const listReconciliationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
});

export const paymentWebhookEventSchema = z.object({
  provider: z.enum(['FAKE', 'ASAAS']),
  eventType: z.enum(['PAYMENT_CONFIRMED', 'PAYMENT_REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_OVERDUE']),
  providerEventId: z.string().min(1),
  providerChargeId: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  paidAt: z.string().optional(),
});
