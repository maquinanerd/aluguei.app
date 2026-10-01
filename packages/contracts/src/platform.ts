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

/**
 * Pedido de troca de plano feito pela imobiliária na tela de upgrade (rodada de fidelidade,
 * ADR-105, B15). Não troca o plano: a equipe da plataforma troca e o pedido vira `DONE`, ou o
 * descarta. A lista canônica de estados é `PLAN_CHANGE_REQUEST_STATUSES` (`packages/domain`).
 */
export const planChangeRequestStatusSchema = z.enum(['PENDING', 'DONE', 'DISMISSED']);

export const planChangeRequestSchema = z.object({
  id: uuidSchema,
  requestedModule: planModuleSchema.nullable(),
  requestedPlanCode: z.string().nullable(),
  status: planChangeRequestStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

/** O módulo do cadeado que a pessoa clicou, ou o plano escolhido na comparação. */
export const createPlanChangeRequestSchema = z
  .object({
    module: planModuleSchema.optional(),
    planCode: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,40}$/)
      .optional(),
  })
  .refine((entrada) => entrada.module !== undefined || entrada.planCode !== undefined, {
    message: 'Diga o módulo ou o plano pedido',
  });

/** `created` falso: já havia um pedido em aberto, e é ele que volta. */
export const planChangeRequestResponseSchema = z.object({
  request: planChangeRequestSchema,
  created: z.boolean(),
});

export const listPlanChangeRequestsResponseSchema = z.object({
  requests: z.array(planChangeRequestSchema),
});

/** Fila da plataforma: o pedido com a imobiliária, o plano de hoje e quem pediu. */
export const platformPlanChangeRequestSchema = planChangeRequestSchema.extend({
  organization: z.object({
    id: uuidSchema,
    name: z.string(),
    planCode: z.string(),
    planName: z.string(),
  }),
  requestedBy: z.object({ id: uuidSchema, name: z.string(), email: z.string() }).nullable(),
});

export const listPlatformPlanChangeRequestsQuerySchema = z.object({
  status: planChangeRequestStatusSchema.default('PENDING'),
});

export const listPlatformPlanChangeRequestsResponseSchema = z.object({
  requests: z.array(platformPlanChangeRequestSchema),
});

/** Resolver sem trocar o plano: `DISMISSED`. A troca pela rota do plano resolve como `DONE`. */
export const resolvePlanChangeRequestSchema = z.object({
  outcome: z.enum(['DONE', 'DISMISSED']),
});

export const platformPlanChangeRequestResponseSchema = z.object({
  request: platformPlanChangeRequestSchema,
});
