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

export type Lead = z.infer<typeof leadSchema>;
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
