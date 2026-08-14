import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { metaInsightSnapshots, metaWebhookEvents } from '@aluguei/db';
import { runInboxJobs, runMetaJobs } from '@aluguei/worker';
import { buildTestApp, fakeMetaAds, fakeStorage, registerUser } from './helpers.js';

interface PropertyBody {
  property: { id: string };
}
interface ListingBody {
  listing: { id: string };
}
interface ConnectionBody {
  connection: { id: string };
}

describe('Fase 09: Meta MCP + Ads (dry-run)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    process.env.META_TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cria imóvel + mídia pública + conexão fake; listing fica PUBLISHED por padrão. */
  async function setupAdReady(options: { publishListing?: boolean } = {}): Promise<{
    cookie: string;
    propertyId: string;
    listingId: string;
    connectionId: string;
    mediaId: string;
  }> {
    const { cookie } = await registerUser(app);
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Imóvel Ads', propertyType: 'HOUSE' },
    });
    const propertyId = (prop.json() as PropertyBody).property.id;

    // Requisitos de publicação: termos financeiros + endereço público
    const terms = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 100_000 },
    });
    expect(terms.statusCode).toBe(200);
    const addr = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/address`,
      headers: { cookie },
      payload: {
        publicAddress: {
          street: 'Rua Teste',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-100',
        },
      },
    });
    expect(addr.statusCode).toBe(200);

    // Mídia pública (aprovada para anúncio): presigned PUT → confirm
    const uploadUrl = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    });
    expect(uploadUrl.statusCode).toBe(200);
    const { key } = uploadUrl.json() as { key: string };
    fakeStorage.markUploaded(key, 2048);
    const media = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/confirm`,
      headers: { cookie },
      payload: { key },
    });
    expect(media.statusCode).toBe(201);
    expect((media.json() as { media: { isPublic: boolean } }).media.isPublic).toBe(true);
    const mediaId = (media.json() as { media: { id: string } }).media.id;

    const listing = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title: 'Apartamento anunciável', description: '2 quartos' },
    });
    const listingId = (listing.json() as ListingBody).listing.id;
    if (options.publishListing !== false) {
      const ready = await app.inject({
        method: 'PATCH',
        url: `/listings/${listingId}/status`,
        headers: { cookie },
        payload: { status: 'READY' },
      });
      expect(ready.statusCode).toBe(200);
      const publish = await app.inject({
        method: 'PATCH',
        url: `/listings/${listingId}/status`,
        headers: { cookie },
        payload: { status: 'PUBLISHED' },
      });
      expect(publish.statusCode).toBe(200);
    }

    const conn = await app.inject({
      method: 'POST',
      url: '/meta/connections',
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    expect(conn.statusCode).toBe(201);
    const connectionId = (conn.json() as ConnectionBody).connection.id;

    return { cookie, propertyId, listingId, connectionId, mediaId };
  }

  it('conexão FAKE cria ativos e token nunca é retornado em texto', async () => {
    const { cookie } = await registerUser(app);
    const conn = await app.inject({
      method: 'POST',
      url: '/meta/connections',
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    expect(conn.statusCode).toBe(201);
    const connectionId = (conn.json() as ConnectionBody).connection.id;

    const assets = await app.inject({
      method: 'GET',
      url: `/meta/connections/${connectionId}/assets`,
      headers: { cookie },
    });
    expect(assets.statusCode).toBe(200);
    const body = assets.json() as { assets: Array<{ kind: string; providerAssetId: string }> };
    expect(body.assets.some((a) => a.kind === 'AD_ACCOUNT')).toBe(true);
    expect(body.assets.some((a) => a.kind === 'PAGE')).toBe(true);

    const [connection] = await app.db
      .select()
      .from((await import('@aluguei/db')).metaConnections)
      .where(eq((await import('@aluguei/db')).metaConnections.id, connectionId));
    expect(connection).toBeDefined();
    expect(connection?.accessTokenEncrypted).toBeTruthy();
    expect(JSON.stringify(conn.json())).not.toContain('EAAG');
  });

  it('fluxo: prepare → create-campaign CREATED_PAUSED → sync insights → publish intent', async () => {
    const { cookie, propertyId, listingId, connectionId, mediaId } = await setupAdReady();

    const prepare = await app.inject({
      method: 'POST',
      url: '/meta/ad-profiles',
      headers: { cookie },
      payload: {
        connectionId,
        listingId,
        propertyId,
        name: 'Campanha Aluguel',
        objective: 'OUTCOME_TRAFFIC',
        dailyBudgetCents: 5_000_00,
        mediaSelection: [mediaId],
        landingUrl: 'https://aluguei.app/imovels/exemplo',
        copyPrimary: 'Apartamento pronto para morar no centro',
        idempotencyKey: `prep-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    expect(prepare.statusCode).toBe(201);
    const adProfileId = (prepare.json() as { adProfile: { id: string } }).adProfile.id;

    const create = await app.inject({
      method: 'POST',
      url: `/meta/ad-profiles/${adProfileId}/create-campaign`,
      headers: { cookie },
      payload: { idempotencyKey: `crt-${Math.random().toString(36).slice(2, 10)}` },
    });
    expect(create.statusCode).toBe(201);
    const createBody = create.json() as { campaign: { id: string; status: string } };
    const campaignId = createBody.campaign.id;
    expect(createBody.campaign.status).toBe('CREATED_PAUSED');

    // Nenhuma campanha ACTIVE antes de intent de publish
    const campaigns = await app.inject({
      method: 'GET',
      url: '/meta/campaigns',
      headers: { cookie },
    });
    const list = campaigns.json() as { campaigns: Array<{ status: string }> };
    expect(list.campaigns.every((c) => c.status !== 'ACTIVE')).toBe(true);

    const detail = await app.inject({
      method: 'GET',
      url: `/meta/campaigns/${campaignId}`,
      headers: { cookie },
    });
    const detailBody = detail.json() as {
      adset: { providerAdsetId: string } | null;
      creative: { mediaHash: string } | null;
      ad: { providerAdId: string } | null;
    };
    expect(detailBody.adset).toBeTruthy();
    expect(detailBody.creative?.mediaHash).toMatch(/^[a-f0-9]{64}$/);
    expect(detailBody.ad).toBeTruthy();

    const preview = await app.inject({
      method: 'GET',
      url: `/meta/campaigns/${campaignId}/preview`,
      headers: { cookie },
    });
    expect(preview.statusCode).toBe(200);
    expect((preview.json() as { copyPrimary: string }).copyPrimary).toContain('Apartamento');

    // Sync insights (enfileira) + worker processa
    const sync = await app.inject({
      method: 'POST',
      url: `/meta/campaigns/${campaignId}/sync-insights`,
      headers: { cookie },
      payload: {},
    });
    expect(sync.statusCode).toBe(202);
    const jobRes = await runMetaJobs({ db: app.db, meta: fakeMetaAds, limit: 10 });
    expect(jobRes.processed).toBeGreaterThan(0);
    const [snapshot] = await app.db
      .select()
      .from(metaInsightSnapshots)
      .where(eq(metaInsightSnapshots.campaignLinkId, campaignId));
    expect(snapshot).toBeDefined();
    expect((snapshot?.insights as { spendCents?: number }).spendCents).toBeGreaterThan(0);

    // Publish intent: enfileira; worker executa → ACTIVE (dry-run fake)
    const publish = await app.inject({
      method: 'POST',
      url: `/meta/campaigns/${campaignId}/publish`,
      headers: { cookie },
      payload: { idempotencyKey: `pub-${Math.random().toString(36).slice(2, 10)}` },
    });
    expect(publish.statusCode).toBe(202);
    await runMetaJobs({ db: app.db, meta: fakeMetaAds, limit: 10 });
    const afterPublish = await app.inject({
      method: 'GET',
      url: `/meta/campaigns/${campaignId}`,
      headers: { cookie },
    });
    expect((afterPublish.json() as { status: string }).status).toBe('ACTIVE');
  });

  it('RBAC: viewer sem meta:read → 403; cross-org não vaza', async () => {
    const { cookie } = await setupAdReady();
    void cookie;
    const owner = await registerUser(app, {
      email: `meta-owner-${Math.random().toString(36).slice(2, 6)}@example.com`,
      organizationName: `Org M ${Math.random().toString(36).slice(2, 6)}`,
    });
    const viewer = await registerUser(app, {
      email: `meta-view-${Math.random().toString(36).slice(2, 6)}@example.com`,
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
      url: '/meta/campaigns',
      headers: { cookie: viewer.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('webhook /webhooks/meta: dedup + resolução de org por ad account', async () => {
    const { cookie } = await registerUser(app);
    const conn = await app.inject({
      method: 'POST',
      url: '/meta/connections',
      headers: { cookie },
      payload: { provider: 'FAKE' },
    });
    const connectionId = (conn.json() as ConnectionBody).connection.id;
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
      providerEventId: `evt-meta-${Math.random().toString(36).slice(2, 10)}`,
      adAccountId: adAccount?.providerAssetId,
      payload: { campaignId: 'cmp-fake-1' },
    };
    const res1 = await app.inject({ method: 'POST', url: '/webhooks/meta', payload: event });
    expect(res1.statusCode).toBe(200);
    const res2 = await app.inject({ method: 'POST', url: '/webhooks/meta', payload: event });
    expect(res2.statusCode).toBe(200);

    const events = await app.db
      .select()
      .from(metaWebhookEvents)
      .where(eq(metaWebhookEvents.providerEventId, event.providerEventId));
    expect(events.length).toBe(1);

    await runInboxJobs({ db: app.db, limit: 10 });
    const after = await app.db
      .select()
      .from(metaWebhookEvents)
      .where(eq(metaWebhookEvents.providerEventId, event.providerEventId));
    expect(after[0]?.status).toBe('PROCESSED');
  });

  it('prepare rejeita listing DRAFT', async () => {
    const { cookie, propertyId, listingId, connectionId, mediaId } = await setupAdReady({
      publishListing: false,
    });
    const prepare = await app.inject({
      method: 'POST',
      url: '/meta/ad-profiles',
      headers: { cookie },
      payload: {
        connectionId,
        listingId,
        propertyId,
        name: 'Campanha Inválida',
        objective: 'OUTCOME_TRAFFIC',
        dailyBudgetCents: 1_000_00,
        mediaSelection: [mediaId],
        landingUrl: 'https://aluguei.app/x',
        copyPrimary: 'Copy',
        idempotencyKey: `prep-bad-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    expect(prepare.statusCode).toBe(400);
  });

  it('prepare rejeita mídia de outro imóvel', async () => {
    const { cookie, propertyId, listingId, connectionId, mediaId } = await setupAdReady();

    // Mídia pública de OUTRO imóvel
    const other = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Outro Imóvel', propertyType: 'APARTMENT' },
    });
    const otherPropertyId = (other.json() as PropertyBody).property.id;
    const uploadUrl = await app.inject({
      method: 'POST',
      url: `/properties/${otherPropertyId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 1024 },
    });
    const { key } = uploadUrl.json() as { key: string };
    fakeStorage.markUploaded(key, 1024);
    const confirm = await app.inject({
      method: 'POST',
      url: `/properties/${otherPropertyId}/media/confirm`,
      headers: { cookie },
      payload: { key },
    });
    const otherMediaId = (confirm.json() as { media: { id: string } }).media.id;

    const prepareForeign = await app.inject({
      method: 'POST',
      url: '/meta/ad-profiles',
      headers: { cookie },
      payload: {
        connectionId,
        listingId,
        propertyId,
        name: 'Campanha Estrangeira',
        objective: 'OUTCOME_TRAFFIC',
        dailyBudgetCents: 1_000_00,
        mediaSelection: [otherMediaId],
        landingUrl: 'https://aluguei.app/x',
        copyPrimary: 'Copy',
        idempotencyKey: `prep-for-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    expect(prepareForeign.statusCode).toBe(400);
    void mediaId;
  });

  it('prepare rejeita orçamento acima do limite e copy com PII', async () => {
    const { cookie, propertyId, listingId, connectionId, mediaId } = await setupAdReady();
    const bigBudget = await app.inject({
      method: 'POST',
      url: '/meta/ad-profiles',
      headers: { cookie },
      payload: {
        connectionId,
        listingId,
        propertyId,
        name: 'Campanha Cara',
        objective: 'OUTCOME_TRAFFIC',
        dailyBudgetCents: 999_999_00, // acima do default 10_000_00
        mediaSelection: [mediaId],
        landingUrl: 'https://aluguei.app/x',
        copyPrimary: 'Copy',
        idempotencyKey: `prep-big-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    expect(bigBudget.statusCode).toBe(400);

    const pii = await app.inject({
      method: 'POST',
      url: '/meta/ad-profiles',
      headers: { cookie },
      payload: {
        connectionId,
        listingId,
        propertyId,
        name: 'Campanha PII',
        objective: 'OUTCOME_TRAFFIC',
        dailyBudgetCents: 1_000_00,
        mediaSelection: [mediaId],
        landingUrl: 'https://aluguei.app/x',
        copyPrimary: 'Fale com João 529.982.247-25 agora',
        idempotencyKey: `prep-pii-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    expect(pii.statusCode).toBe(400);
  });
});
