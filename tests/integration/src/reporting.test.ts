import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, registerUser } from './helpers.js';

describe('Fase 10: Reporting (KPIs + exportação segura)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupLead(orgCookie: string): Promise<void> {
    const party = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie: orgCookie },
      payload: {
        type: 'PERSON',
        name: 'Lead Report',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const partyId = (party.json() as { party: { id: string } }).party.id;
    await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie: orgCookie },
      payload: { partyId, source: 'WHATSAPP', notes: 'quer alugar' },
    });
  }

  it('leads-funnel agrega por período/status', async () => {
    const { cookie } = await registerUser(app);
    await setupLead(cookie);
    const funnel = await app.inject({
      method: 'GET',
      url: '/reporting/leads-funnel?periodDays=1',
      headers: { cookie },
    });
    expect(funnel.statusCode).toBe(200);
    const body = funnel.json() as { points: Array<{ status: string; count: number }> };
    const today = new Date().toISOString().slice(0, 10);
    expect(body.points).toContainEqual({ period: today, status: 'NEW', count: 1 });
  });

  it('revenue-monthly usa ledger AGENCY_FEE_REVENUE', async () => {
    const { cookie, body } = await registerUser(app);
    // Ledger revenue entry direto na conta padrão da org
    const { ledgerAccounts, ledgerEntries } = await import('@aluguei/db');
    const { and, eq } = await import('drizzle-orm');
    const accounts = await app.db
      .select()
      .from(ledgerAccounts)
      .where(
        and(eq(ledgerAccounts.code, 'AGENCY_FEE_REVENUE'), eq(ledgerAccounts.orgId, body.org.id)),
      );
    let accountId: string;
    if (accounts.length === 0) {
      const [created] = await app.db
        .insert(ledgerAccounts)
        .values({
          orgId: body.org.id,
          code: 'AGENCY_FEE_REVENUE',
          name: 'Receita',
          type: 'REVENUE',
        })
        .returning();
      accountId = created?.id ?? '';
    } else {
      accountId = accounts[0]?.id ?? '';
    }
    await app.db.insert(ledgerEntries).values({
      orgId: body.org.id,
      transactionId: crypto.randomUUID(),
      accountId,
      amountCents: -5_000_00,
      entryType: 'CREDIT',
      referenceType: 'CHARGE',
      referenceId: 'x',
    });
    const revenue = await app.inject({
      method: 'GET',
      url: '/reporting/revenue-monthly',
      headers: { cookie },
    });
    expect(revenue.statusCode).toBe(200);
    const body2 = revenue.json() as { months: Array<{ month: string; amountCents: number }> };
    const currentMonth = new Date().toISOString().slice(0, 7);
    expect(body2.months).toContainEqual({ month: currentMonth, amountCents: 5_000_00 });
  });

  it('export: RBAC report:export + CSV sem PII + limite', async () => {
    const owner = await registerUser(app, {
      email: `rep-owner-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org R ${Math.random().toString(36).slice(2, 6)}`,
    });
    await setupLead(owner.cookie);

    const csv = await app.inject({
      method: 'GET',
      url: '/reporting/export/leads?format=csv',
      headers: { cookie: owner.cookie },
    });
    expect(csv.statusCode).toBe(200);
    const text = csv.body as string;
    expect(text).toContain('id,status,channel,source,createdAt');
    expect(text.toLowerCase()).not.toContain('email');
    expect(text.toLowerCase()).not.toContain('phone');

    // viewer sem report:export → 403
    const viewer = await registerUser(app, {
      email: `rep-view-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org V ${Math.random().toString(36).slice(2, 6)}`,
    });
    await app.inject({
      method: 'POST',
      url: `/organizations/${owner.body.org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: viewer.body.user.id, role: 'viewer' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/switch-org',
      headers: { cookie: viewer.cookie },
      payload: { orgId: owner.body.org.id },
    });
    const forbidden = await app.inject({
      method: 'GET',
      url: '/reporting/export/leads?format=csv',
      headers: { cookie: viewer.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('export: tipo inválido → 400; maxRows acima do limite → 400', async () => {
    const { cookie } = await registerUser(app);
    const badKind = await app.inject({
      method: 'GET',
      url: '/reporting/export/nope?format=json',
      headers: { cookie },
    });
    expect(badKind.statusCode).toBe(400);
    const tooBig = await app.inject({
      method: 'GET',
      url: '/reporting/export/leads?maxRows=999999',
      headers: { cookie },
    });
    expect(tooBig.statusCode).toBe(400);
  });

  it('payouts listagem agora é paginada', async () => {
    const { cookie } = await registerUser(app);
    const res = await app.inject({
      method: 'GET',
      url: '/payouts?limit=5&offset=0',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { payouts: unknown[]; total: number };
    expect(Array.isArray(body.payouts)).toBe(true);
    expect(typeof body.total).toBe('number');
  });
});
