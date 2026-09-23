import { z } from 'zod';
import { MAX_AMOUNT_CENTS, uuidSchema } from './common.js';
import { propertyPurposeSchema, propertyTypeSchema } from './property.js';

/**
 * Busca pública do portal (Onda 2A). É a superfície que sustenta
 * `/alugar/[cidade-uf]/[bairro]/[tipo]/[n]-quartos` e as regras de indexação do
 * ADR-099: a resposta traz a contagem do recorte, a estatística (só com amostra
 * suficiente) e os bairros vizinhos, que é o que faz cada página ser única.
 *
 * Nunca devolve rua, número, complemento, CEP, coordenada nem `storage_key`.
 */

/** A busca é por uma finalidade; imóvel `BOTH` aparece nas duas. */
export const publicSearchPurposeSchema = z.enum(['RENT', 'SALE']);

export const publicSearchOrderSchema = z.enum(['RECENT', 'PRICE_ASC', 'PRICE_DESC']);

const placeSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(90)
  .regex(/^[a-z0-9-]+$/, 'Slug de lugar em minúsculas, dígitos e hífen');

export const publicSearchQuerySchema = z.object({
  purpose: publicSearchPurposeSchema,
  /** Cidade com UF, como na URL: `goiania-go`. */
  city: placeSlugSchema,
  neighborhood: placeSlugSchema.optional(),
  propertyType: propertyTypeSchema.optional(),
  bedrooms: z.coerce.number().int().min(1).max(6).optional(),
  /** Teto do valor total do mês (aluguel) ou do preço (venda). */
  maxPriceCents: z.coerce.number().int().positive().max(MAX_AMOUNT_CENTS).optional(),
  order: publicSearchOrderSchema.default('RECENT'),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

export const publicListingCardSchema = z.object({
  id: uuidSchema,
  /** Slug único no país: `/imovel/[slug]`. */
  slug: z.string(),
  title: z.string(),
  purpose: propertyPurposeSchema,
  propertyType: propertyTypeSchema,
  neighborhood: z.string().nullable(),
  neighborhoodSlug: z.string().nullable(),
  city: z.string().nullable(),
  citySlug: z.string().nullable(),
  state: z.string().nullable(),
  monthlyRentCents: z.number().int().nullable(),
  condoFeeCents: z.number().int().nullable(),
  iptuCents: z.number().int().nullable(),
  /** Aluguel + condomínio + IPTU: é o número em destaque no card. */
  totalMonthlyCents: z.number().int().nullable(),
  salePriceCents: z.number().int().nullable(),
  pricePerSqmCents: z.number().int().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  parkingSpots: z.number().int().nullable(),
  areaSqm: z.number().nullable(),
  photoCount: z.number().int().nonnegative(),
  /** Caminho da foto de capa no próprio portal; nulo quando não há foto pública. */
  coverPath: z.string().nullable(),
  coverCaption: z.string().nullable(),
  publishedAt: z.string(),
  org: z.object({ slug: z.string(), name: z.string(), creci: z.string().nullable() }),
});

export const publicPriceStatsSchema = z.object({
  /** Quantos anúncios entraram na conta. */
  sampleSize: z.number().int().nonnegative(),
  medianCents: z.number().int().nullable(),
  minCents: z.number().int().nullable(),
  maxCents: z.number().int().nullable(),
  byBedrooms: z.array(
    z.object({
      bedrooms: z.number().int(),
      count: z.number().int().nonnegative(),
      medianCents: z.number().int().nullable(),
    }),
  ),
});

export const publicNeighborSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
  medianCents: z.number().int().nullable(),
});

export const publicSearchResponseSchema = z.object({
  items: z.array(publicListingCardSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  /** Nulo abaixo da amostra mínima — o bloco some da tela em vez de mentir. */
  stats: publicPriceStatsSchema.nullable(),
  neighbors: z.array(publicNeighborSchema),
  /** Decisão do domínio (ADR-099): a página entra no índice e no sitemap? */
  indexable: z.boolean(),
  robots: z.enum(['index, follow', 'noindex, follow']),
});

export type PublicListingCard = z.infer<typeof publicListingCardSchema>;
export type PublicSearchResponse = z.infer<typeof publicSearchResponseSchema>;
