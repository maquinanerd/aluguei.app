import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { auditEvents, memberships, organizations, userSessions, users } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  hashPassword,
  hashPasswordSync,
  isPlatformAdminEmail,
  normalizeEmail,
  slugify,
  verifyPassword,
} from '@aluguei/domain';
import {
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  switchOrgRequestSchema,
  switchOrgResponseSchema,
} from '@aluguei/contracts';
import { generateSessionToken, hashSessionToken } from '../plugins/session.js';
import { requireSession } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
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
  const { sessionTtlSeconds, cookieSecure, platformAdminEmails } = app.config;

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

    return meResponseSchema.parse({
      user: toUserDto(user),
      activeOrg: activeOrgRow ? toOrgDto(activeOrgRow) : null,
      memberships: userMemberships.map(toMembershipDto),
      platformAdmin: session.platformAdmin,
    });
  });

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
