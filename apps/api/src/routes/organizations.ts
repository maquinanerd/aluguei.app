import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  emailOutbox,
  memberInvites,
  memberships,
  organizations,
  userSessions,
  users,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  MEMBER_INVITE_TTL_HOURS,
  assertTokenUsable,
  expiresAt,
  hasPermission,
  hashPassword,
  normalizeEmail,
  tokenUsable,
  type OneTimeToken,
  type Role,
} from '@aluguei/domain';
import {
  uuidSchema,
  acceptMemberInviteRequestSchema,
  acceptMemberInviteResponseSchema,
  createMemberRequestSchema,
  createMemberResponseSchema,
  getMemberInviteResponseSchema,
  inviteMemberRequestSchema,
  inviteMemberResponseSchema,
  listEmailOutboxResponseSchema,
  listMemberInvitesResponseSchema,
  listMembersResponseSchema,
  removeMemberResponseSchema,
  revokeMemberInviteResponseSchema,
  updateMemberRoleRequestSchema,
  updateMemberRoleResponseSchema,
} from '@aluguei/contracts';
import { generateOpaqueToken, hashOpaqueToken, queueEmail } from '../email-outbox.js';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { generateSessionToken, hashSessionToken } from '../plugins/session.js';
import { writeAudit } from '../plugins/audit.js';
import { assertPlanAllowsOneMore } from '../platform/usage.js';
import { first, setAuthCookie, toMembershipDto } from './helpers.js';

/** Convite inexistente, vencido, revogado ou já aceito: sempre a mesma resposta. */
const INVITE_INVALID_MESSAGE = 'Convite inválido ou expirado';

/** Função em português na mensagem do convite (a mesma do painel). */
const ROLE_NAMES: Record<Role, string> = {
  owner: 'Proprietário da conta',
  admin: 'Administrador',
  agent: 'Corretor',
  inspector: 'Vistoriador',
  finance: 'Financeiro',
  viewer: 'Leitura',
};

type MemberInviteRow = typeof memberInvites.$inferSelect;

/**
 * O convite como token de uso único: aceitar é usar. Sem este mapeamento, `accepted_at` ficava
 * de fora e o token de um convite já aceito continuava valendo (o reuso respondia 409 "já é
 * membro" em vez do 404 uniforme, e o convite aceito contava como pendente).
 */
function inviteToken(invite: MemberInviteRow): OneTimeToken {
  return { expiresAt: invite.expiresAt, usedAt: invite.acceptedAt, revokedAt: invite.revokedAt };
}

/** Situação do convite derivada do estado (não existe coluna de status). */
function inviteStatus(invite: MemberInviteRow, now: Date): string {
  if (invite.acceptedAt) {
    return 'ACCEPTED';
  }
  if (invite.revokedAt) {
    return 'REVOKED';
  }
  return invite.expiresAt.getTime() > now.getTime() ? 'PENDING' : 'EXPIRED';
}

function toInviteDto(invite: MemberInviteRow, now: Date): unknown {
  return {
    id: invite.id,
    orgId: invite.orgId,
    email: invite.email,
    role: invite.role,
    status: inviteStatus(invite, now),
    invitedByUserId: invite.invitedByUserId,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

/** Convite pelo token, com a organização. Qualquer problema responde a mesma mensagem. */
async function loadInviteByToken(
  db: AppDb,
  token: string,
): Promise<{ invite: MemberInviteRow; org: typeof organizations.$inferSelect }> {
  const [invite] = await db
    .select()
    .from(memberInvites)
    .where(eq(memberInvites.tokenHash, hashOpaqueToken(token)))
    .limit(1);
  if (!invite) {
    throw new DomainError('NOT_FOUND', INVITE_INVALID_MESSAGE);
  }
  assertTokenUsable(inviteToken(invite), new Date(), INVITE_INVALID_MESSAGE);
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, invite.orgId))
    .limit(1);
  if (!org) {
    throw new DomainError('NOT_FOUND', INVITE_INVALID_MESSAGE);
  }
  return { invite, org };
}

/** Valida que o usuário é membro da org alvo e tem a permissão (404/403 se não). */
async function assertOrgMemberPermission(
  db: AppDb,
  orgId: string,
  userId: string,
  permission: 'member:read' | 'member:manage',
): Promise<void> {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!membership) {
    throw new DomainError('NOT_FOUND', 'Organização não encontrada');
  }
  if (!hasPermission(membership.role, permission)) {
    throw new DomainError('FORBIDDEN', 'Permissão insuficiente');
  }
}

