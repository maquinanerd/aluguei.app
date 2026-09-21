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

/**
 * Convite de membro por e-mail (auditoria 2026-09-10, P2-04: só existia `userId` de quem já tinha
 * conta). O convite **não é enviado**: a mensagem vai para a caixa de saída local.
 */
export const inviteMemberRequestSchema = z
  .object({
    email: z.email(),
    role: roleSchema,
    name: z.string().min(1).max(120).optional(),
  })
  .strict();

export const memberInviteStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']);

export const memberInviteSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  email: z.email(),
  role: roleSchema,
  status: memberInviteStatusSchema,
  invitedByUserId: uuidSchema.nullable(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const inviteMemberResponseSchema = z.object({ invite: memberInviteSchema });

export const listMemberInvitesResponseSchema = z.object({
  invites: z.array(memberInviteSchema),
});

export const revokeMemberInviteResponseSchema = z.object({ invite: memberInviteSchema });

/** Convite visto por quem recebeu (sem sessão): só o necessário para a tela de aceite. */
export const getMemberInviteResponseSchema = z.object({
  invite: z.object({
    email: z.email(),
    role: roleSchema,
    organizationName: z.string(),
    expiresAt: z.string(),
  }),
});

export const acceptMemberInviteRequestSchema = z
  .object({
    token: z.string().min(20).max(200),
    name: z.string().min(1).max(120),
    password: z.string().min(8).max(128),
  })
  .strict();

export const acceptMemberInviteResponseSchema = z.object({
  membership: membershipSchema,
  created: z.boolean(),
});

/** Caixa de saída local de e-mail da organização (nada é enviado). */
export const emailOutboxMessageSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['PASSWORD_RESET', 'MEMBER_INVITE']),
  toEmail: z.string(),
  subject: z.string(),
  body: z.string(),
  status: z.enum(['QUEUED', 'SENT', 'FAILED']),
  createdAt: z.string(),
});

export const listEmailOutboxResponseSchema = z.object({
  messages: z.array(emailOutboxMessageSchema),
});

export type CreateMemberRequest = z.infer<typeof createMemberRequestSchema>;
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;
export type UserLike = z.infer<typeof userSchema>;
export type MemberInvite = z.infer<typeof memberInviteSchema>;
