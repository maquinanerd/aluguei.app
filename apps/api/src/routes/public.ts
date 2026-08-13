import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listings,
  organizations,
  properties,
  propertyAddresses,
  propertyFeatures,
  propertyFinancialTerms,
  propertyMedia,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import { DomainError } from '@aluguei/domain';
import {
  listPublicListingsQuerySchema,
  listPublicListingsResponseSchema,
  publicListingSchema,
} from '@aluguei/contracts';
import type { PublicListing } from '@aluguei/contracts';

async function toPublicListing(
  db: AppDb,
  orgSlug: string,
  listing: typeof listings.$inferSelect,
): Promise<PublicListing | null> {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId))
    .limit(1);
  if (!property) {
    return null;
  }
  const [terms] = await db
    .select()
    .from(propertyFinancialTerms)
    .where(eq(propertyFinancialTerms.propertyId, property.id))
    .limit(1);
  const [publicAddress] = await db
    .select()
    .from(propertyAddresses)
    .where(and(eq(propertyAddresses.propertyId, property.id), eq(propertyAddresses.isPublic, true)))
    .limit(1);
  const features = await db
    .select({ feature: propertyFeatures.feature })
    .from(propertyFeatures)
    .where(eq(propertyFeatures.propertyId, property.id));
  const media = await db
    .select({ kind: propertyMedia.kind, isPublic: propertyMedia.isPublic })
    .from(propertyMedia)
    .where(
      and(
        eq(propertyMedia.propertyId, property.id),
        eq(propertyMedia.isPublic, true),
        inArray(propertyMedia.kind, ['PHOTO', 'FLOORPLAN']),
      ),
    );

  return publicListingSchema.parse({
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    status: 'PUBLISHED',
    priceCents: terms?.monthlyRentCents ?? null,
    propertyType: property.propertyType,
    totalAreaSqm: property.totalAreaSqm,
    builtAreaSqm: property.builtAreaSqm,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    parkingSpots: property.parkingSpots,
    furnished: property.furnished,
    petsAllowed: property.petsAllowed,
    features: features.map((f) => f.feature),
    publicAddress: publicAddress
      ? {
          neighborhood: publicAddress.neighborhood,
          city: publicAddress.city,
          state: publicAddress.state,
          country: publicAddress.country,
        }
      : null,
    media: media.map((m) => ({ kind: m.kind, isPublic: m.isPublic })),
    publishedAt: listing.publishedAt?.toISOString() ?? listing.createdAt.toISOString(),
    orgSlug,
  });
}

/** Rotas públicas (site) — apenas listings PUBLICADOS; nunca expõem endereço privado. */
export const publicRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.get('/public/organizations/:orgSlug/listings', async (request) => {
    const { orgSlug } = z.object({ orgSlug: z.string().min(1) }).parse(request.params);
    const query = listPublicListingsQuerySchema.parse(request.query);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);
    if (!org) {
      throw new DomainError('NOT_FOUND', 'Organização não encontrada');
    }
    const rows = await db
      .select()
      .from(listings)
      .where(and(eq(listings.orgId, org.id), eq(listings.status, 'PUBLISHED')))
      .orderBy(desc(listings.publishedAt))
      .limit(query.limit)
      .offset(query.offset);

    const result: PublicListing[] = [];
    for (const row of rows) {
      const item = await toPublicListing(db, orgSlug, row);
      if (item) {
        result.push(item);
      }
    }

    return listPublicListingsResponseSchema.parse({ listings: result, total: result.length });
  });

  app.get('/public/organizations/:orgSlug/listings/:slug', async (request) => {
    const params = z
      .object({ orgSlug: z.string().min(1), slug: z.string().min(1) })
      .parse(request.params);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, params.orgSlug))
      .limit(1);
    if (!org) {
      throw new DomainError('NOT_FOUND', 'Organização não encontrada');
    }
    const [listing] = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.orgId, org.id),
          eq(listings.slug, params.slug),
          eq(listings.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    if (!listing) {
      throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
    }
    const item = await toPublicListing(db, params.orgSlug, listing);
    if (!item) {
      throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
    }
    return item;
  });

  return Promise.resolve();
};
