import { z } from 'zod';
import type { userSchema } from './auth.js';
import { membershipSchema } from './auth.js';
import { roleSchema, uuidSchema } from './common.js';

export const createMemberRequestSchema = z.object({
  userId: uuidSchema,
  role: roleSchema,
});

export const createMemberResponseSchema = z.object({ membership: membershipSchema });

export const listMembersResponseSchema = z.object({
  members: z.array(
    z.object({
      id: uuidSchema,
      userId: uuidSchema,
      name: z.string(),
      email: z.email(),
      role: roleSchema,
    }),
  ),
});

export const updateMemberRoleRequestSchema = z.object({ role: roleSchema });

export const updateMemberRoleResponseSchema = z.object({ membership: membershipSchema });

export const removeMemberResponseSchema = z.object({ ok: z.literal(true) });

export const listMyMembershipsResponseSchema = z.object({
  memberships: z.array(membershipSchema),
});

export const meMembersResponseSchema = z.object({
  members: z.array(
    z.object({ id: uuidSchema, userId: uuidSchema, name: z.string(), role: roleSchema }),
  ),
});

export type CreateMemberRequest = z.infer<typeof createMemberRequestSchema>;
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;
export type UserLike = z.infer<typeof userSchema>;
