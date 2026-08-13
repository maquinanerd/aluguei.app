import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { memberships, userSessions, users } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import type { Role } from '@aluguei/domain';

export interface AuthUser {
  userId: string;
  orgId: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthUser | null;
  }
}

export interface SessionPluginOptions {
  db: AppDb;
  cookieName: string;
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
 * `Authorization: Bearer <token>` (mobile). Anexa `request.auth` quando válida.
 */
export const sessionPlugin = fp<SessionPluginOptions>((app, opts) => {
  const { db, cookieName } = opts;

  app.decorateRequest('auth', null);

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
    if (!user || user.status !== 'ACTIVE' || !session.activeOrgId) {
      return;
    }

    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.orgId, session.activeOrgId), eq(memberships.userId, session.userId)),
      )
      .limit(1);
    if (!membership) {
      return;
    }

    request.auth = { userId: session.userId, orgId: session.activeOrgId, role: membership.role };
  });

  return Promise.resolve();
});
