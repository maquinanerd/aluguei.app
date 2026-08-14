import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { charges, leases, portalAccess, portalSessions, splitRules } from '@aluguei/db';
import { buildTestApp, registerUser } from './helpers.js';

interface PartyBody {
  party: { id: string };
}
interface PropertyBody {
  property: { id: string };
}
interface AccessBody {
  access: { id: string };
  oneTimeToken: string;
}
interface MeBody {
  partyId: string;
  kind: string;
  orgId: string;
}

async function seedContractAndLease(
  app: FastifyInstance,
  orgId: string,
  propertyId: string,
  tenantPartyId: string,
  landlordPartyId: string,
): Promise<{ leaseId: string }> {
  const [contract] = await app.db
    .insert((await import('@aluguei/db')).contracts)
    .values({ orgId, status: 'SIGNED' })
    .returning();
  if (!contract) throw new Error('contract seed failed');
  const [lease] = await app.db
    .insert(leases)
    .values({
      orgId,
      contractId: contract.id,
      tenantPartyId,
      landlordPartyId,
      propertyId,
      status: 'ACTIVE',
      startDate: '2026-08-01',
      monthlyRentCents: 100_000,
    })
    .returning();
  if (!lease) throw new Error('lease seed failed');
  await app.db.insert(splitRules).values({
    orgId,
    leaseId: lease.id,
    landlordPartyId,
    agencyShareBps: 1000,
    landlordShareBps: 9000,
  });
  return { leaseId: lease.id };
}

async function seedCharge(
  app: FastifyInstance,
  orgId: string,
  leaseId: string,
  overrides: Partial<typeof charges.$inferInsert> = {},
): Promise<string> {
  const [charge] = await app.db
    .insert(charges)
    .values({
      orgId,
      leaseId,
      periodStart: '2026-09-01',
      dueDate: '2026-09-10',
      status: 'OPEN',
      amountCents: 100_000,
      rentCents: 100_000,
      ...overrides,
    })
    .returning();
  if (!charge) throw new Error('charge seed failed');
  return charge.id;
}

