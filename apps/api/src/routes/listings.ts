import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listings,
  properties,
  propertyAddresses,
  propertyFeatures,
  propertyFinancialTerms,
  propertyMedia,
  timelineEvents,
} from '@aluguei/db';
import type { AppDb } from '@aluguei/db';
import {
  AUDIT_ACTIONS,
  DomainError,
  isListingStatus,
  slugify,
  transitionListing,
} from '@aluguei/domain';
import type { ListingStatus } from '@aluguei/domain';
import {
  createListingRequestSchema,
  listingDetailSchema,
  listingSchema,
  listListingsQuerySchema,
  propertyMediaSchema,
  propertySummarySchema,
  updateListingRequestSchema,
  updateListingStatusRequestSchema,
  uuidSchema,
} from '@aluguei/contracts';
import { requireAuth, requirePermission } from '../plugins/authz.js';
import { writeAudit } from '../plugins/audit.js';
import { first } from './helpers.js';

/** Guarda de prontidão: READY exige termos financeiros + endereço público. */
async function assertReadyToPublish(db: AppDb, orgId: string, propertyId: string): Promise<void> {
  const [terms] = await db
    .select()
    .from(propertyFinancialTerms)
    .where(
      and(
        eq(propertyFinancialTerms.propertyId, propertyId),
        eq(propertyFinancialTerms.orgId, orgId),
      ),
    )
    .limit(1);
  const [publicAddress] = await db
    .select()
    .from(propertyAddresses)
    .where(and(eq(propertyAddresses.propertyId, propertyId), eq(propertyAddresses.isPublic, true)))
    .limit(1);
  if (!terms) {
    throw new DomainError(
      'INVALID_INPUT',
      'Defina os termos financeiros (aluguel mensal) antes de publicar',
    );
  }
  if (!publicAddress) {
    throw new DomainError('INVALID_INPUT', 'Defina um endereço público antes de publicar');
  }
}

async function loadListingDetail(db: AppDb, orgId: string, listingId: string): Promise<unknown> {
  const [listing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.orgId, orgId)))
    .limit(1);
  if (!listing) {
    return null;
  }
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
    .select()
    .from(propertyMedia)
    .where(
      and(
        eq(propertyMedia.propertyId, property.id),
        eq(propertyMedia.isPublic, true),
        inArray(propertyMedia.kind, ['PHOTO', 'FLOORPLAN']),
      ),
    );

  return listingDetailSchema.parse({
    id: listing.id,
    orgId: listing.orgId,
    propertyId: listing.propertyId,
    status: listing.status,
    title: listing.title,
    description: listing.description,
    slug: listing.slug,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    property: propertySummarySchema.parse({
      id: property.id,
      orgId: property.orgId,
      title: property.title,
      propertyType: property.propertyType,
      status: property.status,
      totalAreaSqm: property.totalAreaSqm,
      builtAreaSqm: property.builtAreaSqm,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      parkingSpots: property.parkingSpots,
      furnished: property.furnished,
      petsAllowed: property.petsAllowed,
      createdAt: property.createdAt.toISOString(),
      updatedAt: property.updatedAt.toISOString(),
    }),
    publicAddress: publicAddress
      ? {
          neighborhood: publicAddress.neighborhood,
          city: publicAddress.city,
          state: publicAddress.state,
          country: publicAddress.country,
        }
      : null,
    monthlyRentCents: terms?.monthlyRentCents ?? null,
    features: features.map((f) => f.feature),
    publicMedia: media.map((m) =>
      propertyMediaSchema.parse({
        id: m.id,
        kind: m.kind,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        isPublic: m.isPublic,
        createdAt: m.createdAt.toISOString(),
      }),
    ),
  });
}

