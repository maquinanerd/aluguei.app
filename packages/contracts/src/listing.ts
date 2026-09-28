import { z } from 'zod';
import { idListQuerySchema, paginationQuerySchema, uuidSchema } from './common.js';
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
  /** Endereço do anúncio no portal (`/imovel/[slug]`), único no país. */
  publicSlug: z.string(),
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
  /** Ids a resolver para as linhas de uma página. */
  ids: idListQuerySchema.optional(),
});

export const listListingsResponseSchema = z.object({
  listings: z.array(listingSchema),
  total: z.number().int().nonnegative(),
});

export const updateListingRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  slug: z.string().min(1).max(120).optional(),
  /**
   * Endereço do anúncio no portal (`/imovel/[slug]`), único no país. Trocar
   * guarda o slug antigo no histórico, e o endereço antigo passa a responder
   * 301 — página indexada não pode virar 404 (ADR-099).
   */
  publicSlug: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Use minúsculas, dígitos e hífen')
    .optional(),
});

export const updateListingResponseSchema = z.object({ listing: listingDetailSchema });

export const updateListingStatusRequestSchema = z.object({
  status: listingStatusSchema,
  reason: z.string().optional(),
});

export const updateListingStatusResponseSchema = z.object({ listing: listingDetailSchema });

/**
 * Prontidão para publicar (Onda 4): o que o diálogo de publicação mostra.
 *
 * Os bloqueios vêm da **mesma função** que o portão do servidor usa. Diálogo
 * que lista bloqueio diferente do que a API recusa é pior do que diálogo
 * nenhum: a pessoa resolve o que a tela pediu e leva o erro assim mesmo.
 */
export const publishBlockerSchema = z.object({
  code: z.enum(['FINANCIAL_TERMS', 'PUBLIC_ADDRESS']),
  label: z.string(),
  /** Seção do cadastro do imóvel onde se resolve. */
  action: z.string(),
});

export const publishReadinessResponseSchema = z.object({
  canPublish: z.boolean(),
  blockers: z.array(publishBlockerSchema),
  channels: z.array(
    z.object({
      channel: z.string(),
      /** Tem adapter configurado; sem isso o canal nem é oferecido (P1-17). */
      available: z.boolean(),
      /** Estado da publicação neste canal, quando já existe. */
      status: z.string().nullable(),
    }),
  ),
});

export type PublishReadinessResponse = z.infer<typeof publishReadinessResponseSchema>;
