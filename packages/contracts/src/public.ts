import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

/**
 * Schema público de listing — NUNCA contém endereço privado (street/number/
 * complement/lat/lng) nem mídia não pública. Usado no site público.
 */
export const publicListingSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.literal('PUBLISHED'),
  priceCents: z.number().int().nonnegative().nullable(),
  propertyType: z.string(),
  totalAreaSqm: z.number().nullable(),
  builtAreaSqm: z.number().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  parkingSpots: z.number().int().nullable(),
  furnished: z.boolean(),
  petsAllowed: z.boolean().nullable(),
  features: z.array(z.string()),
  publicAddress: z
    .object({
      neighborhood: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
  media: z.array(
    z.object({
      kind: z.enum(['PHOTO', 'FLOORPLAN']),
      isPublic: z.literal(true),
    }),
  ),
  publishedAt: z.string(),
  orgSlug: z.string(),
});

export const listPublicListingsQuerySchema = paginationQuerySchema;

export const listPublicListingsResponseSchema = z.object({
  listings: z.array(publicListingSchema),
  total: z.number().int().nonnegative(),
});

export type PublicListing = z.infer<typeof publicListingSchema>;
