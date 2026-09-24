import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  auditEvents,
  memberships,
  organizations,
  passwordResetTokens,
  plans,
  userSessions,
  users,
} from '@aluguei/db';
import type { DbExecutor } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  PASSWORD_RESET_TTL_MINUTES,
  assertNewPassword,
  assertTokenUsable,
  expiresAt,
  hashPassword,
  hashPasswordSync,
  isPlatformAdminEmail,
  normalizeEmail,
  normalizePlanModules,
  slugify,
  verifyPassword,
} from '@aluguei/domain';
import {
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  switchOrgRequestSchema,
  switchOrgResponseSchema,
} from '@aluguei/contracts';
import { generateOpaqueToken, hashOpaqueToken, queueEmail } from '../email-outbox.js';
import { generateSessionToken, hashSessionToken } from '../plugins/session.js';
import { requireSession } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';

/**
 * Encerra as sessões do usuário, menos a atual quando `keepSessionId` vem preenchido. Trocar a
 * senha derruba os outros dispositivos; redefinir por link derruba todos.
 */
async function revokeOtherSessions(
  tx: DbExecutor,
  userId: string,
  keepSessionId: string | null,
): Promise<number> {
  const rows = await tx
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        keepSessionId === null ? undefined : ne(userSessions.id, keepSessionId),
      ),
    )
    .returning({ id: userSessions.id });
  return rows.length;
}
import {
  clearAuthCookie,
  first,
  setAuthCookie,
  toMembershipDto,
  toOrgDto,
  toUserDto,
} from './helpers.js';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

/** Hash dummy pré-computado para uniformizar tempo de login (anti-enumeração). */
const DUMMY_PASSWORD_HASH = hashPasswordSync('dummy-password-for-timing');

const REGISTER_CONFLICT_MESSAGE = 'E-mail ou organização já cadastrados';

