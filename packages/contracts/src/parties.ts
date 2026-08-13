import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

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
  status: z.string(),
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

export const listPartiesQuerySchema = paginationQuerySchema;

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

export type Party = z.infer<typeof partySchema>;
export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
