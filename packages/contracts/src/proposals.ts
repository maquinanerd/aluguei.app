import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';
import { isoDateSchema } from './finance.js';

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
  /** Data civil do último dia de validade (a proposta vale o dia inteiro). */
  validUntil: isoDateSchema.nullable(),
  sentAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProposalRequestSchema = z.object({
  leadId: uuidSchema.optional(),
  partyId: uuidSchema.optional(),
  propertyId: uuidSchema.optional(),
  monthlyRentCents: z.number().int().positive(),
  terms: z.string().optional(),
  validUntil: isoDateSchema.optional(),
});

export const createProposalResponseSchema = z.object({ proposal: proposalSchema });

export const listProposalsQuerySchema = paginationQuerySchema.extend({
  status: proposalStatusSchema.optional(),
});

export const listProposalsResponseSchema = z.object({
  proposals: z.array(proposalSchema),
  total: z.number().int().nonnegative(),
});

export const getProposalResponseSchema = z.object({ proposal: proposalSchema });

/** Só o rascunho é editável (auditoria 2026-09-10, P2-02). */
export const updateProposalRequestSchema = z
  .object({
    monthlyRentCents: z.number().int().positive().optional(),
    terms: z.string().max(5_000).optional(),
    validUntil: isoDateSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo' });

export const updateProposalResponseSchema = z.object({ proposal: proposalSchema });

/**
 * Ciclo de vida da proposta. `SENT` exige validade e `REJECTED` exige motivo — as regras são do
 * domínio (`transitionProposal`); o schema só recebe os campos.
 */
export const updateProposalStatusRequestSchema = z
  .object({
    status: proposalStatusSchema,
    reason: z.string().min(1).max(500).optional(),
    validUntil: isoDateSchema.optional(),
  })
  .strict();

export const updateProposalStatusResponseSchema = z.object({ proposal: proposalSchema });
