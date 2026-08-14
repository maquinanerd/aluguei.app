import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';
import { paymentInitiationResponseSchema } from './finance.js';

export const portalKindSchema = z.enum(['LANDLORD', 'TENANT']);

export const createPortalAccessRequestSchema = z
  .object({
    partyId: uuidSchema,
    kind: portalKindSchema,
  })
  .strict();

export const createPortalAccessResponseSchema = z.object({
  access: z.object({
    id: uuidSchema,
    kind: portalKindSchema,
    partyId: uuidSchema,
  }),
  // Token one-time de consumo (nunca persistido em texto; mostrado uma única vez).
  oneTimeToken: z.string().min(16),
});

export const consumePortalTokenRequestSchema = z
  .object({
    token: z.string().min(16).max(200),
  })
  .strict();

export const portalSessionResponseSchema = z.object({
  partyId: uuidSchema,
  partyName: z.string(),
  kind: portalKindSchema,
  orgId: uuidSchema,
  orgName: z.string(),
});

// ---- Locatário ----

export const portalChargeSchema = z.object({
  id: uuidSchema,
  periodStart: z.string(),
  dueDate: z.string(),
  status: z.string(),
  amountCents: z.number().int().nonnegative(),
  lateFeeCents: z.number().int().nonnegative(),
  interestCents: z.number().int().nonnegative(),
  paidAt: z.string().nullable(),
});

export const listPortalChargesQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
});

export const tenantStatementSchema = z.object({
  totals: z.object({
    billedCents: z.number().int().nonnegative(),
    paidCents: z.number().int().nonnegative(),
    openCents: z.number().int().nonnegative(),
  }),
  charges: z.array(portalChargeSchema),
  payments: z.array(
    z.object({
      id: uuidSchema,
      chargeId: uuidSchema,
      amountCents: z.number().int().nonnegative(),
      method: z.string(),
      status: z.string(),
      paidAt: z.string().nullable(),
    }),
  ),
});

export const portalContractSchema = z.object({
  id: uuidSchema,
  status: z.string(),
  contentHash: z.string().nullable(),
  signedAt: z.string().nullable(),
  envelopeStatus: z.string().nullable(),
  // content só é retornado quando o contrato está SIGNED (PII — SECURITY.md).
  content: z.string().nullable(),
});

export const portalInspectionReportSchema = z.object({
  id: uuidSchema,
  type: z.string(),
  status: z.string(),
  propertyId: uuidSchema,
  rooms: z.array(z.record(z.string(), z.unknown())).default([]),
  observations: z.array(
    z.object({
      id: uuidSchema,
      room: z.string().nullable(),
      category: z.string(),
      severity: z.string(),
      status: z.string(),
      text: z.string(),
    }),
  ),
  mediaCounts: z.object({
    photos: z.number().int().nonnegative(),
    audios: z.number().int().nonnegative(),
    videos: z.number().int().nonnegative(),
  }),
  inspectedAt: z.string().nullable(),
});

// ---- Proprietário ----

export const landlordStatementSchema = z.object({
  propertyId: uuidSchema.nullable(),
  totals: z.object({
    allocatedCents: z.number().int().nonnegative(),
    paidOutCents: z.number().int().nonnegative(),
    pendingCents: z.number().int().nonnegative(),
  }),
  allocations: z.array(
    z.object({
      id: uuidSchema,
      amountCents: z.number().int().nonnegative(),
      chargePeriodStart: z.string().nullable(),
      payoutStatus: z.string().nullable(),
    }),
  ),
});

export const portalPropertySchema = z.object({
  id: uuidSchema,
  title: z.string(),
  status: z.string(),
});

export const portalPaymentInitiationResponseSchema = paymentInitiationResponseSchema;
