import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const rentalApplicationStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'SCREENING',
  'MANUAL_REVIEW',
  'APPROVED',
  'REJECTED',
  'CONTRACTING',
]);

/** Origem da decisão de crédito: pessoa (MANUAL) ou regras do screening (AUTOMATIC). */
export const creditDecisionSourceSchema = z.enum(['MANUAL', 'AUTOMATIC']);

export const rentalApplicationSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  leadId: uuidSchema.nullable(),
  partyId: uuidSchema,
  propertyId: uuidSchema,
  proposalId: uuidSchema.nullable(),
  status: rentalApplicationStatusSchema,
  decisionReason: z.string().nullable(),
  decisionSource: creditDecisionSourceSchema.nullable(),
  submittedAt: z.string().nullable(),
  decidedBy: uuidSchema.nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const consentSchema = z.object({
  id: uuidSchema,
  partyId: uuidSchema,
  purpose: z.string(),
  grantedAt: z.string(),
  revokedAt: z.string().nullable(),
});

export const screeningResultSchema = z.object({
  id: uuidSchema,
  provider: z.string(),
  score: z.number().int().nullable(),
  decision: z.enum(['APPROVE', 'REVIEW', 'REJECT']),
  decisionRules: z.unknown(),
  createdAt: z.string(),
});

export const rentalApplicationAggregateSchema = z.object({
  application: rentalApplicationSchema,
  latestScreeningResult: screeningResultSchema.nullable(),
  consent: consentSchema.nullable(),
});

export const createRentalApplicationRequestSchema = z.object({
  leadId: uuidSchema.optional(),
  partyId: uuidSchema,
  propertyId: uuidSchema,
  proposalId: uuidSchema.optional(),
});

export const createRentalApplicationResponseSchema = z.object({
  application: rentalApplicationSchema,
});

export const listRentalApplicationsQuerySchema = paginationQuerySchema.extend({
  status: rentalApplicationStatusSchema.optional(),
  leadId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
});

export const listRentalApplicationsResponseSchema = z.object({
  applications: z.array(rentalApplicationSchema),
  total: z.number().int().nonnegative(),
});

/**
 * Mudança de status pela equipe. Aprovação e rejeição exigem motivo (P1-06):
 * sem ele a decisão de crédito não é auditável — a API responde 400.
 */
export const updateRentalApplicationStatusRequestSchema = z
  .object({
    status: rentalApplicationStatusSchema,
    decisionReason: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.status === 'APPROVED' || value.status === 'REJECTED') && !value.decisionReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['decisionReason'],
        message: 'Aprovação ou rejeição de crédito exige motivo',
      });
    }
  });

export const updateRentalApplicationStatusResponseSchema = z.object({
  application: rentalApplicationAggregateSchema,
});

export const requestScreeningRequestSchema = z.object({
  provider: z.enum(['SERASA', 'SPC', 'FAKE']).optional(),
});

export const requestScreeningResponseSchema = z.object({
  requestId: uuidSchema,
  status: z.literal('SCREENING'),
});

export const createPartyConsentRequestSchema = z.object({
  purpose: z.literal('CREDIT_SCREENING'),
});

export const createPartyConsentResponseSchema = z.object({ consent: consentSchema });

export const listPartyConsentsResponseSchema = z.object({ consents: z.array(consentSchema) });
