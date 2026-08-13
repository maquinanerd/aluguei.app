import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';
import { propertyMediaSchema, propertySummarySchema } from './property.js';

export const listingStatusSchema = z.enum(['DRAFT', 'READY', 'PUBLISHED', 'PAUSED', 'ARCHIVED']);

export const listingSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  propertyId: uuidSchema,
  status: listingStatusSchema,
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Listing agregado (uso administrativo) com dados do imóvel e mídia pública. */
export const listingDetailSchema = listingSchema.extend({
  property: propertySummarySchema,
  publicAddress: z
    .object({
      neighborhood: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
  monthlyRentCents: z.number().int().nonnegative().nullable(),
  features: z.array(z.string()),
  publicMedia: z.array(propertyMediaSchema),
});

export const createListingRequestSchema = z.object({
  propertyId: uuidSchema,
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});

export const createListingResponseSchema = z.object({ listing: listingDetailSchema });

export const listListingsQuerySchema = paginationQuerySchema.extend({
  status: listingStatusSchema.optional(),
});

export const listListingsResponseSchema = z.object({
  listings: z.array(listingSchema),
  total: z.number().int().nonnegative(),
});

export const updateListingRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  slug: z.string().min(1).max(120).optional(),
});

export const updateListingResponseSchema = z.object({ listing: listingDetailSchema });

export const updateListingStatusRequestSchema = z.object({
  status: listingStatusSchema,
  reason: z.string().optional(),
});

export const updateListingStatusResponseSchema = z.object({ listing: listingDetailSchema });