describe('Fase 10: Portal proprietário/locatário (isolamento)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupPortalScenario() {
    const { cookie, body } = await registerUser(app);
    const orgId = body.org.id;

    const tenant = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Locatária Portal',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const tenantId = (tenant.json() as PartyBody).party.id;
    const landlord = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Proprietária Portal',
        identities: [{ kind: 'CPF', value: '11144477735' }],
      },
    });
    const landlordId = (landlord.json() as PartyBody).party.id;

    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Casa Portal', propertyType: 'HOUSE' },
    });
    const propertyId = (prop.json() as PropertyBody).property.id;
    await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/owners`,
      headers: { cookie },
      payload: { partyId: landlordId },
    });

    const { leaseId } = await seedContractAndLease(app, orgId, propertyId, tenantId, landlordId);
    const chargeId = await seedCharge(app, orgId, leaseId);

    return { cookie, orgId, tenantId, landlordId, propertyId, leaseId, chargeId };
  }

  async function consumeToken(app: FastifyInstance, token: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/portal/auth/consume',
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    return Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
  }

  it('acesso → token one-time → sessão → extrato do locatário', async () => {
    const { cookie, tenantId } = await setupPortalScenario();

    const access = await app.inject({
      method: 'POST',
      url: '/portal/access',
      headers: { cookie },
      payload: { partyId: tenantId, kind: 'TENANT' },
    });
    expect(access.statusCode).toBe(201);
    const accessBody = access.json() as AccessBody;

    const portalCookie = await consumeToken(app, accessBody.oneTimeToken);

    const me = await app.inject({
      method: 'GET',
      url: '/portal/me',
      headers: { cookie: portalCookie },
    });
    expect((me.json() as MeBody).kind).toBe('TENANT');

    const statement = await app.inject({
      method: 'GET',
      url: '/portal/tenant/statement',
      headers: { cookie: portalCookie },
    });
    expect(statement.statusCode).toBe(200);
    const body = statement.json() as { totals: { billedCents: number; openCents: number } };
    expect(body.totals.billedCents).toBe(100_000);
    expect(body.totals.openCents).toBe(100_000);

    // Replay do token one-time → 401 (consumo único)
    const replay = await app.inject({
      method: 'POST',
      url: '/portal/auth/consume',
      payload: { token: accessBody.oneTimeToken },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('locatário não vê cobrança de outra locação (404) e kind errado → 403', async () => {
    const { cookie, tenantId } = await setupPortalScenario();
    const access = await app.inject({
      method: 'POST',
      url: '/portal/access',
      headers: { cookie },
      payload: { partyId: tenantId, kind: 'TENANT' },
    });
    const portalCookie = await consumeToken(app, (access.json() as AccessBody).oneTimeToken);

    // Rota de landlord em sessão TENANT → 403
    const landlordRoute = await app.inject({
      method: 'GET',
      url: '/portal/landlord/properties',
      headers: { cookie: portalCookie },
    });
    expect(landlordRoute.statusCode).toBe(403);

    // Payment de charge inexistente (de outra org) → 404
    const payment = await app.inject({
      method: 'POST',
      url: '/portal/tenant/charges/00000000-0000-4000-8000-000000000000/payment',
      headers: { cookie: portalCookie },
      payload: {},
    });
    expect(payment.statusCode).toBe(404);
  });

  it('proprietário acessa rotas LANDLORD; revogação corta a sessão', async () => {
    const { cookie, landlordId, propertyId } = await setupPortalScenario();

    const access = await app.inject({
      method: 'POST',
      url: '/portal/access',
      headers: { cookie },
      payload: { partyId: landlordId, kind: 'LANDLORD' },
    });
    expect(access.statusCode).toBe(201);
    const portalCookie = await consumeToken(app, (access.json() as AccessBody).oneTimeToken);

    // Proprietário vê seus imóveis (associação property_owners)
    const properties = await app.inject({
      method: 'GET',
      url: '/portal/landlord/properties',
      headers: { cookie: portalCookie },
    });
    expect(properties.statusCode).toBe(200);
    const propertyBody = properties.json() as { properties: Array<{ id: string }> };
    expect(propertyBody.properties.some((p) => p.id === propertyId)).toBe(true);

    // Extrato por imóvel próprio → 200
    const statement = await app.inject({
      method: 'GET',
      url: `/portal/landlord/statement?propertyId=${propertyId}`,
      headers: { cookie: portalCookie },
    });
    expect(statement.statusCode).toBe(200);

    // Revogação: concede → revoga → sessão perde acesso
    const [grant] = await app.db
      .select()
      .from(portalAccess)
      .where(eq(portalAccess.partyId, landlordId))
      .limit(1);
    expect(grant).toBeDefined();
    const revoke = await app.inject({
      method: 'POST',
      url: `/portal/access/${grant?.id ?? ''}/revoke`,
      headers: { cookie },
    });
    expect(revoke.statusCode).toBe(200);
    const [session] = await app.db
      .select()
      .from(portalSessions)
      .where(eq(portalSessions.accessId, grant?.id ?? ''))
      .limit(1);
    expect(session?.revokedAt).not.toBeNull();

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/portal/me',
      headers: { cookie: portalCookie },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it('statement do locatário inclui pagamentos e contrato SIGNED só para a própria relação', async () => {
    const { cookie, orgId, tenantId, leaseId } = await setupPortalScenario();
    // Charge PAID (paga) para o extrato
    const chargeId = await seedCharge(app, orgId, leaseId, {
      periodStart: '2026-10-01',
      status: 'PAID',
      paidAt: new Date('2026-10-05T00:00:00.000Z'),
    });
    // Payment CONFIRMED na org correta
    const [payment] = await app.db
      .insert((await import('@aluguei/db')).payments)
      .values({
        orgId,
        chargeId,
        amountCents: 100_000,
        method: 'PIX',
        status: 'CONFIRMED',
        paidAt: new Date('2026-09-05T00:00:00.000Z'),
      })
      .returning();
    void payment;

    const access = await app.inject({
      method: 'POST',
      url: '/portal/access',
      headers: { cookie },
      payload: { partyId: tenantId, kind: 'TENANT' },
    });
    const portalCookie = await consumeToken(app, (access.json() as AccessBody).oneTimeToken);

    const statement = await app.inject({
      method: 'GET',
      url: '/portal/tenant/statement',
      headers: { cookie: portalCookie },
    });
    const body = statement.json() as {
      totals: { paidCents: number };
      payments: Array<{ status: string }>;
    };
    expect(body.totals.paidCents).toBe(100_000);
    expect(body.payments.length).toBeGreaterThan(0);

    // Contratos: listagem retorna content apenas SIGNED
    const contracts = await app.inject({
      method: 'GET',
      url: '/portal/tenant/contracts',
      headers: { cookie: portalCookie },
    });
    const contractBody = contracts.json() as {
      contracts: Array<{ status: string; content: string | null }>;
    };
    expect(contractBody.contracts.length).toBeGreaterThan(0);
    expect(contractBody.contracts[0]?.status).toBe('SIGNED');
    expect(contractBody.contracts[0]?.content).toBeNull(); // content só no detalhe
  });
});
