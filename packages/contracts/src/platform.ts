import { z } from 'zod';
import { organizationStatusSchema } from './auth.js';
import {
  MAX_AMOUNT_CENTS,
  paginationQuerySchema,
  planModuleSchema,
  roleSchema,
  searchTextQuerySchema,
  uuidSchema,
} from './common.js';

/** Admin da plataforma: imobiliárias, aprovação e planos com limites (sem cobrança). */

const limitSchema = (minimum: number) => z.number().int().min(minimum).max(1_000_000).nullable();

/** Preço mensal só para exibição; nulo vira "Fale com a gente" na página de planos. */
const monthlyPriceCentsSchema = z.number().int().min(0).max(MAX_AMOUNT_CENTS).nullable();

export const planSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  maxUsers: z.number().int().nullable(),
  maxProperties: z.number().int().nullable(),
  maxPublishedListings: z.number().int().nullable(),
  maxActiveLeases: z.number().int().nullable(),
  modules: z.array(planModuleSchema),
  monthlyPriceCents: z.number().int().nullable(),
  isActive: z.boolean(),
  organizationCount: z.number().int().nonnegative(),
});

export const listPlansResponseSchema = z.object({ plans: z.array(planSchema) });

export const createPlanRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/, 'Código em maiúsculas, dígitos e _ (2 a 40)'),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  maxUsers: limitSchema(1),
  maxProperties: limitSchema(0),
  maxPublishedListings: limitSchema(0),
  maxActiveLeases: limitSchema(0).optional(),
  modules: z.array(planModuleSchema).max(10).optional(),
  monthlyPriceCents: monthlyPriceCentsSchema.optional(),
});

export const updatePlanRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable(),
    maxUsers: limitSchema(1),
    maxProperties: limitSchema(0),
    maxPublishedListings: limitSchema(0),
    maxActiveLeases: limitSchema(0),
    modules: z.array(planModuleSchema).max(10),
    monthlyPriceCents: monthlyPriceCentsSchema,
    isActive: z.boolean(),
  })
  .partial();

export const planResponseSchema = z.object({ plan: planSchema });

export const planResourceSchema = z.enum([
  'users',
  'properties',
  'publishedListings',
  'activeLeases',
]);

export const platformOrganizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  status: organizationStatusSchema,
  statusReason: z.string().nullable(),
  statusChangedAt: z.string().nullable(),
  document: z.string().nullable(),
  phone: z.string().nullable(),
  creci: z.string().nullable(),
  /** Plano que a imobiliária pediu no cadastro; quem decide o vigente é o admin. */
  requestedPlanCode: z.string().nullable(),
  createdAt: z.string(),
  plan: z.object({ id: uuidSchema, code: z.string(), name: z.string() }).extend({
    maxUsers: z.number().int().nullable(),
    maxProperties: z.number().int().nullable(),
    maxPublishedListings: z.number().int().nullable(),
    maxActiveLeases: z.number().int().nullable(),
    modules: z.array(planModuleSchema),
    monthlyPriceCents: z.number().int().nullable(),
    isActive: z.boolean(),
  }),
  owner: z.object({ name: z.string(), email: z.string() }).nullable(),
  usage: z.object({
    users: z.number().int().nonnegative(),
    properties: z.number().int().nonnegative(),
    publishedListings: z.number().int().nonnegative(),
    activeLeases: z.number().int().nonnegative(),
  }),
  overLimit: z.array(planResourceSchema),
});

export const listPlatformOrganizationsQuerySchema = paginationQuerySchema.extend({
  status: organizationStatusSchema.optional(),
  q: searchTextQuerySchema,
});

export const listPlatformOrganizationsResponseSchema = z.object({
  organizations: z.array(platformOrganizationSchema),
  total: z.number().int().nonnegative(),
  counts: z.object({
    PENDING_APPROVAL: z.number().int().nonnegative(),
    ACTIVE: z.number().int().nonnegative(),
    SUSPENDED: z.number().int().nonnegative(),
    REJECTED: z.number().int().nonnegative(),
  }),
});

export const platformOrganizationDetailResponseSchema = z.object({
  organization: platformOrganizationSchema,
  members: z.array(
    z.object({ userId: uuidSchema, name: z.string(), email: z.string(), role: roleSchema }),
  ),
  events: z.array(
    z.object({
      id: uuidSchema,
      action: z.string(),
      actorEmail: z.string().nullable(),
      payload: z.record(z.string(), z.unknown()),
      occurredAt: z.string(),
    }),
  ),
});

export const platformOrganizationResponseSchema = z.object({
  organization: platformOrganizationSchema,
});

export const approveOrganizationRequestSchema = z.object({ planId: uuidSchema.optional() });

const reasonSchema = z.string().trim().min(1, 'Informe o motivo').max(500);

export const rejectOrganizationRequestSchema = z.object({ reason: reasonSchema });
export const suspendOrganizationRequestSchema = z.object({ reason: reasonSchema });

export const changeOrganizationPlanRequestSchema = z.object({ planId: uuidSchema });
