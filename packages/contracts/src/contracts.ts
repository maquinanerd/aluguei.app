import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

export const contractStatusSchema = z.enum([
  'DRAFT',
  'GENERATED',
  'SENT_FOR_SIGNATURE',
  'PARTIALLY_SIGNED',
  'SIGNED',
  'VOID',
]);

export const contractTemplateSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string(),
  version: z.number().int(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createContractTemplateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  body: z.string().min(1),
});

export const createContractTemplateResponseSchema = z.object({ template: contractTemplateSchema });

export const createContractTemplateVersionRequestSchema = z.object({ body: z.string().min(1) });

export const approveContractTemplateResponseSchema = z.object({ template: contractTemplateSchema });

export const listContractTemplatesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(),
  name: z.string().optional(),
});

export const listContractTemplatesResponseSchema = z.object({
  templates: z.array(contractTemplateSchema),
  total: z.number().int().nonnegative(),
});

export const contractSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  templateId: uuidSchema.nullable(),
  applicationId: uuidSchema.nullable(),
  status: contractStatusSchema,
  content: z.string().nullable(),
  contentHash: z.string().nullable(),
  signedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const contractPartySchema = z.object({
  id: uuidSchema,
  contractId: uuidSchema,
  partyId: uuidSchema.nullable(),
  role: z.enum(['LANDLORD', 'TENANT', 'GUARANTOR']),
  signOrder: z.number().int(),
  signedAt: z.string().nullable(),
});

export const signatureEnvelopeSchema = z.object({
  id: uuidSchema,
  contractId: uuidSchema,
  provider: z.string(),
  providerEnvelopeId: z.string(),
  status: z.enum(['PENDING', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'FAILED']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const contractAggregateSchema = z.object({
  contract: contractSchema,
  parties: z.array(contractPartySchema),
  envelope: signatureEnvelopeSchema.nullable(),
});

export const createContractRequestSchema = z.object({
  applicationId: uuidSchema,
  templateId: uuidSchema,
});

export const createContractResponseSchema = z.object({ contract: contractAggregateSchema });

export const listContractsQuerySchema = paginationQuerySchema.extend({
  status: contractStatusSchema.optional(),
});

export const listContractsResponseSchema = z.object({
  contracts: z.array(contractSchema),
  total: z.number().int().nonnegative(),
});

export const generateContractResponseSchema = z.object({ contract: contractAggregateSchema });

export const sendForSignatureResponseSchema = z.object({ envelope: signatureEnvelopeSchema });

export const updateContractStatusRequestSchema = z.object({ status: z.literal('VOID') });

export const updateContractStatusResponseSchema = z.object({ contract: contractAggregateSchema });

export const signatureWebhookEventSchema = z.object({
  provider: z.enum(['CLICKSIGN', 'D4SIGN', 'FAKE']),
  eventType: z.enum(['SIGNER_SIGNED', 'COMPLETED', 'FAILED']),
  providerEventId: z.string().min(1),
  providerEnvelopeId: z.string().min(1),
  signerOrder: z.number().int().optional(),
});
