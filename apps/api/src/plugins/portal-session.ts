import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { organizations, portalAccess, portalSessions } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { isOrganizationStatus } from '@aluguei/domain';
import type { OrganizationStatus } from '@aluguei/domain';

export interface PortalAuth {
  partyId: string;
  orgId: string;
  kind: 'LANDLORD' | 'TENANT';
  /** Só ACTIVE opera: `requirePortalAuth` recusa imobiliária suspensa, recusada ou em análise. */
  orgStatus: OrganizationStatus;
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
      .select({ kind: portalAccess.kind, orgStatus: organizations.status })
      .from(portalAccess)
      .innerJoin(organizations, eq(organizations.id, portalAccess.orgId))
      .where(and(eq(portalAccess.id, session.accessId), isNull(portalAccess.revokedAt)))
      .limit(1);
    if (!access) {
      return;
    }
    request.portalAuth = {
      partyId: session.partyId,
      orgId: session.orgId,
      kind: access.kind as 'LANDLORD' | 'TENANT',
      orgStatus: isOrganizationStatus(access.orgStatus) ? access.orgStatus : 'PENDING_APPROVAL',
    };
  });

  return Promise.resolve();
});
