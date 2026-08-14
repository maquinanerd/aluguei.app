import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { buildTestApp, registerUser } from './helpers.js';

describe('Fase 11: Hardening (readiness, rate limits, cross-tenant)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health/ready responde 200 com DB up (sem detalhes internos)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; checks: Record<string, string>; service: string };
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual({ db: 'up' });
    expect(body.service).toBe('api');
    expect(JSON.stringify(body)).not.toContain('postgres');
    expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
  });

  it('/health liveness continua disponível', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe('ok');
  });

  it('rate limit de login (10/min) → 429 após estouro', async () => {
    // Consome o limite de login rapidamente (mesmo IP de teste)
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `rate-${String(i)}@example.com`, password: 'senha-errada-1' },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it('cross-tenant: campaign Meta de outra org não vaza', async () => {
    const orgA = await registerUser(app);
    // Cria conexão + campanha na org A via DB seed mínimo (sem provider)
    const { metaConnections, metaCampaignLinks, metaAdProfiles, properties } =
      await import('@aluguei/db');
    const [property] = await app.db
      .insert(properties)
      .values({ orgId: orgA.body.org.id, title: 'Casa Hardening', propertyType: 'HOUSE' })
      .returning();
    const [connection] = await app.db
      .insert(metaConnections)
      .values({ orgId: orgA.body.org.id, status: 'ACTIVE', scopes: [] })
      .returning();
    const [profile] = await app.db
      .insert(metaAdProfiles)
      .values({
        orgId: orgA.body.org.id,
        connectionId: connection?.id ?? '',
        propertyId: property?.id ?? '',
        name: 'Campanha A',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 1_000_00,
        mediaSelection: [],
        landingUrl: 'https://x.app',
        copyPrimary: 'Copy',
        status: 'CREATED',
      })
      .returning();
    await app.db.insert(metaCampaignLinks).values({
      orgId: orgA.body.org.id,
      adProfileId: profile?.id ?? '',
      providerCampaignId: 'cmp_hardening_a',
      name: 'Campanha A',
      objective: 'OUTCOME_TRAFFIC',
      specialAdCategories: ['HOUSING'],
      dailyBudgetCents: 1_000_00,
      status: 'CREATED_PAUSED',
    });

    // Org B lista campanhas → só as dela (vazia)
    const orgB = await registerUser(app);
    const listB = await app.inject({
      method: 'GET',
      url: '/meta/campaigns',
      headers: { cookie: orgB.cookie },
    });
    expect(listB.statusCode).toBe(200);
    const campaignsB = listB.json() as { campaigns: Array<{ name: string }> };
    expect(campaignsB.campaigns.some((c) => c.name === 'Campanha A')).toBe(false);

    // Org B acessa detail de campanha A → 404 (sem enumeração)
    const links = await app.db
      .select()
      .from(metaCampaignLinks)
      .where(and(eq(metaCampaignLinks.orgId, orgA.body.org.id)));
    const campaignId = links[0]?.id ?? '';
    const detailB = await app.inject({
      method: 'GET',
      url: `/meta/campaigns/${campaignId}`,
      headers: { cookie: orgB.cookie },
    });
    expect(detailB.statusCode).toBe(404);
  });

  it('cross-tenant: export de reporting só retorna dados da própria org', async () => {
    const orgA = await registerUser(app);
    const party = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie: orgA.cookie },
      payload: {
        type: 'PERSON',
        name: 'Lead A',
        identities: [{ kind: 'CPF', value: '52998224725' }],
      },
    });
    const partyId = (party.json() as { party: { id: string } }).party.id;
    await app.inject({
      method: 'POST',
      url: '/leads',
      headers: { cookie: orgA.cookie },
      payload: { partyId, source: 'WHATSAPP' },
    });

    const orgB = await registerUser(app);
    const exportB = await app.inject({
      method: 'GET',
      url: '/reporting/export/leads?format=json',
      headers: { cookie: orgB.cookie },
    });
    expect(exportB.statusCode).toBe(200);
    const body = exportB.json() as { rows: Array<{ id: string }>; total: number };
    expect(body.total).toBe(0);
    expect(body.rows.length).toBe(0);
  });

  it('webhook dedup continua idempotente (replay não duplica)', async () => {
    const { cookie } = await registerUser(app);
    const conn = await app.inject({
      method: 'POST',
      url: '/meta/connections',
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    const connectionId = (conn.json() as { connection: { id: string } }).connection.id;
    const assets = await app.inject({
      method: 'GET',
      url: `/meta/connections/${connectionId}/assets`,
      headers: { cookie },
    });
    const adAccount = (
      assets.json() as { assets: Array<{ kind: string; providerAssetId: string }> }
    ).assets.find((a) => a.kind === 'AD_ACCOUNT');
    const event = {
      provider: 'FAKE',
      eventType: 'CAMPAIGN_UPDATE',
      providerEventId: `hardening-evt-${Math.random().toString(36).slice(2, 8)}`,
      adAccountId: adAccount?.providerAssetId,
    };
    const first = await app.inject({ method: 'POST', url: '/webhooks/meta', payload: event });
    const second = await app.inject({ method: 'POST', url: '/webhooks/meta', payload: event });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const { metaWebhookEvents } = await import('@aluguei/db');
    const rows = await app.db
      .select()
      .from(metaWebhookEvents)
      .where(and(eq(metaWebhookEvents.providerEventId, event.providerEventId)));
    expect(rows.length).toBe(1);
  });

  it('webhook WhatsApp: X-Hub-Signature-256 exigida quando META_APP_SECRET configurado', async () => {
    process.env.META_APP_SECRET = 'app-secret-de-teste';
    try {
      const noSignature = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload: { entry: [], object: 'whatsapp_business_account' },
      });
      expect(noSignature.statusCode).toBe(401);

      const { createHmac } = await import('node:crypto');
      const raw = JSON.stringify({ entry: [], object: 'whatsapp_business_account' });
      const signature = `sha256=${createHmac('sha256', 'app-secret-de-teste').update(raw).digest('hex')}`;
      const valid = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': signature },
        payload: { entry: [], object: 'whatsapp_business_account' },
      });
      // payload vazio → sem mensagens → 200 (assinatura válida aceita)
      expect(valid.statusCode).toBe(200);
    } finally {
      delete process.env.META_APP_SECRET;
    }
  });

  it('webhook payments: token ASAAS exigido quando ASAAS_WEBHOOK_TOKEN configurado', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 'token-teste';
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/payments',
        payload: {
          provider: 'FAKE',
          eventType: 'PAYMENT_CONFIRMED',
          providerEventId: `tok-${Math.random().toString(36).slice(2, 8)}`,
          providerChargeId: 'pc.fake.xxxxxxxxxxxx',
          amountCents: 100_000,
          paidAt: '2026-11-05T00:00:00.000Z',
        },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
    }
  });

  it('UPDATE_BUDGET: orçamento acima do teto da org é rejeitado (400)', async () => {
    const { cookie, body } = await registerUser(app);
    // Seed: conexão + adProfile + campanha (caps default: daily max 10_000_00)
    const { metaConnections, metaCampaignLinks, metaAdProfiles, properties } =
      await import('@aluguei/db');
    const [property] = await app.db
      .insert(properties)
      .values({ orgId: body.org.id, title: 'Casa Budget', propertyType: 'HOUSE' })
      .returning();
    const [connection] = await app.db
      .insert(metaConnections)
      .values({ orgId: body.org.id, status: 'ACTIVE', scopes: [] })
      .returning();
    const [profile] = await app.db
      .insert(metaAdProfiles)
      .values({
        orgId: body.org.id,
        connectionId: connection?.id ?? '',
        propertyId: property?.id ?? '',
        name: 'Campanha Budget',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 1_000_00,
        mediaSelection: [],
        landingUrl: 'https://x.app',
        copyPrimary: 'Copy',
        status: 'CREATED',
      })
      .returning();
    const [campaign] = await app.db
      .insert(metaCampaignLinks)
      .values({
        orgId: body.org.id,
        adProfileId: profile?.id ?? '',
        providerCampaignId: 'cmp_budget_test',
        name: 'Campanha Budget',
        objective: 'OUTCOME_TRAFFIC',
        specialAdCategories: ['HOUSING'],
        dailyBudgetCents: 1_000_00,
        status: 'CREATED_PAUSED',
      })
      .returning();

    const overLimit = await app.inject({
      method: 'POST',
      url: `/meta/campaigns/${campaign?.id ?? ''}/budget`,
      headers: { cookie },
      payload: {
        dailyBudgetCents: 99_999_99,
        idempotencyKey: `bgt-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    expect(overLimit.statusCode).toBe(400);

    const within = await app.inject({
      method: 'POST',
      url: `/meta/campaigns/${campaign?.id ?? ''}/budget`,
      headers: { cookie },
      payload: {
        dailyBudgetCents: 5_000_00,
        idempotencyKey: `bgt-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    expect(within.statusCode).toBe(202);
  });
});
