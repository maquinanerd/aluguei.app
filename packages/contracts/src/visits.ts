import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const visitStatusSchema = z.enum(['SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW']);

export const visitSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  leadId: uuidSchema.nullable(),
  partyId: uuidSchema.nullable(),
  propertyId: uuidSchema.nullable(),
  scheduledAt: z.string(),
  status: visitStatusSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createVisitRequestSchema = z.object({
  leadId: uuidSchema.optional(),
  partyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  scheduledAt: z.string(),
  status: visitStatusSchema.optional(),
  note: z.string().optional(),
});

export const createVisitResponseSchema = z.object({ visit: visitSchema });

export const listVisitsQuerySchema = paginationQuerySchema.extend({
  status: visitStatusSchema.optional(),
});

export const listVisitsResponseSchema = z.object({
  visits: z.array(visitSchema),
  total: z.number().int().nonnegative(),
});
