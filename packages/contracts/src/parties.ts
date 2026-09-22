import { z } from 'zod';
import {
  idListQuerySchema,
  paginationQuerySchema,
  searchTextQuerySchema,
  uuidSchema,
} from './common.js';

export const identityKindSchema = z.enum(['EMAIL', 'PHONE', 'CPF', 'CNPJ', 'PASSPORT']);

export const identitySchema = z.object({
  kind: identityKindSchema,
  value: z.string().min(3).max(255),
});

export const partyAddressSchema = z.object({
  label: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  isPublic: z.boolean().default(false),
});

export const partyRoleSchema = z.enum([
  'OWNER',
  'TENANT',
  'GUARANTOR',
  'BROKER',
  'LEGAL_REPRESENTATIVE',
]);

/** ACTIVE | ARCHIVED — arquivar substitui a exclusão (auditoria 2026-09-10, P2-01). */
export const partyStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export const createPartyRequestSchema = z.object({
  type: z.enum(['PERSON', 'COMPANY']),
  name: z.string().min(1).max(200),
  roles: z.array(partyRoleSchema).optional(),
  identities: z.array(identitySchema).min(1),
  addresses: z.array(partyAddressSchema).optional(),
});

export const partyIdentitySchema = z.object({
  kind: identityKindSchema,
  value: z.string(),
});

export const partySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  type: z.enum(['PERSON', 'COMPANY']),
  name: z.string(),
  status: partyStatusSchema,
  identities: z.array(partyIdentitySchema),
  addresses: z.array(partyAddressSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createPartyResponseSchema = z.object({
  party: partySchema,
  duplicate: z.boolean(),
  matchedPartyId: uuidSchema.nullable(),
});

export const listPartiesQuerySchema = paginationQuerySchema.extend({
  /** Ids a resolver para as linhas de uma página. */
  ids: idListQuerySchema.optional(),
  /** Trecho do nome, do e-mail ou dos dígitos de CPF, CNPJ ou telefone. */
  q: searchTextQuerySchema,
  /** Sem filtro, a lista traz só as pessoas ativas (as arquivadas ficam fora). */
  status: partyStatusSchema.optional(),
});

export const listPartiesResponseSchema = z.object({
  parties: z.array(partySchema),
  total: z.number().int().nonnegative(),
});

export const dedupePartyRequestSchema = z.object({
  identities: z.array(identitySchema).min(1),
});

export const dedupePartyResponseSchema = z.object({
  matches: z.array(
    z.object({
      partyId: uuidSchema,
      name: z.string(),
      reasons: z.array(identityKindSchema),
    }),
  ),
});

/** Tipo de documento da pessoa (mesmo domínio fechado do CHECK do banco). */
export const partyDocumentKindSchema = z.enum([
  'IDENTITY',
  'CPF',
  'PROOF_OF_INCOME',
  'PROOF_OF_ADDRESS',
  'MARITAL_STATUS',
  'COMPANY_BYLAWS',
  'OTHER',
]);

export const partyDocumentSchema = z.object({
  id: uuidSchema,
  kind: partyDocumentKindSchema,
  documentKey: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
});

export const partyConsentSchema = z.object({
  id: uuidSchema,
  purpose: z.string(),
  grantedAt: z.string(),
  revokedAt: z.string().nullable(),
});

/** Detalhe da pessoa: identidades, endereços, papéis, consentimentos e documentos (P2-01). */
export const getPartyResponseSchema = z.object({
  party: partySchema,
  roles: z.array(partyRoleSchema),
  consents: z.array(partyConsentSchema),
  documents: z.array(partyDocumentSchema),
});

export const updatePartyRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: z.enum(['PERSON', 'COMPANY']).optional(),
    status: partyStatusSchema.optional(),
    /** Lista completa: substitui as identidades atuais (cada uma validada no domínio). */
    identities: z.array(identitySchema).min(1).optional(),
    /** Lista completa: substitui os papéis atuais. */
    roles: z.array(partyRoleSchema).optional(),
    /** Lista completa: substitui os endereços atuais. */
    addresses: z.array(partyAddressSchema).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo' });

export const updatePartyResponseSchema = getPartyResponseSchema;

export const requestPartyDocumentUrlRequestSchema = z
  .object({
    kind: partyDocumentKindSchema,
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const requestPartyDocumentUrlResponseSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
});

export const confirmPartyDocumentRequestSchema = z
  .object({ key: z.string().min(1), kind: partyDocumentKindSchema })
  .strict();

export const confirmPartyDocumentResponseSchema = z.object({ document: partyDocumentSchema });

export const listPartyDocumentsResponseSchema = z.object({
  documents: z.array(partyDocumentSchema),
});

export const deletePartyDocumentResponseSchema = z.object({ ok: z.literal(true) });

export type Party = z.infer<typeof partySchema>;
export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
export type PartyDocumentKind = z.infer<typeof partyDocumentKindSchema>;
