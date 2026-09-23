import { z } from 'zod';
import { MAX_AMOUNT_CENTS } from './common.js';
import { propertyTypeSchema } from './property.js';
import { publicListingCardSchema, publicSearchPurposeSchema } from './public-search.js';

/**
 * Anúncio, contato e alerta do portal (Onda 2A). Complementa `public-search.ts`.
 * Nada aqui expõe endereço exato, coordenada ou `storage_key`.
 */

export const publicPhotoSchema = z.object({
  /** Caminho no próprio portal (`/public/media/:id`), estável no HTML em cache. */
  path: z.string(),
  caption: z.string().nullable(),
  isCover: z.boolean(),
});

export const publicListingDetailSchema = publicListingCardSchema.extend({
  description: z.string().nullable(),
  features: z.array(z.string()),
  photos: z.array(publicPhotoSchema),
  updatedAt: z.string(),
  /** Mediana do mesmo bairro e finalidade; nula sem amostra (≥5). */
  neighborhoodMedianCents: z.number().int().nullable(),
});

export const publicListingResponseSchema = z.object({
  listing: publicListingDetailSchema,
  /** Slug atual. Diferente do pedido, a página responde 301. */
  canonicalSlug: z.string(),
  /** Outros imóveis no mesmo bairro, para o bloco do fim da página. */
  similar: z.array(publicListingCardSchema),
});

/** Anúncio que saiu do ar: a página responde 410 com alternativas. */
export const publicListingGoneSchema = z.object({
  status: z.literal('REMOVED'),
  reason: z.enum(['UNPUBLISHED', 'RENTED_OR_SOLD']),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  similar: z.array(publicListingCardSchema),
});

const contatoSchema = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .transform((valor) => valor.replace(/\s+/g, ' '));

export const createPublicLeadRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: contatoSchema.optional(),
    email: z.email().max(160).optional(),
    message: z.string().trim().max(800).optional(),
    /** Consentimento LGPD: obrigatório e nunca pré-marcado na tela. */
    consent: z.literal(true),
  })
  .refine((entrada) => entrada.phone !== undefined || entrada.email !== undefined, {
    message: 'Informe telefone ou e-mail para a imobiliária responder',
    path: ['phone'],
  });

export const createPublicLeadResponseSchema = z.object({
  ok: z.literal(true),
  /** Para a tela dizer por onde a resposta vem. */
  contactedBy: z.enum(['PHONE', 'EMAIL']),
});

export const searchAlertContactKindSchema = z.enum(['EMAIL', 'WHATSAPP']);
export const searchAlertStatusSchema = z.enum(['PENDING', 'ACTIVE', 'CANCELED']);

export const createSearchAlertRequestSchema = z.object({
  purpose: publicSearchPurposeSchema,
  city: z
    .string()
    .trim()
    .min(1)
    .max(90)
    .regex(/^[a-z0-9-]+$/),
  neighborhood: z
    .string()
    .trim()
    .max(90)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  propertyType: propertyTypeSchema.optional(),
  bedrooms: z.number().int().min(1).max(6).optional(),
  maxPriceCents: z.number().int().positive().max(MAX_AMOUNT_CENTS).optional(),
  contactKind: searchAlertContactKindSchema,
  contactValue: contatoSchema,
  consent: z.literal(true),
});

export const searchAlertResponseSchema = z.object({ status: searchAlertStatusSchema });

export const searchAlertTokenRequestSchema = z.object({ token: z.string().min(10).max(200) });

/** Uma página de busca que pode ser indexada, para o sitemap. */
export const sitemapPageSchema = z.object({
  path: z.string(),
  count: z.number().int().nonnegative(),
  lastmod: z.string(),
});

export const publicSitemapResponseSchema = z.object({
  /** Recortes com anúncio suficiente para indexar (ADR-099). */
  pages: z.array(sitemapPageSchema),
  /** Anúncios publicados, com a data da última alteração de verdade. */
  listings: z.array(z.object({ path: z.string(), lastmod: z.string() })),
  /** Vitrines de imobiliária com ao menos um anúncio publicado. */
  agencies: z.array(z.object({ path: z.string(), lastmod: z.string() })),
});

export type PublicListingDetail = z.infer<typeof publicListingDetailSchema>;