/** Conta membros com role `owner` na org (guarda do último owner). */
async function countOwners(db: AppDb, orgId: string): Promise<number> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  return rows.filter((row) => row.role === 'owner').length;
}

export const organizationRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/organizations/:orgId/members', async (request) => {
    const auth = requireAuth(request);
    const { orgId } = z.object({ orgId: uuidSchema }).parse(request.params);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:read');

    const rows = await db.select().from(memberships).where(eq(memberships.orgId, orgId));
    const userIds = rows.map((r) => r.userId);
    const memberUsers =
      userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const userMap = new Map(memberUsers.map((u) => [u.id, u]));

    return listMembersResponseSchema.parse({
      members: rows.map((row) => {
        const user = userMap.get(row.userId);
        return {
          id: row.id,
          userId: row.userId,
          name: user?.name ?? '?',
          email: user?.email ?? '?',
          role: row.role,
        };
      }),
    });
  });

  app.post('/organizations/:orgId/members', async (request, reply) => {
    const auth = requireAuth(request);
    const { orgId } = z.object({ orgId: uuidSchema }).parse(request.params);
    const input = createMemberRequestSchema.parse(request.body);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');

    const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!targetUser) {
      throw new DomainError('NOT_FOUND', 'Usuário não encontrado');
    }

    const [existing] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, input.userId)))
      .limit(1);
    if (existing) {
      throw new DomainError('CONFLICT', 'Usuário já é membro');
    }

    const membership = await db.transaction(async (tx) => {
      await assertPlanAllowsOneMore(tx, orgId, 'users');
      const created = first(
        await tx
          .insert(memberships)
          .values({ orgId, userId: input.userId, role: input.role })
          .returning(),
      );
      await writeAudit(tx, {
        orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.MEMBER_CREATED,
        entityType: 'MEMBERSHIP',
        entityId: created.id,
        payload: { userId: input.userId, role: input.role },
      });
      return created;
    });

    return reply
      .status(201)
      .send(createMemberResponseSchema.parse({ membership: toMembershipDto(membership) }));
  });

  /**
   * Convite de membro por e-mail (auditoria 2026-09-10, P2-04: antes só existia `userId` de quem
   * já tinha conta). A mensagem vai para a caixa de saída local e **nada é enviado**. Quem já é
   * membro → 409; quem já tem conta aceita com a senha que já usa.
   */
  app.post('/organizations/:orgId/invites', async (request, reply) => {
    const auth = requireAuth(request);
    const { orgId } = z.object({ orgId: uuidSchema }).parse(request.params);
    const input = inviteMemberRequestSchema.parse(request.body);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');
    const email = normalizeEmail(input.email);
    const now = new Date();

    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      const [membership] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, existingUser.id)))
        .limit(1);
      if (membership) {
        throw new DomainError('CONFLICT', 'Usuário já é membro');
      }
    }
    // Convite pendente para o mesmo e-mail → 409 (o anterior precisa ser revogado).
    const pending = await db
      .select()
      .from(memberInvites)
      .where(and(eq(memberInvites.orgId, orgId), eq(memberInvites.email, email)));
    if (pending.some((invite) => tokenUsable(inviteToken(invite), now))) {
      throw new DomainError('CONFLICT', 'Já existe um convite pendente para este e-mail');
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      throw new DomainError('NOT_FOUND', 'Organização não encontrada');
    }

    const token = generateOpaqueToken();
    const invite = await db.transaction(async (tx) => {
      // O limite do plano é conferido no aceite também; aqui evita convite que nunca entraria.
      await assertPlanAllowsOneMore(tx, orgId, 'users');
      const created = first(
        await tx
          .insert(memberInvites)
          .values({
            orgId,
            email,
            role: input.role,
            tokenHash: hashOpaqueToken(token),
            invitedByUserId: auth.userId,
            expiresAt: expiresAt(now, { hours: MEMBER_INVITE_TTL_HOURS }),
          })
          .returning(),
      );
      const link = `${app.config.appBaseUrl}/convite?token=${token}`;
      await queueEmail(tx, {
        orgId,
        kind: 'MEMBER_INVITE',
        toEmail: email,
        subject: `Convite para a equipe de ${org.name} no Aluguei.app`,
        body: [
          input.name ? `Olá, ${input.name}.` : 'Olá.',
          '',
          `Você foi convidado para a equipe de ${org.name} como ${ROLE_NAMES[input.role]}.`,
          `O convite vale por ${String(MEMBER_INVITE_TTL_HOURS)} horas e só pode ser usado uma vez.`,
          '',
          link,
        ].join('\n'),
        relatedEntityType: 'MEMBER_INVITE',
        relatedEntityId: created.id,
        actorUserId: auth.userId,
      });
      await writeAudit(tx, {
        orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.MEMBER_INVITED,
        entityType: 'MEMBER_INVITE',
        entityId: created.id,
        payload: { role: input.role, delivered: false },
      });
      return created;
    });

    return reply
      .status(201)
      .send(inviteMemberResponseSchema.parse({ invite: toInviteDto(invite, new Date()) }));
  });

  app.get('/organizations/:orgId/invites', async (request) => {
    const auth = requireAuth(request);
    const { orgId } = z.object({ orgId: uuidSchema }).parse(request.params);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:read');
    const now = new Date();
    const rows = await db
      .select()
      .from(memberInvites)
      .where(eq(memberInvites.orgId, orgId))
      .orderBy(desc(memberInvites.createdAt))
      .limit(100);
    return listMemberInvitesResponseSchema.parse({
      invites: rows.map((row) => toInviteDto(row, now)),
    });
  });

  app.delete('/organizations/:orgId/invites/:inviteId', async (request) => {
    const auth = requireAuth(request);
    const { orgId, inviteId } = z
      .object({ orgId: uuidSchema, inviteId: uuidSchema })
      .parse(request.params);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');
    const now = new Date();
    const [invite] = await db
      .select()
      .from(memberInvites)
      .where(and(eq(memberInvites.id, inviteId), eq(memberInvites.orgId, orgId)))
      .limit(1);
    if (!invite) {
      throw new DomainError('NOT_FOUND', 'Convite não encontrado');
    }
    if (invite.acceptedAt) {
      throw new DomainError('CONFLICT', 'Convite já aceito');
    }
    const updated = first(
      await db
        .update(memberInvites)
        .set({ revokedAt: invite.revokedAt ?? now, updatedAt: now })
        .where(eq(memberInvites.id, invite.id))
        .returning(),
    );
    await writeAudit(db, {
      orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.MEMBER_INVITE_REVOKED,
      entityType: 'MEMBER_INVITE',
      entityId: invite.id,
      payload: { role: invite.role },
    });
    return revokeMemberInviteResponseSchema.parse({ invite: toInviteDto(updated, now) });
  });

  /**
   * Caixa de saída local da organização (nada é enviado). Só mensagens da própria organização —
   * a recuperação de senha nasce sem organização e nunca aparece aqui.
   */
  app.get('/email-outbox', { onRequest: [requirePermission('org:manage')] }, async (request) => {
    const auth = requireAuth(request);
    const rows = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.orgId, auth.orgId))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(100);
    return listEmailOutboxResponseSchema.parse({
      messages: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        toEmail: row.toEmail,
        subject: row.subject,
        body: row.body,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.patch('/organizations/:orgId/members/:userId', async (request) => {
    const auth = requireAuth(request);
    const { orgId, userId } = z
      .object({ orgId: uuidSchema, userId: uuidSchema })
      .parse(request.params);
    const input = updateMemberRoleRequestSchema.parse(request.body);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
      .limit(1);
    if (!membership) {
      throw new DomainError('NOT_FOUND', 'Membro não encontrado');
    }
    // Guarda do último owner: ninguém rebaixa o último owner da org.
    if (
      membership.role === 'owner' &&
      input.role !== 'owner' &&
      (await countOwners(db, orgId)) <= 1
    ) {
      throw new DomainError('CONFLICT', 'Não é possível rebaixar o último owner');
    }

    const updated = first(
      await db
        .update(memberships)
        .set({ role: input.role as Role, updatedAt: new Date() })
        .where(eq(memberships.id, membership.id))
        .returning(),
    );

    await writeAudit(db, {
      orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      payload: { userId, role: input.role },
    });

    return updateMemberRoleResponseSchema.parse({ membership: toMembershipDto(updated) });
  });

  /**
   * Convite visto por quem recebeu, sem sessão. O token vai no corpo (não na URL) para não
   * aparecer em log de acesso nem no histórico do navegador.
   */
  app.post(
    '/invites/describe',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const input = z
        .object({ token: z.string().min(20).max(200) })
        .strict()
        .parse(request.body);
      const { invite, org } = await loadInviteByToken(db, input.token);
      return getMemberInviteResponseSchema.parse({
        invite: {
          email: invite.email,
          role: invite.role,
          organizationName: org.name,
          expiresAt: invite.expiresAt.toISOString(),
        },
      });
    },
  );

  /**
   * Aceite do convite. Sem conta, cria o usuário com o nome e a senha que a própria pessoa
   * escolhe e abre a sessão; com conta, só acrescenta o vínculo (a senha existente não muda e
   * nenhuma sessão é aberta — a pessoa entra pelo login).
   */
  app.post(
    '/invites/accept',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = acceptMemberInviteRequestSchema.parse(request.body);
      const now = new Date();
      const tokenHash = hashOpaqueToken(input.token);
      const passwordHash = await hashPassword(input.password);

      const result = await db.transaction(async (tx) => {
        const [invite] = await tx
          .select()
          .from(memberInvites)
          .where(eq(memberInvites.tokenHash, tokenHash))
          .for('update');
        if (!invite) {
          throw new DomainError('NOT_FOUND', INVITE_INVALID_MESSAGE);
        }
        assertTokenUsable(inviteToken(invite), now, INVITE_INVALID_MESSAGE);

        const [existing] = await tx
          .select()
          .from(users)
          .where(eq(users.email, invite.email))
          .limit(1);
        const created = !existing;
        const user =
          existing ??
          first(
            await tx
              .insert(users)
              .values({ email: invite.email, passwordHash, name: input.name })
              .returning(),
          );

        const [alreadyMember] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.orgId, invite.orgId), eq(memberships.userId, user.id)))
          .limit(1);
        if (alreadyMember) {
          throw new DomainError('CONFLICT', 'Usuário já é membro');
        }
        await assertPlanAllowsOneMore(tx, invite.orgId, 'users');
        const membership = first(
          await tx
            .insert(memberships)
            .values({ orgId: invite.orgId, userId: user.id, role: invite.role })
            .returning(),
        );
        await tx
          .update(memberInvites)
          .set({ acceptedAt: now, acceptedUserId: user.id, updatedAt: now })
          .where(eq(memberInvites.id, invite.id));
        await writeAudit(tx, {
          orgId: invite.orgId,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.MEMBER_INVITE_ACCEPTED,
          entityType: 'MEMBERSHIP',
          entityId: membership.id,
          payload: { role: invite.role, createdUser: created },
        });

        // Só a conta nova ganha sessão: a senha enviada foi escolhida agora por quem aceitou.
        let token: string | null = null;
        if (created) {
          token = generateSessionToken();
          await tx.insert(userSessions).values({
            userId: user.id,
            tokenHash: hashSessionToken(token),
            activeOrgId: invite.orgId,
            expiresAt: new Date(now.getTime() + app.config.sessionTtlSeconds * 1000),
            userAgent: request.headers['user-agent'],
            ip: request.ip,
          });
        }
        return { membership, created, token };
      });

      if (result.token) {
        setAuthCookie(reply, result.token, app.config.sessionTtlSeconds, app.config.cookieSecure);
      }
      return reply.status(201).send(
        acceptMemberInviteResponseSchema.parse({
          membership: toMembershipDto(result.membership),
          created: result.created,
        }),
      );
    },
  );

  app.delete('/organizations/:orgId/members/:userId', async (request) => {
    const auth = requireAuth(request);
    const { orgId, userId } = z
      .object({ orgId: uuidSchema, userId: uuidSchema })
      .parse(request.params);
    await assertOrgMemberPermission(db, orgId, auth.userId, 'member:manage');

    if (auth.userId === userId) {
      throw new DomainError('CONFLICT', 'Não é possível remover a si mesmo');
    }

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
      .limit(1);
    if (!membership) {
      throw new DomainError('NOT_FOUND', 'Membro não encontrado');
    }
    // Guarda do último owner: ninguém remove o último owner da org.
    if (membership.role === 'owner' && (await countOwners(db, orgId)) <= 1) {
      throw new DomainError('CONFLICT', 'Não é possível remover o último owner');
    }
    await db.delete(memberships).where(eq(memberships.id, membership.id));

    await writeAudit(db, {
      orgId,
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.MEMBER_REMOVED,
      entityType: 'MEMBERSHIP',
      entityId: membership.id,
      payload: { userId },
    });

    return removeMemberResponseSchema.parse({ ok: true });
  });
  return Promise.resolve();
};
