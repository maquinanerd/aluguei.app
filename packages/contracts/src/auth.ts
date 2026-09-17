import { z } from 'zod';
import { roleSchema, uuidSchema } from './common.js';

export const userSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  name: z.string(),
});

/** Situação da imobiliária na plataforma: só ACTIVE opera (admin da plataforma). */
export const organizationStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
]);

export const organizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  status: organizationStatusSchema,
  /** Motivo da recusa ou da suspensão, visível para a própria imobiliária. */
  statusReason: z.string().nullable(),
});

const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const onlyDigits = (value: string): string => value.replace(/\D/g, '');

export const membershipSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  role: roleSchema,
  createdAt: z.string(),
});

export const registerRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().min(1).max(120),
  // Dados para a análise do cadastro pelo admin da plataforma (opcionais na API).
  document: z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform(onlyDigits)
      .pipe(z.string().regex(/^(\d{11}|\d{14})$/, 'CPF (11 dígitos) ou CNPJ (14 dígitos)'))
      .optional(),
  ),
  phone: z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform(onlyDigits)
      .pipe(z.string().regex(/^\d{10,13}$/, 'Telefone com DDD'))
      .optional(),
  ),
  creci: z.preprocess(blankToUndefined, z.string().trim().max(30).optional()),
});

export const registerResponseSchema = z.object({
  user: userSchema,
  org: organizationSchema,
  membership: membershipSchema,
});
export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
/** Admin da plataforma sem imobiliária entra com `org` e `membership` nulos. */
export const loginResponseSchema = z.object({
  user: userSchema,
  org: organizationSchema.nullable(),
  membership: membershipSchema.nullable(),
  platformAdmin: z.boolean(),
});
export const authSessionSchema = registerResponseSchema;
export const logoutResponseSchema = z.object({ ok: z.literal(true) });

export const meResponseSchema = z.object({
  user: userSchema,
  activeOrg: organizationSchema.nullable(),
  memberships: z.array(membershipSchema),
  platformAdmin: z.boolean(),
});

export const switchOrgRequestSchema = z.object({ orgId: uuidSchema });
export const switchOrgResponseSchema = z.object({ activeOrg: organizationSchema });
