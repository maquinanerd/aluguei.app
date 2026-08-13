import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const proposalStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);

export const proposalSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  leadId: uuidSchema.nullable(),
  partyId: uuidSchema.nullable(),
  propertyId: uuidSchema.nullable(),
  status: proposalStatusSchema,
  monthlyRentCents: z.number().int().nonnegative(),
  terms: z.string().nullable(),
  validUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProposalRequestSchema = z.object({
  leadId: uuidSchema.optional(),
  partyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  monthlyRentCents: z.number().int().positive(),
  terms: z.string().optional(),
  validUntil: z.string().optional(),
});

export const createProposalResponseSchema = z.object({ proposal: proposalSchema });

export const listProposalsQuerySchema = paginationQuerySchema.extend({
  status: proposalStatusSchema.optional(),
});

export const listProposalsResponseSchema = z.object({
  proposals: z.array(proposalSchema),
  total: z.number().int().nonnegative(),
});
