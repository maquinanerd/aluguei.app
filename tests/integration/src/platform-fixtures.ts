import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { hashPassword } from '@aluguei/domain';

/**
 * Fixtures do admin da plataforma. A conta do admin é gravada direto no banco,
 * como faria o comando de bootstrap no servidor: o cadastro aberto recusa os
 * e-mails reservados em `PLATFORM_ADMIN_EMAILS` (ver `testEnv`).
 */

export const PLATFORM_ADMIN_EMAIL = 'plataforma@aluguei.test';
/** Reservado na allowlist e nunca cadastrado: prova a recusa no cadastro aberto. */
export const RESERVED_ADMIN_EMAIL = 'reservado@aluguei.test';
export const PLATFORM_ADMIN_PASSWORD = 'senha-plataforma-123';

export type Json = Record<string, unknown>;

export interface CallResult {
  status: number;
  body: Json;
}

export interface RegisteredAgency {
  cookie: string;
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; slug: string; status: string };
  membership: { id: string; orgId: string; role: string };
}

export interface PlatformAdminSession {
  cookie: string;
  userId: string;
}

const adminSessions = new WeakMap<FastifyInstance, PlatformAdminSession>();
let registrations = 0;

function cookieFrom(setCookie: string | string[] | undefined): string {
  return Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
}

function parseBody(raw: string): Json {
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return { raw };
  }
}

export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  opts: { cookie?: string; payload?: object; remoteAddress?: string } = {},
): Promise<CallResult> {
  const res = await app.inject({
    method,
    url,
    headers: opts.cookie ? { cookie: opts.cookie } : {},
    ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
    ...(opts.remoteAddress !== undefined ? { remoteAddress: opts.remoteAddress } : {}),
  });
  return { status: res.statusCode, body: parseBody(res.body) };
}

/**
 * Cadastro aberto de uma imobiliária pela API, sem aprovação. Cada chamada usa
 * um IP diferente: `POST /auth/register` tem rate limit por IP (10/min), que é
 * comportamento de produção e fica intacto.
 */
export async function registerAgency(
  app: FastifyInstance,
  extra: Partial<{
    name: string;
    email: string;
    organizationName: string;
    document: string;
    phone: string;
    creci: string;
    requestedPlanCode: string;
  }> = {},
): Promise<RegisteredAgency> {
  registrations += 1;
  const suffix = Math.random().toString(36).slice(2, 10);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    remoteAddress: `10.77.${String((registrations >> 8) & 255)}.${String(registrations & 255)}`,
    payload: {
      name: extra.name ?? 'Responsável Teste',
      email: extra.email ?? `agencia-${suffix}@example.com`,
      password: 'senha-segura-123',
      organizationName: extra.organizationName ?? `Imobiliária ${suffix}`,
      ...(extra.document !== undefined ? { document: extra.document } : {}),
      ...(extra.phone !== undefined ? { phone: extra.phone } : {}),
      ...(extra.creci !== undefined ? { creci: extra.creci } : {}),
      ...(extra.requestedPlanCode !== undefined
        ? { requestedPlanCode: extra.requestedPlanCode }
        : {}),
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`cadastro falhou: ${String(res.statusCode)} ${res.body}`);
  }
  const body = JSON.parse(res.body) as Omit<RegisteredAgency, 'cookie'>;
  return { cookie: cookieFrom(res.headers['set-cookie']), ...body };
}

/** Sessão do admin da plataforma (conta criada uma vez por app, login uma vez). */
export async function platformAdminSession(app: FastifyInstance): Promise<PlatformAdminSession> {
  const cached = adminSessions.get(app);
  if (cached) {
    return cached;
  }
  const db = app.db as AppDb;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PLATFORM_ADMIN_EMAIL))
    .limit(1);
  if (!existing) {
    await db.insert(users).values({
      email: PLATFORM_ADMIN_EMAIL,
      name: 'Admin da Plataforma',
      passwordHash: await hashPassword(PLATFORM_ADMIN_PASSWORD),
    });
  }
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    remoteAddress: '10.250.0.1',
    payload: { email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login do admin da plataforma falhou: ${String(res.statusCode)} ${res.body}`);
  }
  const body = JSON.parse(res.body) as { user: { id: string } };
  const session = { cookie: cookieFrom(res.headers['set-cookie']), userId: body.user.id };
  adminSessions.set(app, session);
  return session;
}

/** Aprova a imobiliária pela API da plataforma (plano opcional, por código). */
export async function approveAgency(
  app: FastifyInstance,
  orgId: string,
  planCode?: string,
): Promise<void> {
  const admin = await platformAdminSession(app);
  let planId: string | undefined;
  if (planCode !== undefined) {
    const plans = await call(app, 'GET', '/platform/plans', { cookie: admin.cookie });
    const plan = (plans.body.plans as Array<{ id: string; code: string }> | undefined)?.find(
      (p) => p.code === planCode,
    );
    if (!plan) {
      throw new Error(`plano ${planCode} não encontrado: ${String(plans.status)}`);
    }
    planId = plan.id;
  }
  const res = await call(app, 'POST', `/platform/organizations/${orgId}/approve`, {
    cookie: admin.cookie,
    payload: planId !== undefined ? { planId } : {},
  });
  if (res.status !== 200) {
    throw new Error(`aprovação falhou: ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
}
