import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { memberships, organizations, userSessions, users } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { isOrganizationStatus, isPlatformAdminEmail } from '@aluguei/domain';
import type { OrganizationStatus, Role } from '@aluguei/domain';

/** Usuário numa imobiliária (org ativa da sessão). */
export interface AuthUser {
  userId: string;
  orgId: string;
  role: Role;
  /** Só ACTIVE opera: `requireAuth` recusa os demais (admin da plataforma). */
  orgStatus: OrganizationStatus;
}

/** Sessão válida, com ou sem imobiliária ativa. */
export interface SessionUser {
  userId: string;
  email: string;
  sessionId: string;
  activeOrgId: string | null;
  platformAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthUser | null;
    sessionUser: SessionUser | null;
  }
}

export interface SessionPluginOptions {
  db: AppDb;
  cookieName: string;
  platformAdminEmails: ReadonlySet<string>;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(
  reply: FastifyReply,
  cookieName: string,
  token: string,
  ttlSeconds: number,
  secure: boolean,
): void {
  reply.setCookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ttlSeconds,
  });
}

/**
 * Sessão opaca em DB (SHA-256 do token). Aceita cookie HttpOnly ou
 * `Authorization: Bearer <token>` (mobile). Anexa `request.sessionUser` quando a
 * sessão é válida e `request.auth` quando, além disso, há imobiliária ativa com
 * vínculo do usuário. Admin da plataforma vem da allowlist de e-mails.
 */
export const sessionPlugin = fp<SessionPluginOptions>((app, opts) => {
  const { db, cookieName, platformAdminEmails } = opts;

  app.decorateRequest('auth', null);
  app.decorateRequest('sessionUser', null);

  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    let token: string | undefined;
    if (header?.startsWith('Bearer ')) {
      token = header.slice('Bearer '.length);
    } else {
      token = request.cookies[cookieName];
    }
    if (!token) {
      return;
    }

    const tokenHash = hashSessionToken(token);
    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.tokenHash, tokenHash),
          gt(userSessions.expiresAt, new Date()),
          isNull(userSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!session) {
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user || user.status !== 'ACTIVE') {
      return;
    }
    request.sessionUser = {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      activeOrgId: session.activeOrgId,
      platformAdmin: isPlatformAdminEmail(platformAdminEmails, user.email),
    };
    if (!session.activeOrgId) {
      return;
    }

    const [membership] = await db
      .select({ role: memberships.role, orgStatus: organizations.status })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(
        and(eq(memberships.orgId, session.activeOrgId), eq(memberships.userId, session.userId)),
      )
      .limit(1);
    if (!membership) {
      return;
    }

    request.auth = {
      userId: session.userId,
      orgId: session.activeOrgId,
      role: membership.role,
      // Status fora do conhecido não opera (o CHECK do banco já o impede).
      orgStatus: isOrganizationStatus(membership.orgStatus)
        ? membership.orgStatus
        : 'PENDING_APPROVAL',
    };
  });

  return Promise.resolve();
});
