import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, fakeStorage, registerUser } from './helpers.js';

interface PartyBody {
  party: { id: string };
}

interface PropertyBody {
  property: { id: string };
}

interface ListingBody {
  id: string;
  status: string;
  slug: string;
}

interface UploadUrlBody {
  url: string;
  key: string;
  expiresIn: number;
}

describe('Fase 03: Properties + Listings', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createOwnerAndProperty(): Promise<{
    cookie: string;
    orgSlug: string;
    propertyId: string;
  }> {
    const { cookie, body } = await registerUser(app, {
      organizationName: `Imob ${Math.random().toString(36).slice(2, 6)}`,
    });
    const party = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Proprietário',
        identities: [{ kind: 'CPF', value: '99988877766' }],
      },
    });
    expect(party.statusCode).toBe(201);
    const partyId = (party.json() as PartyBody).party.id;
    await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: {
        type: 'PERSON',
        name: 'Outro',
        identities: [{ kind: 'EMAIL', value: `p${String(Math.random())}@example.com` }],
      },
    });

    const prop = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie },
      payload: {
        title: 'Apartamento na Paulista',
        propertyType: 'APARTMENT',
        bedrooms: 2,
        furnished: true,
      },
    });
    expect(prop.statusCode).toBe(201);
    const propertyId = (prop.json() as PropertyBody).property.id;

    await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/owners`,
      headers: { cookie },
      payload: { partyId, ownershipSharePct: 100 },
    });
    await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/features`,
      headers: { cookie },
      payload: { feature: 'AC' },
    });
    return { cookie, orgSlug: body.org.slug, propertyId };
  }

  async function makeReadyAndPublished(
    cookie: string,
    propertyId: string,
  ): Promise<{ listingId: string }> {
    await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/address`,
      headers: { cookie },
      payload: {
        privateAddress: { street: 'Rua Privada 1', city: 'São Paulo', state: 'SP' },
        publicAddress: { neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
      },
    });
    await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 350000, minimumLeaseMonths: 12 },
    });
    const listing = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title: 'Apartamento na Paulista' },
    });
    expect(listing.statusCode).toBe(201);
    const listingId = (listing.json() as { listing: ListingBody }).listing.id;

    const ready = await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'READY' },
    });
    expect(ready.statusCode).toBe(200);
    const published = await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'PUBLISHED' },
    });
    expect(published.statusCode).toBe(200);
    return { listingId };
  }

  it('CRUD de property escopado por org', async () => {
    const { cookie, propertyId } = await createOwnerAndProperty();

    const list = await app.inject({ method: 'GET', url: '/properties', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { properties: unknown[] }).properties.length).toBe(1);

    const detail = await app.inject({
      method: 'GET',
      url: `/properties/${propertyId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as { property: { owners: unknown[]; features: string[] } };
    expect(body.property.owners.length).toBe(1);
    expect(body.property.features).toContain('AC');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/properties/${propertyId}`,
      headers: { cookie },
      payload: { petsAllowed: true },
    });
    expect(patch.statusCode).toBe(200);
  });

  it('property de outra org → 404', async () => {
    const a = await createOwnerAndProperty();
    const b = await registerUser(app);
    const detail = await app.inject({
      method: 'GET',
      url: `/properties/${a.propertyId}`,
      headers: { cookie: b.cookie },
    });
    expect(detail.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/properties/${a.propertyId}`,
      headers: { cookie: b.cookie },
      payload: { title: 'Invadido' },
    });
    expect(patch.statusCode).toBe(404);
  });

  it('GET detalhe retorna 200 com address/terms/media presentes (DTO completo)', async () => {
    const { cookie, propertyId } = await createOwnerAndProperty();
    const addr = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/address`,
      headers: { cookie },
      payload: {
        privateAddress: { street: 'Rua Secreta', city: 'SP' },
        publicAddress: { neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
      },
    });
    expect(addr.statusCode).toBe(200);
    const terms = await app.inject({
      method: 'PUT',
      url: `/properties/${propertyId}/financial-terms`,
      headers: { cookie },
      payload: { monthlyRentCents: 100000 },
    });
    expect(terms.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/properties/${propertyId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      property: { addresses: unknown[]; financialTerms: unknown; media: unknown[] };
    };
    expect(body.property.addresses.length).toBe(2);
    expect(body.property.financialTerms).not.toBeNull();
    expect(body.property.media).toEqual([]);
  });

  it('máquina de estado do listing: READY exige termos + endereço público', async () => {
    const { cookie, propertyId } = await createOwnerAndProperty();
    const listing = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title: 'Sem preparo' },
    });
    const listingId = (listing.json() as { listing: ListingBody }).listing.id;

    const ready = await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'READY' },
    });
    expect(ready.statusCode).toBe(400); // sem termos/endereço público

    // Transição inválida direto para PUBLISHED → 409
    const published = await app.inject({
      method: 'PATCH',
      url: `/listings/${listingId}/status`,
      headers: { cookie },
      payload: { status: 'PUBLISHED' },
    });
    expect(published.statusCode).toBe(409);
  });

  it('funil completo do listing até PUBLISHED e site público não vaza endereço privado', async () => {
    const { cookie, orgSlug, propertyId } = await createOwnerAndProperty();
    await makeReadyAndPublished(cookie, propertyId);

    const pubList = await app.inject({
      method: 'GET',
      url: `/public/organizations/${orgSlug}/listings`,
    });
    expect(pubList.statusCode).toBe(200);
    const body = pubList.json() as { listings: Array<Record<string, unknown>> };
    expect(body.listings.length).toBe(1);
    for (const item of body.listings) {
      expect(item['street']).toBeUndefined();
      expect(item['number']).toBeUndefined();
      expect(item['lat']).toBeUndefined();
      expect(item['lng']).toBeUndefined();
      expect(item['status']).toBe('PUBLISHED');
      expect(item['priceCents']).toBe(350000);
    }
  });

  it('slug único por org', async () => {
    const { cookie, propertyId } = await createOwnerAndProperty();
    const l1 = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title: 'Duplicado' },
    });
    const l2 = await app.inject({
      method: 'POST',
      url: '/listings',
      headers: { cookie },
      payload: { propertyId, title: 'Duplicado' },
    });
    expect(l1.statusCode).toBe(201);
    expect(l2.statusCode).toBe(201);
    const slug1 = (l1.json() as { listing: ListingBody }).listing.slug;
    const slug2 = (l2.json() as { listing: ListingBody }).listing.slug;
    expect(slug1).not.toBe(slug2);
  });

  it('media: upload-url → confirm valida storage e RBAC', async () => {
    const { cookie, propertyId } = await createOwnerAndProperty();

    const uploadUrl = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    });
    expect(uploadUrl.statusCode).toBe(200);
    const { key } = uploadUrl.json() as UploadUrlBody;
    fakeStorage.markUploaded(key, 2048);

    const confirm = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/confirm`,
      headers: { cookie },
      payload: { key },
    });
    expect(confirm.statusCode).toBe(201);
    expect((confirm.json() as { media: { isPublic: boolean; kind: string } }).media.isPublic).toBe(
      true,
    );

    // Confirm com key de outra org → 400
    const other = await registerUser(app);
    const otherProp = await app.inject({
      method: 'POST',
      url: '/properties',
      headers: { cookie: other.cookie },
      payload: { title: 'Outro', propertyType: 'HOUSE' },
    });
    const otherId = (otherProp.json() as PropertyBody).property.id;
    const bad = await app.inject({
      method: 'POST',
      url: `/properties/${otherId}/media/confirm`,
      headers: { cookie: other.cookie },
      payload: { key },
    });
    expect(bad.statusCode).toBe(400);

    // upload-url acima do limite → 400
    const tooBig = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 11 * 1024 * 1024 },
    });
    expect(tooBig.statusCode).toBe(400);

    // confirm revalida o tamanho REAL do objeto (presigned PUT não limita upload)
    const small = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/upload-url`,
      headers: { cookie },
      payload: { kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 2048 },
    });
    const smallKey = (small.json() as UploadUrlBody).key;
    fakeStorage.markUploaded(smallKey, 15 * 1024 * 1024); // objeto real muito maior
    const confirmBig = await app.inject({
      method: 'POST',
      url: `/properties/${propertyId}/media/confirm`,
      headers: { cookie },
      payload: { key: smallKey },
    });
    expect(confirmBig.statusCode).toBe(400);
  });
});
