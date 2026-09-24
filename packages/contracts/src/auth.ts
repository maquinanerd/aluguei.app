import { z } from 'zod';
import { planModuleSchema, roleSchema, uuidSchema } from './common.js';

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
  /**
   * Plano pedido no cadastro (Onda 3). É intenção, não contratação: quem define
   * o plano vigente é o admin na aprovação (ADR-060). O formato é o mesmo do
   * código de plano, porque o valor chega pela URL pública (`/register?plano=`).
   */
  requestedPlanCode: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,40}$/, 'Código de plano inválido')
      .optional(),
  ),
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

/**
 * Plano da imobiliária ativa, como a interface precisa dele: módulos incluídos
 * (o que falta aparece com cadeado) e limites para a tela "Plano e uso".
 */
export const sessionPlanSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  modules: z.array(planModuleSchema),
  /** Só exibição; nulo vira "Fale com a gente". */
  monthlyPriceCents: z.number().int().nullable(),
  limits: z.object({
    maxUsers: z.number().int().nullable(),
    maxProperties: z.number().int().nullable(),
    maxPublishedListings: z.number().int().nullable(),
    maxActiveLeases: z.number().int().nullable(),
  }),
});

export const meResponseSchema = z.object({
  user: userSchema,
  activeOrg: organizationSchema.nullable(),
  /** Nulo quando não há imobiliária ativa (admin da plataforma, por exemplo). */
  plan: sessionPlanSchema.nullable(),
  memberships: z.array(membershipSchema),
  platformAdmin: z.boolean(),
});

export const switchOrgRequestSchema = z.object({ orgId: uuidSchema });
export const switchOrgResponseSchema = z.object({ activeOrg: organizationSchema });

/**
 * Troca e recuperação de senha (auditoria 2026-09-10, P2-04). A recuperação **não envia nada**: a
 * mensagem vai para a caixa de saída local (`email_outbox`).
 */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

/** Trocar a senha encerra as outras sessões; a resposta diz quantas. */
export const changePasswordResponseSchema = z.object({
  ok: z.literal(true),
  revokedSessions: z.number().int().nonnegative(),
});

export const forgotPasswordRequestSchema = z.object({ email: z.email() }).strict();

/** Resposta única: e-mail cadastrado ou não responde igual (sem enumeração de contas). */
export const forgotPasswordResponseSchema = z.object({ ok: z.literal(true) });

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().min(20).max(200),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export const resetPasswordResponseSchema = z.object({
  ok: z.literal(true),
  revokedSessions: z.number().int().nonnegative(),
});
