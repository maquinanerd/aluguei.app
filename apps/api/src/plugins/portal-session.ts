import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { portalAccess, portalSessions } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';

export interface PortalAuth {
  partyId: string;
  orgId: string;
  kind: 'LANDLORD' | 'TENANT';
}

declare module 'fastify' {
  interface FastifyRequest {
    portalAuth: PortalAuth | null;
  }
}

export interface PortalSessionPluginOptions {
  db: AppDb;
  cookieName: string;
}

export function generatePortalToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setPortalCookie(
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
 * Sessão opaca do portal externo (SHA-256 do token em portal_sessions).
 * Aceita cookie `aluguei_portal` ou Bearer. Anexa `request.portalAuth`
 * quando a sessão E a concessão (portal_access) estão ativas.
 */
export const portalSessionPlugin = fp<PortalSessionPluginOptions>((app, opts) => {
  const { db, cookieName } = opts;

  app.decorateRequest('portalAuth', null);

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

    const tokenHash = hashPortalToken(token);
    const [session] = await db
      .select()
      .from(portalSessions)
      .where(
        and(
          eq(portalSessions.tokenHash, tokenHash),
          gt(portalSessions.expiresAt, new Date()),
          isNull(portalSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!session) {
      return;
    }
    const [access] = await db
      .select()
      .from(portalAccess)
      .where(and(eq(portalAccess.id, session.accessId), isNull(portalAccess.revokedAt)))
      .limit(1);
    if (!access) {
      return;
    }
    request.portalAuth = {
      partyId: session.partyId,
      orgId: session.orgId,
      kind: access.kind as 'LANDLORD' | 'TENANT',
    };
  });

  return Promise.resolve();
});
