import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';
import { buildTestApp } from './helpers.js';
import {
  PLATFORM_ADMIN_EMAIL,
  RESERVED_ADMIN_EMAIL,
  call,
  platformAdminSession,
  registerAgency,
} from './platform-fixtures.js';
import type { CallResult, Json, RegisteredAgency } from './platform-fixtures.js';

/**
 * Admin da plataforma (decisão do usuário em 2026-09-15): cadastro aberto de
 * imobiliária que só opera depois de aprovado por um admin da plataforma,
 * planos com limites e sem cobrança, admins definidos pela allowlist
 * `PLATFORM_ADMIN_EMAILS`.
 */

interface PlanBody {
  id: string;
  code: string;
  name: string;
  maxUsers: number | null;
  maxProperties: number | null;
  maxPublishedListings: number | null;
  isActive: boolean;
}

interface OrganizationBody {
  id: string;
  name: string;
  slug: string;
  status: string;
  statusReason: string | null;
  document: string | null;
  phone: string | null;
  creci: string | null;
  plan: { id: string; code: string; name: string };
  owner: { name: string; email: string } | null;
  usage: { users: number; properties: number; publishedListings: number };
  overLimit: string[];
}

function uniq(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Um app por arquivo (buildTestApp guarda a instância): fechado só no fim do arquivo.
let app: FastifyInstance;
let db: AppDb;

beforeAll(async () => {
  app = await buildTestApp();
  db = app.db as AppDb;
});

afterAll(async () => {
  await app.close();
});

async function adminCall(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: object,
): Promise<CallResult> {
  const admin = await platformAdminSession(app);
  return call(app, method, url, {
    cookie: admin.cookie,
    ...(payload !== undefined ? { payload } : {}),
  });
}

describe('Admin da plataforma: cadastro aberto com aprovação', () => {
  async function planByCode(code: string): Promise<PlanBody> {
    const res = await adminCall('GET', '/platform/plans');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const plan = (res.body.plans as PlanBody[]).find((p) => p.code === code);
    if (!plan) {
      throw new Error(`plano ${code} ausente`);
    }
    return plan;
  }

  async function countRows(query: ReturnType<typeof sql>): Promise<number> {
    const result = await db.execute(query);
    return Number((result.rows[0] as { n: number | string }).n);
  }

  it('cadastro aberto cria a imobiliária aguardando aprovação e o painel recusa com ORG_NOT_ACTIVE', async () => {
    const agency = await registerAgency(app);
    expect(agency.org.status).toBe('PENDING_APPROVAL');

    const me = await call(app, 'GET', '/auth/me', { cookie: agency.cookie });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      platformAdmin: false,
      activeOrg: { id: agency.org.id, status: 'PENDING_APPROVAL', statusReason: null },
    });

    const attempts: Array<['GET' | 'POST', string, object | undefined]> = [
      ['GET', '/properties', undefined],
      ['POST', '/properties', { title: 'Casa pendente', propertyType: 'HOUSE' }],
      ['GET', '/dashboard/summary', undefined],
      ['GET', `/organizations/${agency.org.id}/members`, undefined],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await call(app, method, url, {
        cookie: agency.cookie,
        ...(payload !== undefined ? { payload } : {}),
      });
      expect(res.status, `${method} ${url}: ${JSON.stringify(res.body)}`).toBe(403);
      expect(res.body.details).toMatchObject({ reason: 'ORG_NOT_ACTIVE', status: 'PENDING_APPROVAL' });
    }
    expect(
      await countRows(sql`select count(*)::int as n from properties where org_id = ${agency.org.id}`),
    ).toBe(0);
  });

  it('admin da plataforma entra sem imobiliária, vê a fila de pendentes e aprova com plano', async () => {
    const agency = await registerAgency(app, {
      document: '11.222.333/0001-81',
      phone: '(11) 98765-4321',
      creci: 'J-12345',
    });
    const admin = await platformAdminSession(app);

    const me = await call(app, 'GET', '/auth/me', { cookie: admin.cookie });
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body).toMatchObject({
      platformAdmin: true,
      activeOrg: null,
      user: { email: PLATFORM_ADMIN_EMAIL },
    });

    const pending = await adminCall('GET', '/platform/organizations?status=PENDING_APPROVAL');
    expect(pending.status, JSON.stringify(pending.body)).toBe(200);
    const organizations = pending.body.organizations as OrganizationBody[];
    expect(organizations.every((o) => o.status === 'PENDING_APPROVAL')).toBe(true);
    expect(organizations.find((o) => o.id === agency.org.id)).toMatchObject({
      name: agency.org.name,
      document: '11222333000181',
      phone: '11987654321',
      creci: 'J-12345',
      owner: { email: agency.user.email, name: agency.user.name },
      plan: { code: 'ESSENCIAL' },
      usage: { users: 1, properties: 0, publishedListings: 0 },
    });
    expect(pending.body.total).toBeGreaterThanOrEqual(1);

    const search = await adminCall(
      'GET',
      `/platform/organizations?q=${encodeURIComponent(agency.org.name)}`,
    );
    expect((search.body.organizations as OrganizationBody[]).map((o) => o.id)).toEqual([
      agency.org.id,
    ]);

    const plans = await adminCall('GET', '/platform/plans');
    expect((plans.body.plans as PlanBody[]).map((p) => p.code)).toEqual(
      expect.arrayContaining(['ESSENCIAL', 'PROFISSIONAL', 'ILIMITADO']),
    );
    const profissional = await planByCode('PROFISSIONAL');

    const approved = await adminCall('POST', `/platform/organizations/${agency.org.id}/approve`, {
      planId: profissional.id,
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.organization).toMatchObject({
      id: agency.org.id,
      status: 'ACTIVE',
      statusReason: null,
      plan: { code: 'PROFISSIONAL' },
    });

    const properties = await call(app, 'GET', '/properties', { cookie: agency.cookie });
    expect(properties.status).toBe(200);

    const detail = await adminCall('GET', `/platform/organizations/${agency.org.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.organization).toMatchObject({ status: 'ACTIVE' });
    expect(detail.body.members).toEqual([
      expect.objectContaining({ email: agency.user.email, role: 'owner' }),
    ]);
    expect(detail.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'platform.organization.approved',
          actorEmail: PLATFORM_ADMIN_EMAIL,
        }),
      ]),
    );
    expect(
      await countRows(sql`
        select count(*)::int as n from audit_events
        where entity_type = 'ORGANIZATION' and entity_id = ${agency.org.id}
          and action = 'platform.organization.approved' and actor_user_id = ${admin.userId}
      `),
    ).toBe(1);

    const unknown = await adminCall(
      'GET',
      '/platform/organizations/00000000-0000-4000-8000-000000000000',
    );
    expect(unknown.status).toBe(404);
  });

  it('rotas da plataforma exigem sessão (401) e admin da plataforma (403)', async () => {
    const anonymous = await call(app, 'GET', '/platform/organizations');
    expect(anonymous.status).toBe(401);

    const agency = await registerAgency(app);
    const approve = await adminCall('POST', `/platform/organizations/${agency.org.id}/approve`, {});
    expect(approve.status).toBe(200);

    const attempts: Array<['GET' | 'POST', string, object | undefined]> = [
      ['GET', '/platform/organizations', undefined],
      ['GET', `/platform/organizations/${agency.org.id}`, undefined],
      ['GET', '/platform/plans', undefined],
      ['POST', `/platform/organizations/${agency.org.id}/suspend`, { reason: 'tentativa' }],
      ['POST', '/platform/plans', { code: 'INVASOR', name: 'Invasor', maxUsers: null, maxProperties: null, maxPublishedListings: null }],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await call(app, method, url, {
        cookie: agency.cookie,
        ...(payload !== undefined ? { payload } : {}),
      });
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    const stillActive = await adminCall('GET', `/platform/organizations/${agency.org.id}`);
    expect(stillActive.body.organization).toMatchObject({ status: 'ACTIVE' });
  });

  it('recusa e suspensão exigem motivo; suspensa perde o acesso e reativada volta', async () => {
    const rejected = await registerAgency(app);
    const rejectUrl = `/platform/organizations/${rejected.org.id}/reject`;
    expect((await adminCall('POST', rejectUrl, {})).status).toBe(400);
    expect((await adminCall('POST', rejectUrl, { reason: '   ' })).status).toBe(400);
    const reject = await adminCall('POST', rejectUrl, { reason: 'CRECI não confere' });
    expect(reject.status, JSON.stringify(reject.body)).toBe(200);
    expect(reject.body.organization).toMatchObject({
      status: 'REJECTED',
      statusReason: 'CRECI não confere',
    });
    const meRejected = await call(app, 'GET', '/auth/me', { cookie: rejected.cookie });
    expect(meRejected.body.activeOrg).toMatchObject({
      status: 'REJECTED',
      statusReason: 'CRECI não confere',
    });
    expect((await call(app, 'GET', '/properties', { cookie: rejected.cookie })).status).toBe(403);

    const agency: RegisteredAgency = await registerAgency(app);
    const base = `/platform/organizations/${agency.org.id}`;
    const suspendPending = await adminCall('POST', `${base}/suspend`, { reason: 'antes de aprovar' });
    expect(suspendPending.status).toBe(409);
    expect(suspendPending.body.code).toBe('INVALID_TRANSITION');
    expect((await adminCall('POST', `${base}/reactivate`)).status).toBe(409);

    expect((await adminCall('POST', `${base}/approve`, {})).status).toBe(200);
    expect((await adminCall('POST', `${base}/approve`, {})).status).toBe(409);
    expect((await adminCall('POST', `${base}/suspend`, {})).status).toBe(400);

    const suspend = await adminCall('POST', `${base}/suspend`, { reason: 'Uso indevido' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.organization).toMatchObject({
      status: 'SUSPENDED',
      statusReason: 'Uso indevido',
    });
    const blocked = await call(app, 'GET', '/properties', { cookie: agency.cookie });
    expect(blocked.status).toBe(403);
    expect(blocked.body.details).toMatchObject({ reason: 'ORG_NOT_ACTIVE', status: 'SUSPENDED' });

    const reactivate = await adminCall('POST', `${base}/reactivate`);
    expect(reactivate.status, JSON.stringify(reactivate.body)).toBe(200);
    expect(reactivate.body.organization).toMatchObject({ status: 'ACTIVE', statusReason: null });
    expect((await call(app, 'GET', '/properties', { cookie: agency.cookie })).status).toBe(200);

    expect(
      await countRows(sql`
        select count(*)::int as n from audit_events
        where entity_type = 'ORGANIZATION' and entity_id = ${agency.org.id}
          and action in ('platform.organization.approved', 'platform.organization.suspended',
                         'platform.organization.reactivated')
      `),
    ).toBe(3);
  });

  it('e-mail reservado para admin da plataforma não é aceito no cadastro aberto', async () => {
    const res = await call(app, 'POST', '/auth/register', {
      remoteAddress: '10.201.0.1',
      payload: {
        name: 'Tentativa',
        email: 'Reservado@Aluguei.test',
        password: 'senha-segura-123',
        organizationName: `Imobiliária Reservada ${uniq()}`,
      },
    });
    expect(res.status).toBe(409);
    expect(
      await countRows(
        sql`select count(*)::int as n from users where email = ${RESERVED_ADMIN_EMAIL}`,
      ),
    ).toBe(0);
  });

  it('site público só mostra anúncios de imobiliária aprovada', async () => {
    const agency = await registerAgency(app);
    const url = `/public/organizations/${agency.org.slug}/listings`;
    expect((await call(app, 'GET', url)).status).toBe(404);
    expect((await adminCall('POST', `/platform/organizations/${agency.org.id}/approve`, {})).status).toBe(200);
    expect((await call(app, 'GET', url)).status).toBe(200);
  });
});

describe('Planos com limites, sem cobrança', () => {
  async function createPlan(limits: {
    maxUsers?: number | null;
    maxProperties?: number | null;
    maxPublishedListings?: number | null;
  }): Promise<PlanBody> {
    const code = `TESTE_${uniq()}`;
    const res = await adminCall('POST', '/platform/plans', {
      code,
      name: `Plano ${code}`,
      maxUsers: limits.maxUsers ?? null,
      maxProperties: limits.maxProperties ?? null,
      maxPublishedListings: limits.maxPublishedListings ?? null,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.plan as PlanBody;
  }

  async function approvedAgencyOn(plan: PlanBody): Promise<RegisteredAgency> {
    const agency = await registerAgency(app);
    const res = await adminCall('POST', `/platform/organizations/${agency.org.id}/approve`, {
      planId: plan.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return agency;
  }

  async function createProperty(cookie: string): Promise<CallResult> {
    return call(app, 'POST', '/properties', {
      cookie,
      payload: { title: `Imóvel ${uniq()}`, propertyType: 'APARTMENT' },
    });
  }

  async function readyListing(cookie: string): Promise<string> {
    const property = await createProperty(cookie);
    expect(property.status, JSON.stringify(property.body)).toBe(201);
    const propertyId = (property.body.property as { id: string }).id;
    const address = await call(app, 'PUT', `/properties/${propertyId}/address`, {
      cookie,
      payload: {
        privateAddress: { street: 'Rua Privada 1', city: 'São Paulo', state: 'SP' },
        publicAddress: { neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      },
    });
    expect(address.status).toBe(200);
    const terms = await call(app, 'PUT', `/properties/${propertyId}/financial-terms`, {
      cookie,
      payload: { monthlyRentCents: 350000, minimumLeaseMonths: 12 },
    });
    expect(terms.status).toBe(200);
    const listing = await call(app, 'POST', '/listings', {
      cookie,
      payload: { propertyId, title: `Anúncio ${uniq()}` },
    });
    expect(listing.status).toBe(201);
    const listingId = (listing.body.listing as { id: string }).id;
    const ready = await call(app, 'PATCH', `/listings/${listingId}/status`, {
      cookie,
      payload: { status: 'READY' },
    });
    expect(ready.status).toBe(200);
    return listingId;
  }

  function expectLimit(res: CallResult, details: Json): void {
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
    expect(res.body.details).toMatchObject(details);
  }

  it('limite de imóveis do plano bloqueia o cadastro seguinte, sem gravar nada', async () => {
    const plan = await createPlan({ maxProperties: 2 });
    expect(plan).toMatchObject({ maxProperties: 2, maxUsers: null, isActive: true });
    const agency = await approvedAgencyOn(plan);

    expect((await createProperty(agency.cookie)).status).toBe(201);
    expect((await createProperty(agency.cookie)).status).toBe(201);
    expectLimit(await createProperty(agency.cookie), {
      resource: 'properties',
      limit: 2,
      current: 2,
    });
    const rows = await db.execute(
      sql`select count(*)::int as n from properties where org_id = ${agency.org.id}`,
    );
    expect(Number((rows.rows[0] as { n: number }).n)).toBe(2);
  });

  it('limite de usuários do plano bloqueia um novo membro', async () => {
    const plan = await createPlan({ maxUsers: 1 });
    const agency = await approvedAgencyOn(plan);
    const other = await registerAgency(app);

    expectLimit(
      await call(app, 'POST', `/organizations/${agency.org.id}/members`, {
        cookie: agency.cookie,
        payload: { userId: other.user.id, role: 'agent' },
      }),
      { resource: 'users', limit: 1, current: 1 },
    );
  });

  it('limite de anúncios publicados bloqueia a publicação seguinte e libera ao pausar', async () => {
    const plan = await createPlan({ maxPublishedListings: 1 });
    const agency = await approvedAgencyOn(plan);
    const first = await readyListing(agency.cookie);
    const second = await readyListing(agency.cookie);

    const publishFirst = await call(app, 'PATCH', `/listings/${first}/status`, {
      cookie: agency.cookie,
      payload: { status: 'PUBLISHED' },
    });
    expect(publishFirst.status).toBe(200);
    expectLimit(
      await call(app, 'PATCH', `/listings/${second}/status`, {
        cookie: agency.cookie,
        payload: { status: 'PUBLISHED' },
      }),
      { resource: 'publishedListings', limit: 1, current: 1 },
    );
    const stillReady = await call(app, 'GET', `/listings/${second}`, { cookie: agency.cookie });
    expect((stillReady.body.listing as { status: string }).status).toBe('READY');

    const pause = await call(app, 'PATCH', `/listings/${first}/status`, {
      cookie: agency.cookie,
      payload: { status: 'PAUSED' },
    });
    expect(pause.status).toBe(200);
    const publishSecond = await call(app, 'PATCH', `/listings/${second}/status`, {
      cookie: agency.cookie,
      payload: { status: 'PUBLISHED' },
    });
    expect(publishSecond.status, JSON.stringify(publishSecond.body)).toBe(200);
  });

  it('trocar para um plano abaixo do uso é permitido, aparece acima do limite e só bloqueia novos cadastros', async () => {
    const unlimited = (await adminCall('GET', '/platform/plans')).body.plans as PlanBody[];
    const ilimitado = unlimited.find((p) => p.code === 'ILIMITADO');
    if (!ilimitado) {
      throw new Error('plano ILIMITADO ausente');
    }
    const agency = await approvedAgencyOn(ilimitado);
    for (let i = 0; i < 3; i += 1) {
      expect((await createProperty(agency.cookie)).status).toBe(201);
    }

    const small = await createPlan({ maxProperties: 1 });
    const change = await adminCall('PUT', `/platform/organizations/${agency.org.id}/plan`, {
      planId: small.id,
    });
    expect(change.status, JSON.stringify(change.body)).toBe(200);
    expect(change.body.organization).toMatchObject({
      plan: { id: small.id },
      usage: { properties: 3 },
      overLimit: ['properties'],
    });

    expectLimit(await createProperty(agency.cookie), {
      resource: 'properties',
      limit: 1,
      current: 3,
    });
    const list = await call(app, 'GET', '/properties', { cookie: agency.cookie });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(3);
  });

  it('plano desativado continua nas imobiliárias que já o usam, mas não pode ser atribuído', async () => {
    const plan = await createPlan({ maxProperties: 5 });
    const agency = await approvedAgencyOn(plan);

    const deactivate = await adminCall('PATCH', `/platform/plans/${plan.id}`, { isActive: false });
    expect(deactivate.status, JSON.stringify(deactivate.body)).toBe(200);
    expect(deactivate.body.plan).toMatchObject({ isActive: false });

    const pending = await registerAgency(app);
    const assign = await adminCall('POST', `/platform/organizations/${pending.org.id}/approve`, {
      planId: plan.id,
    });
    expect(assign.status).toBe(409);
    const detail = await adminCall('GET', `/platform/organizations/${agency.org.id}`);
    expect(detail.body.organization).toMatchObject({ plan: { id: plan.id } });
  });

  it('valida os limites do plano e o código único', async () => {
    const negative = await adminCall('POST', '/platform/plans', {
      code: `NEG_${uniq()}`,
      name: 'Negativo',
      maxUsers: 0,
      maxProperties: -1,
      maxPublishedListings: null,
    });
    expect(negative.status).toBe(400);
    const plan = await createPlan({ maxUsers: 2 });
    const duplicate = await adminCall('POST', '/platform/plans', {
      code: plan.code,
      name: 'Duplicado',
      maxUsers: null,
      maxProperties: null,
      maxPublishedListings: null,
    });
    expect(duplicate.status).toBe(409);
  });
});
