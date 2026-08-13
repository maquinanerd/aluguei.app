import { z } from 'zod';
import { roleSchema, uuidSchema } from './common.js';

export const userSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  name: z.string(),
});

export const organizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
});

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
});

export const authSessionSchema = z.object({
  user: userSchema,
  org: organizationSchema,
  membership: membershipSchema,
});

export const registerResponseSchema = authSessionSchema;
export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const loginResponseSchema = authSessionSchema;
export const logoutResponseSchema = z.object({ ok: z.literal(true) });

export const meResponseSchema = z.object({
  user: userSchema,
  activeOrg: organizationSchema.nullable(),
  memberships: z.array(membershipSchema),
});

export const switchOrgRequestSchema = z.object({ orgId: uuidSchema });
export const switchOrgResponseSchema = z.object({ activeOrg: organizationSchema });
