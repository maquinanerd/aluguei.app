import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

/**
 * Espécie do contrato (Onda 5). Locação e compra e venda falam de partes
 * diferentes e oferecem variáveis diferentes ao modelo — misturá-las deixaria
 * um template de locação sendo usado numa venda.
 */
export const contractKindSchema = z.enum(['LEASE', 'SALE']);

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
  kind: contractKindSchema,
  version: z.number().int(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createContractTemplateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  body: z.string().min(1),
  /** Ausente vale como locação, que é a espécie histórica do produto. */
  kind: contractKindSchema.optional(),
});

export const createContractTemplateResponseSchema = z.object({ template: contractTemplateSchema });

export const createContractTemplateVersionRequestSchema = z.object({ body: z.string().min(1) });

export const approveContractTemplateResponseSchema = z.object({ template: contractTemplateSchema });

export const listContractTemplatesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(),
  name: z.string().optional(),
  kind: contractKindSchema.optional(),
});

export const listContractTemplatesResponseSchema = z.object({
  templates: z.array(contractTemplateSchema),
  total: z.number().int().nonnegative(),
});

export const contractSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  templateId: uuidSchema.nullable(),
  kind: contractKindSchema,
  /** Origem na locação; nulo no contrato de venda. */
  applicationId: uuidSchema.nullable(),
  /** Origem na venda; nulo no contrato de locação. */
  negotiationId: uuidSchema.nullable(),
  status: contractStatusSchema,
  content: z.string().nullable(),
  contentHash: z.string().nullable(),
  /** Versão vigente do texto (null enquanto DRAFT). */
  currentVersion: z.number().int().positive().nullable(),
  signedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Versão imutável do texto do contrato (P0-04). */
export const contractVersionSchema = z.object({
  id: uuidSchema,
  contractId: uuidSchema,
  version: z.number().int().positive(),
  content: z.string(),
  contentHash: z.string(),
  templateId: uuidSchema.nullable(),
  templateVersion: z.number().int().nullable(),
  createdBy: uuidSchema.nullable(),
  createdAt: z.string(),
});

export const listContractVersionsResponseSchema = z.object({
  versions: z.array(contractVersionSchema),
});

export const contractPartySchema = z.object({
  id: uuidSchema,
  contractId: uuidSchema,
  partyId: uuidSchema.nullable(),
  role: z.enum(['LANDLORD', 'TENANT', 'GUARANTOR', 'SELLER', 'BUYER']),
  signOrder: z.number().int(),
  signedAt: z.string().nullable(),
});

export const signatureEnvelopeSchema = z.object({
  id: uuidSchema,
  contractId: uuidSchema,
  provider: z.string(),
  providerEnvelopeId: z.string(),
  /** Versão do contrato enviada ao provider. */
  contractVersion: z.number().int().positive().nullable(),
  /** SHA-256 hex do documento (PDF) enviado ao provider. */
  documentHash: z.string().nullable(),
  status: z.enum(['PENDING', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'FAILED']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const contractAggregateSchema = z.object({
  contract: contractSchema,
  parties: z.array(contractPartySchema),
  envelope: signatureEnvelopeSchema.nullable(),
});

/**
 * Cria o contrato a partir da sua origem: candidatura (locação) ou negociação
 * (venda). Exatamente uma das duas — um contrato com as duas origens não tem
 * significado, e sem nenhuma não há de onde tirar as partes nem o valor.
 */
export const createContractRequestSchema = z
  .object({
    applicationId: uuidSchema.optional(),
    negotiationId: uuidSchema.optional(),
    templateId: uuidSchema,
  })
  .refine(
    (entrada) => (entrada.applicationId === undefined) !== (entrada.negotiationId === undefined),
    { message: 'Informe a candidatura (locação) ou a negociação (venda), e apenas uma' },
  );

export const createContractResponseSchema = z.object({ contract: contractAggregateSchema });

export const listContractsQuerySchema = paginationQuerySchema.extend({
  status: contractStatusSchema.optional(),
});

export const listContractsResponseSchema = z.object({
  contracts: z.array(contractSchema),
  total: z.number().int().nonnegative(),
});

export const generateContractRequestSchema = z
  .object({
    /** Regera um contrato GENERATED antes do envio: conteúdo diferente vira nova versão. */
    regenerate: z.boolean().optional(),
  })
  .strict();

export const generateContractResponseSchema = z.object({ contract: contractAggregateSchema });

export const sendForSignatureResponseSchema = z.object({ envelope: signatureEnvelopeSchema });

export const updateContractStatusRequestSchema = z.object({ status: z.literal('VOID') });

export const updateContractStatusResponseSchema = z.object({ contract: contractAggregateSchema });

export const signatureWebhookEventSchema = z.object({
  provider: z.enum(['AUTENTIQUE', 'D4SIGN', 'FAKE']),
  eventType: z.enum(['SIGNER_SIGNED', 'COMPLETED', 'FAILED']),
  providerEventId: z.string().min(1),
  providerEnvelopeId: z.string().min(1),
  signerOrder: z.number().int().optional(),
});
