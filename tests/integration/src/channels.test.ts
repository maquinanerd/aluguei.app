import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AppDb } from '@aluguei/db';
import { channelSyncJobs, listingChannelPublications } from '@aluguei/db';
import { eq } from 'drizzle-orm';
import { runChannelJobs } from '@aluguei/worker/channel-jobs';
import { buildTestApp, fakeChannel, registerUser } from './helpers.js';

interface PropertyBody {
  property: { id: string };
}

interface PublishBody {
  publication: { id: string; status: string; channel: string };
  job: { id: string; status: string };
}

describe('Fase 04: Channel Distribution', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupPublished(
    cookie: string,
    title = 'Apartamento Canal',
  ): Promise<{ listingId: string }> {
    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: { title: 'Imóvel Canal', propertyType: 'APARTMENT', bedrooms: 2 },
    });
    expect(prop.statusCode).toBe(201);
    const propertyId = (prop.json() as PropertyBody).property.id;

    const addr = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/address`,
      headers: { cookie },
      payload: {
        privateAddress: { street: 'Rua Privada', city: 'SP' },
        publicAddress: { neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      },
    });
    expect(addr.statusCode).toBe(200);
    const terms = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 300000 },
    });
    expect(terms.statusCode).toBe(200);

    const listing = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title },
    });
    const listingId = (listing.json() as { listing: { id: string } }).listing.id;
    const ready = await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'READY' },
    });
    expect(ready.statusCode).toBe(200);
    return { listingId };
  }

  it('publish → job roda e publication vira PUBLISHED (worker inline)', async () => {
    const { cookie } = await registerUser(app);
    const { listingId } = await setupPublished(cookie);

    const publish = await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/publish`,
      headers: { cookie },
      payload: {},
    });
    expect(publish.statusCode).toBe(201);
    const pubBody = publish.json() as PublishBody;
    expect(pubBody.publication.status).toBe('PUBLISHING');
    expect(pubBody.job.status).toBe('PENDING');

    await runChannelJobs({
      db: app.db as AppDb,
      adapterFor: (c: string) => (c === 'fake' ? fakeChannel : null),
      limit: 10,
    });

    const list = await app.inject({
      method: 'GET',
      url: `/listings/${listingId}/channels`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const channels = (
      list.json() as { channels: Array<{ status: string; channelListingId: string | null }> }
    ).channels;
    expect(channels[0]?.status).toBe('PUBLISHED');
    expect(channels[0]?.channelListingId).toBeTruthy();
  });

  it('publish duplicado não cria job novo (idempotência por idempotency_key)', async () => {
    const { cookie } = await registerUser(app);
    const { listingId } = await setupPublished(cookie);

    await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/publish`,
      headers: { cookie },
      payload: {},
    });
    const second = await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/publish`,
      headers: { cookie },
      payload: {},
    });
    expect(second.statusCode).toBe(201);

    const rows = await (app.db as AppDb)
      .select()
      .from(channelSyncJobs)
      .where(eq(channelSyncJobs.listingId, listingId));
    expect(rows.length).toBe(1);
  });

  it('remove → publication REMOVED após job', async () => {
    const { cookie } = await registerUser(app);
    const { listingId } = await setupPublished(cookie);
    await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/publish`,
      headers: { cookie },
      payload: {},
    });
    await runChannelJobs({
      db: app.db as AppDb,
      adapterFor: (c: string) => (c === 'fake' ? fakeChannel : null),
      limit: 10,
    });

    const remove = await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/remove`,
      headers: { cookie },
      payload: {},
    });
    expect(remove.statusCode).toBe(200);
    await runChannelJobs({
      db: app.db as AppDb,
      adapterFor: (c: string) => (c === 'fake' ? fakeChannel : null),
      limit: 10,
    });

    const rows = await (app.db as AppDb)
      .select()
      .from(listingChannelPublications)
      .where(eq(listingChannelPublications.listingId, listingId));
    expect(rows[0]?.status).toBe('REMOVED');
  });

  it('import-leads cria party+lead e re-import não duplica party', async () => {
    const { cookie } = await registerUser(app);
    const trigger = await app.inject({
      method: 'POST',
      url: '/channels/fake/import-leads',
      headers: { cookie },
      payload: {},
    });
    expect(trigger.statusCode).toBe(201);
    await runChannelJobs({
      db: app.db as AppDb,
      adapterFor: (c: string) => (c === 'fake' ? fakeChannel : null),
      limit: 10,
    });

    const leads = await app.inject({ method: 'GET', url: '/leads', headers: { cookie } });
    expect(leads.statusCode).toBe(200);
    expect((leads.json() as { leads: unknown[] }).leads.length).toBeGreaterThan(0);

    // Re-import: mesmos referenceIds → mesma party (dedupe), leads podem crescer mas party não.
    await app.inject({
      method: 'POST',
      url: '/channels/fake/import-leads',
      headers: { cookie },
      payload: {},
    });
    await runChannelJobs({
      db: app.db as AppDb,
      adapterFor: (c: string) => (c === 'fake' ? fakeChannel : null),
      limit: 10,
    });
    const parties = await app.inject({ method: 'GET', url: '/parties', headers: { cookie } });
    const partyList = (
      parties.json() as { parties: Array<{ identities: Array<{ kind: string; value: string }> }> }
    ).parties;
    const emails = partyList.flatMap((p) =>
      p.identities.filter((i) => i.kind === 'EMAIL').map((i) => i.value),
    );
    expect(new Set(emails).size).toBe(emails.length); // sem emails duplicados
  });

  it('canal real sem adapter → 404 (nunca inventar endpoints)', async () => {
    const { cookie } = await registerUser(app);
    const { listingId } = await setupPublished(cookie);
    const res = await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/zap/publish`,
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('canal inválido → 400; cross-org → 404', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const { listingId } = await setupPublished(a.cookie);

    const invalid = await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/portal-fake/publish`,
      headers: { cookie: a.cookie },
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);

    const crossOrg = await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/publish`,
      headers: { cookie: b.cookie },
      payload: {},
    });
    expect(crossOrg.statusCode).toBe(404);
  });

  it('summary agrega por canal e por listing', async () => {
    const { cookie } = await registerUser(app);
    const { listingId } = await setupPublished(cookie);
    await app.inject({
      method: 'POST',
      url: `/listings/${listingId}/channels/fake/publish`,
      headers: { cookie },
      payload: {},
    });

    const summary = await app.inject({
      method: 'GET',
      url: '/channels/summary',
      headers: { cookie },
    });
    expect(summary.statusCode).toBe(200);
    const body = summary.json() as {
      channels: Array<{ channel: string; total: number }>;
      listings: unknown[];
    };
    expect(body.channels.some((c) => c.channel === 'fake' && c.total >= 1)).toBe(true);
  });
});