async function generateUniqueSlug(db: AppDb, orgId: string, base: string): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${String(attempt)}`;
    const [existing] = await db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.orgId, orgId), eq(listings.slug, candidate)))
      .limit(1);
    if (!existing) {
      return candidate;
    }
  }
  throw new DomainError('CONFLICT', 'Não foi possível gerar um slug único');
}

export const listingRoutes: FastifyPluginAsync = (app) => {
  const db = app.db;

  app.post(
    '/listings',
    { onRequest: [requirePermission('listing:write')] },
    async (request, reply) => {
      const auth = requireAuth(request);
      const input = createListingRequestSchema.parse(request.body);

      const [property] = await db

        .select()
        .from(properties)
        .where(and(eq(properties.id, input.propertyId), eq(properties.orgId, auth.orgId)))
        .limit(1);
      if (!property) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const slug = await generateUniqueSlug(db, auth.orgId, slugify(input.title));

      const listing = first(
        await db
          .insert(listings)
          .values({
            orgId: auth.orgId,
            propertyId: input.propertyId,
            title: input.title,
            description: input.description ?? null,
            slug,
          })
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.LISTING_CREATED,
        entityType: 'LISTING',
        entityId: listing.id,
      });

      const detail = await loadListingDetail(db, auth.orgId, listing.id);
      if (!detail) {
        throw new Error('listing not found after insert');
      }
      return reply.status(201).send({ listing: detail });
    },
  );

  app.get('/listings', { onRequest: [requirePermission('listing:read')] }, async (request) => {
    const auth = requireAuth(request);
    const query = listListingsQuerySchema.parse(request.query);
    const where = and(
      eq(listings.orgId, auth.orgId),
      query.status ? eq(listings.status, query.status) : undefined,
    );
    const rows = await db
      .select()
      .from(listings)
      .where(where)
      .orderBy(desc(listings.createdAt))
      .limit(query.limit)
      .offset(query.offset);
    return {
      listings: rows.map((row) =>
        listingSchema.parse({
          id: row.id,
          orgId: row.orgId,
          propertyId: row.propertyId,
          status: row.status,
          title: row.title,
          description: row.description,
          slug: row.slug,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
      total: rows.length,
    };
  });

  app.get('/listings/:id', { onRequest: [requirePermission('listing:read')] }, async (request) => {
    const auth = requireAuth(request);
    const { id } = z.object({ id: uuidSchema }).parse(request.params);
    const detail = await loadListingDetail(db, auth.orgId, id);
    if (!detail) {
      throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
    }
    return { listing: detail };
  });

  app.patch(
    '/listings/:id',
    { onRequest: [requirePermission('listing:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateListingRequestSchema.parse(request.body);

      const [listing] = await db

        .select()
        .from(listings)
        .where(and(eq(listings.id, id), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!listing) {
        throw new DomainError('NOT_FOUND', 'Recurso não encontrado');
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.slug !== undefined) {
        const [dupe] = await db
          .select({ id: listings.id })
          .from(listings)
          .where(and(eq(listings.orgId, auth.orgId), eq(listings.slug, input.slug)))
          .limit(1);
        if (dupe && dupe.id !== listing.id) {
          throw new DomainError('CONFLICT', 'Slug já em uso');
        }
        patch.slug = input.slug;
      }
      if (input.title !== undefined) {
        patch.title = input.title;
      }
      if (input.description !== undefined) {
        patch.description = input.description;
      }
      const updated = first(
        await db
          .update(listings)
          .set(patch as never)
          .where(eq(listings.id, listing.id))
          .returning(),
      );

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.LISTING_UPDATED,
        entityType: 'LISTING',
        entityId: updated.id,
      });

      const detail = await loadListingDetail(db, auth.orgId, updated.id);
      if (!detail) {
        throw new Error('listing not found after update');
      }
      return { listing: detail };
    },
  );

  app.patch(
    '/listings/:id/status',
    { onRequest: [requirePermission('listing:write')] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = z.object({ id: uuidSchema }).parse(request.params);
      const input = updateListingStatusRequestSchema.parse(request.body);

      const [listing] = await db
        .select()
        .from(listings)
        .where(and(eq(listings.id, id), eq(listings.orgId, auth.orgId)))
        .limit(1);
      if (!listing) {
        throw new DomainError('NOT_FOUND', 'Anúncio não encontrado');
      }
      if (!isListingStatus(listing.status)) {
        throw new Error(`listing status inválido: ${listing.status}`);
      }
      if (!isListingStatus(input.status)) {
        throw new DomainError('INVALID_INPUT', 'Status inválido');
      }
      // Guarda de prontidão na transição DRAFT→READY (e republish a partir de PAUSED).
      if ((listing.status === 'DRAFT' || listing.status === 'PAUSED') && input.status === 'READY') {
        await assertReadyToPublish(db, auth.orgId, listing.propertyId);
      }
      const nextStatus = transitionListing(listing.status as ListingStatus, input.status);

      const patch: Record<string, unknown> = { status: nextStatus, updatedAt: new Date() };
      if (nextStatus === 'PUBLISHED' && listing.publishedAt === null) {
        patch.publishedAt = new Date();
      }
      const updated = first(
        await db
          .update(listings)
          .set(patch as never)
          .where(eq(listings.id, listing.id))
          .returning(),
      );

      await db.insert(timelineEvents).values({
        orgId: auth.orgId,
        entityType: 'LISTING',
        entityId: listing.id,
        eventType: 'LISTING_STATUS_CHANGED',
        payload: { from: listing.status, to: nextStatus, reason: input.reason ?? null },
        actorUserId: auth.userId,
      });

      await writeAudit(db, {
        orgId: auth.orgId,
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.LISTING_STATUS_CHANGED,
        entityType: 'LISTING',
        entityId: listing.id,
        payload: { from: listing.status, to: nextStatus },
      });

      const detail = await loadListingDetail(db, auth.orgId, updated.id);
      if (!detail) {
        throw new Error('listing not found after status change');
      }
      return { listing: detail };
    },
  );

  return Promise.resolve();
};

export { assertReadyToPublish, loadListingDetail };