export const authRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;
  const { sessionTtlSeconds, cookieSecure, platformAdminEmails, appBaseUrl } = app.config;

  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = registerRequestSchema.parse(request.body);
      const passwordHash = await hashPassword(input.password);
      const email = normalizeEmail(input.email);
      // E-mail de admin da plataforma só ganha conta pelo servidor: a mesma resposta de
      // e-mail já cadastrado, depois do hash, para não virar oráculo da allowlist.
      if (isPlatformAdminEmail(platformAdminEmails, email)) {
        throw new DomainError('CONFLICT', REGISTER_CONFLICT_MESSAGE);
      }
      const slug = slugify(input.organizationName);
      const now = new Date();

      let result:
        { userId: string; orgId: string; membershipId: string; token: string } | undefined;
      try {
        await db.transaction(async (tx) => {
          const user = first(
            await tx.insert(users).values({ email, passwordHash, name: input.name }).returning(),
          );
          // Cadastro aberto: a imobiliária só opera depois da aprovação da plataforma.
          const org = first(
            await tx
              .insert(organizations)
              .values({
                name: input.organizationName,
                slug,
                status: 'PENDING_APPROVAL',
                document: input.document ?? null,
                phone: input.phone ?? null,
                creci: input.creci ?? null,
                // Intenção declarada no cadastro; o plano vigente continua sendo
                // decidido na aprovação (ADR-060).
                requestedPlanCode: input.requestedPlanCode ?? null,
              })
              .returning(),
          );
          const membership = first(
            await tx
              .insert(memberships)
              .values({ orgId: org.id, userId: user.id, role: 'owner' })
              .returning(),
          );

          const token = generateSessionToken();
          await tx.insert(userSessions).values({
            userId: user.id,
            tokenHash: hashSessionToken(token),
            activeOrgId: org.id,
            expiresAt: new Date(now.getTime() + sessionTtlSeconds * 1000),
            userAgent: request.headers['user-agent'],
            ip: request.ip,
          });

          await tx.insert(auditEvents).values({
            orgId: org.id,
            actorUserId: user.id,
            action: AUDIT_ACTIONS.AUTH_REGISTER,
            entityType: 'USER',
            entityId: user.id,
            payload: { email },
          });

          result = { userId: user.id, orgId: org.id, membershipId: membership.id, token };
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DomainError('CONFLICT', REGISTER_CONFLICT_MESSAGE);
        }
        throw err;
      }
      if (!result) {
        throw new Error('register transaction did not complete');
      }

      setAuthCookie(reply, result.token, sessionTtlSeconds, cookieSecure);
      const user = first(await db.select().from(users).where(eq(users.id, result.userId)).limit(1));
      const org = first(
        await db.select().from(organizations).where(eq(organizations.id, result.orgId)).limit(1),
      );
      const membership = first(
        await db.select().from(memberships).where(eq(memberships.id, result.membershipId)).limit(1),
      );
      return reply.status(201).send(
        registerResponseSchema.parse({
          user: toUserDto(user),
          org: toOrgDto(org),
          membership: toMembershipDto(membership),
        }),
      );
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = loginRequestSchema.parse(request.body);
      const email = normalizeEmail(input.email);

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      // Hash dummy: mantém o tempo de resposta uniforme para e-mail inexistente
      // (evita oracle de timing/estado para enumeração de contas).
      const valid = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password);
      if (!user || user.status !== 'ACTIVE' || !valid) {
        throw new DomainError('UNAUTHORIZED', 'Credenciais inválidas');
      }
      const platformAdmin = isPlatformAdminEmail(platformAdminEmails, user.email);

      // Imobiliária que opera primeiro; sem nenhuma, a mais antiga (a tela mostra o status).
      const userOrgs = await db
        .select({ membership: memberships, org: organizations })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.orgId))
        .where(eq(memberships.userId, user.id))
        .orderBy(asc(memberships.createdAt));
      const chosen = userOrgs.find((row) => row.org.status === 'ACTIVE') ?? userOrgs[0];
      if (!chosen && !platformAdmin) {
        throw new DomainError('UNAUTHORIZED', 'Credenciais inválidas');
      }

      const token = generateSessionToken();
      const session = first(
        await db
          .insert(userSessions)
          .values({
            userId: user.id,
            tokenHash: hashSessionToken(token),
            activeOrgId: chosen?.org.id ?? null,
            expiresAt: new Date(Date.now() + sessionTtlSeconds * 1000),
            userAgent: request.headers['user-agent'],
            ip: request.ip,
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: chosen?.org.id ?? null,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.AUTH_LOGIN,
        entityType: 'USER',
        entityId: user.id,
        payload: { sessionId: session.id },
      });

      setAuthCookie(reply, token, sessionTtlSeconds, cookieSecure);

      return reply.send(
        loginResponseSchema.parse({
          user: toUserDto(user),
          org: chosen ? toOrgDto(chosen.org) : null,
          membership: chosen ? toMembershipDto(chosen.membership) : null,
          platformAdmin,
        }),
      );
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const session = requireSession(request);
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userSessions.userId, session.userId),
          session.activeOrgId
            ? eq(userSessions.activeOrgId, session.activeOrgId)
            : isNull(userSessions.activeOrgId),
          isNull(userSessions.revokedAt),
        ),
      );
    await writeAudit(db, {
      orgId: session.activeOrgId,
      actorUserId: session.userId,
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entityType: 'USER',
      entityId: session.userId,
    });
    clearAuthCookie(reply);
    return { ok: true as const };
  });

  app.get('/auth/me', async (request) => {
    const session = requireSession(request);
    const user = first(await db.select().from(users).where(eq(users.id, session.userId)).limit(1));
    const userMemberships = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, session.userId));
    const orgIds = userMemberships.map((m) => m.orgId);
    const orgs =
      orgIds.length > 0
        ? await db.select().from(organizations).where(inArray(organizations.id, orgIds))
        : [];
    const activeOrgRow = orgs.find((o) => o.id === session.activeOrgId);
    // Plano da imobiliária ativa: módulos (cadeado no menu) e limites (tela Plano e uso).
    const [planRow] = activeOrgRow
      ? await db.select().from(plans).where(eq(plans.id, activeOrgRow.planId)).limit(1)
      : [undefined];

    return meResponseSchema.parse({
      user: toUserDto(user),
      activeOrg: activeOrgRow ? toOrgDto(activeOrgRow) : null,
      plan: planRow
        ? {
            id: planRow.id,
            code: planRow.code,
            name: planRow.name,
            modules: normalizePlanModules(planRow.modules),
            monthlyPriceCents: planRow.monthlyPriceCents,
            limits: {
              maxUsers: planRow.maxUsers,
              maxProperties: planRow.maxProperties,
              maxPublishedListings: planRow.maxPublishedListings,
              maxActiveLeases: planRow.maxActiveLeases,
            },
          }
        : null,
      memberships: userMemberships.map(toMembershipDto),
      platformAdmin: session.platformAdmin,
    });
  });

  /**
   * Troca de senha pela própria conta (auditoria 2026-09-10, P2-04). Exige a senha atual e
   * encerra as outras sessões do usuário — a sessão que fez a troca continua valendo.
   */
  app.post(
    '/auth/change-password',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const session = requireSession(request);
      const input = changePasswordRequestSchema.parse(request.body);
      const user = first(
        await db.select().from(users).where(eq(users.id, session.userId)).limit(1),
      );
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new DomainError('UNAUTHORIZED', 'Senha atual incorreta');
      }
      assertNewPassword(input.newPassword, {
        sameAsCurrent: await verifyPassword(user.passwordHash, input.newPassword),
      });
      const passwordHash = await hashPassword(input.newPassword);

      const revoked = await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        const rows = await revokeOtherSessions(tx, user.id, session.sessionId);
        await writeAudit(tx, {
          orgId: session.activeOrgId,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
          entityType: 'USER',
          entityId: user.id,
          payload: { revokedSessions: rows, source: 'account' },
        });
        return rows;
      });

      return changePasswordResponseSchema.parse({ ok: true, revokedSessions: revoked });
    },
  );

  /**
   * Recuperação de senha: grava a mensagem na caixa de saída local e **não envia nada**. A
   * resposta é sempre a mesma, com e-mail cadastrado ou não (sem enumeração de contas).
   */
  app.post(
    '/auth/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const input = forgotPasswordRequestSchema.parse(request.body);
      const email = normalizeEmail(input.email);
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (user && user.status === 'ACTIVE') {
        const token = generateOpaqueToken();
        const now = new Date();
        await db.transaction(async (tx) => {
          // Um pedido novo invalida os anteriores que ainda valiam.
          await tx
            .update(passwordResetTokens)
            .set({ usedAt: now })
            .where(
              and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)),
            );
          await tx.insert(passwordResetTokens).values({
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            requestedIp: request.ip,
            expiresAt: expiresAt(now, { minutes: PASSWORD_RESET_TTL_MINUTES }),
          });
          const link = `${appBaseUrl}/redefinir-senha?token=${token}`;
          await queueEmail(tx, {
            orgId: null, // mensagem de conta: nenhuma imobiliária pode lê-la
            kind: 'PASSWORD_RESET',
            toEmail: user.email,
            subject: 'Redefinir a senha do Aluguei.app',
            body: [
              `Olá, ${user.name}.`,
              '',
              'Para escolher uma senha nova, abra o link abaixo. Ele vale por ' +
                `${String(PASSWORD_RESET_TTL_MINUTES)} minutos e só pode ser usado uma vez.`,
              '',
              link,
              '',
              'Se não foi você que pediu, ignore esta mensagem: a senha atual continua valendo.',
            ].join('\n'),
            relatedEntityType: 'USER',
            relatedEntityId: user.id,
            actorUserId: user.id,
          });
          await writeAudit(tx, {
            orgId: null,
            actorUserId: user.id,
            action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
            entityType: 'USER',
            entityId: user.id,
            payload: { delivered: false },
          });
        });
      }
      return forgotPasswordResponseSchema.parse({ ok: true });
    },
  );

  /** Redefinição com o token de uso único: encerra TODAS as sessões do usuário. */
  app.post(
    '/auth/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const input = resetPasswordRequestSchema.parse(request.body);
      const tokenHash = hashOpaqueToken(input.token);
      const now = new Date();

      const revoked = await db.transaction(async (tx) => {
        const [token] = await tx
          .select()
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.tokenHash, tokenHash))
          .for('update');
        if (!token) {
          throw new DomainError('NOT_FOUND', 'Link de redefinição inválido ou expirado');
        }
        assertTokenUsable(token, now, 'Link de redefinição inválido ou expirado');
        const user = first(
          await tx.select().from(users).where(eq(users.id, token.userId)).limit(1),
        );
        if (user.status !== 'ACTIVE') {
          throw new DomainError('NOT_FOUND', 'Link de redefinição inválido ou expirado');
        }
        assertNewPassword(input.newPassword, {
          sameAsCurrent: await verifyPassword(user.passwordHash, input.newPassword),
        });
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(eq(passwordResetTokens.id, token.id));
        await tx
          .update(users)
          .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: now })
          .where(eq(users.id, user.id));
        // Senha redefinida por link: nenhuma sessão antiga continua (o link pode ter vazado).
        const rows = await revokeOtherSessions(tx, user.id, null);
        await writeAudit(tx, {
          orgId: null,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_COMPLETED,
          entityType: 'USER',
          entityId: user.id,
          payload: { revokedSessions: rows },
        });
        return rows;
      });

      return resetPasswordResponseSchema.parse({ ok: true, revokedSessions: revoked });
    },
  );

  app.post('/auth/switch-org', async (request) => {
    const session = requireSession(request);
    const input = switchOrgRequestSchema.parse(request.body);

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, session.userId)))
      .limit(1);
    const [org] = membership
      ? await db.select().from(organizations).where(eq(organizations.id, membership.orgId)).limit(1)
      : [undefined];
    if (!membership || !org) {
      throw new DomainError('NOT_FOUND', 'Organização não encontrada');
    }

    await db
      .update(userSessions)
      .set({ activeOrgId: input.orgId })
      .where(
        and(
          eq(userSessions.userId, session.userId),
          session.activeOrgId
            ? eq(userSessions.activeOrgId, session.activeOrgId)
            : isNull(userSessions.activeOrgId),
        ),
      );

    await writeAudit(db, {
      orgId: input.orgId,
      actorUserId: session.userId,
      action: AUDIT_ACTIONS.AUTH_SWITCH_ORG,
      entityType: 'USER',
      entityId: session.userId,
    });

    return switchOrgResponseSchema.parse({ activeOrg: toOrgDto(org) });
  });
  return Promise.resolve();
};
