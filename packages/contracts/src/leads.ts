import { z } from 'zod';
import { funnelStatusSchema, paginationQuerySchema, uuidSchema } from './common.js';

export const leadSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  status: funnelStatusSchema,
  source: z.string().nullable(),
  channel: z.string().nullable(),
  partyId: uuidSchema.nullable(),
  ownerUserId: uuidSchema.nullable(),
  budgetMinCents: z.number().int().nonnegative().nullable(),
  budgetMaxCents: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createLeadRequestSchema = z.object({
  partyId: uuidSchema.optional(),
  source: z.string().optional(),
  channel: z.string().optional(),
  interestedPropertyIds: z.array(uuidSchema).optional(),
  budgetMinCents: z.number().int().nonnegative().optional(),
  budgetMaxCents: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export const createLeadResponseSchema = z.object({
  lead: leadSchema,
  timelineEventId: uuidSchema,
});

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  status: funnelStatusSchema.optional(),
});

export const listLeadsResponseSchema = z.object({
  leads: z.array(leadSchema),
  total: z.number().int().nonnegative(),
});

export const updateLeadStatusRequestSchema = z.object({
  status: funnelStatusSchema,
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const updateLeadStatusResponseSchema = z.object({ lead: leadSchema });

/** Detalhe do lead com os imóveis de interesse (auditoria 2026-09-10, P2-03). */
export const getLeadResponseSchema = z.object({
  lead: leadSchema,
  interestedPropertyIds: z.array(uuidSchema),
});

/**
 * Edição do lead: dados e responsável. O status continua só em `PATCH /leads/:id/status`, que passa
 * pelo funil do domínio (P2-03).
 */
export const updateLeadRequestSchema = z
  .object({
    source: z.string().max(100).nullable().optional(),
    channel: z.string().max(100).nullable().optional(),
    ownerUserId: uuidSchema.nullable().optional(),
    budgetMinCents: z.number().int().nonnegative().nullable().optional(),
    budgetMaxCents: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().max(5_000).nullable().optional(),
    partyId: uuidSchema.nullable().optional(),
    /** Lista completa: substitui os imóveis de interesse atuais. */
    interestedPropertyIds: z.array(uuidSchema).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo' });

export const updateLeadResponseSchema = getLeadResponseSchema;

export type Lead = z.infer<typeof leadSchema>;
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
