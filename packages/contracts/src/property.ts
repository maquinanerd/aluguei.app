import { z } from 'zod';
import {
  amountCentsSchema,
  idListQuerySchema,
  paginationQuerySchema,
  positiveAmountCentsSchema,
  searchTextQuerySchema,
  uuidSchema,
} from './common.js';

/**
 * Tipos de imóvel. Os quatro primeiros já existiam; HOUSE_CONDO, TOWNHOUSE,
 * STUDIO e PENTHOUSE entram com a entrega de design do AchouImóvel, que dá cor e
 * página própria a cada tipo no portal.
 */
export const propertyTypeSchema = z.enum([
  'APARTMENT',
  'HOUSE',
  'HOUSE_CONDO',
  'TOWNHOUSE',
  'STUDIO',
  'PENTHOUSE',
  'COMMERCIAL',
  'LAND',
]);
export const propertyStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
/** Aluguel, venda, ou os dois (o mesmo imóvel pode estar nas duas listas). */
export const propertyPurposeSchema = z.enum(['RENT', 'SALE', 'BOTH']);

export const propertySummarySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  title: z.string(),
  propertyType: propertyTypeSchema,
  purpose: propertyPurposeSchema,
  status: propertyStatusSchema,
  totalAreaSqm: z.number().nullable(),
  builtAreaSqm: z.number().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  parkingSpots: z.number().int().nullable(),
  furnished: z.boolean(),
  petsAllowed: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const propertyAddressSchema = z.object({
  id: uuidSchema,
  label: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  country: z.string().nullable(),
  isPublic: z.boolean(),
});

export const propertyFinancialTermsSchema = z.object({
  /** Nulo no imóvel só à venda. */
  monthlyRentCents: z.number().int().nonnegative().nullable(),
  /** Nulo no imóvel só para alugar. */
  salePriceCents: z.number().int().nonnegative().nullable(),
  /** Calculado a partir do preço e da área; nulo sem área. */
  pricePerSqmCents: z.number().int().nonnegative().nullable(),
  condoFeeCents: z.number().int().nonnegative().nullable(),
  iptuCents: z.number().int().nonnegative().nullable(),
  securityDepositCents: z.number().int().nonnegative().nullable(),
  minimumLeaseMonths: z.number().int().positive().nullable(),
  availableFrom: z.string().nullable(),
});

export const propertyOwnerSchema = z.object({
  partyId: uuidSchema,
  name: z.string(),
  ownershipSharePct: z.number().int().min(0).max(100).nullable(),
});

export const propertyMediaSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['PHOTO', 'DOCUMENT', 'FLOORPLAN']),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  isPublic: z.boolean(),
  /** Legenda que aparece na galeria do portal. */
  caption: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  isCover: z.boolean(),
  createdAt: z.string(),
});

export const propertySchema = z.object({
  ...propertySummarySchema.shape,
  addresses: z.array(propertyAddressSchema),
  financialTerms: propertyFinancialTermsSchema.nullable(),
  owners: z.array(propertyOwnerSchema),
  features: z.array(z.string()),
  media: z.array(propertyMediaSchema),
});

/** Legenda, ordem e capa da foto (etapa 5 do cadastro). */
export const updatePropertyMediaRequestSchema = z
  .object({
    caption: z.string().trim().max(120).nullable(),
    sortOrder: z.number().int().min(0).max(200),
    isCover: z.boolean(),
  })
  .partial();

export const updatePropertyMediaResponseSchema = z.object({ property: propertySchema });

export const createPropertyRequestSchema = z.object({
  title: z.string().min(1).max(200),
  propertyType: propertyTypeSchema,
  /** Omitido, o imóvel nasce de aluguel — como todo imóvel criado até aqui. */
  purpose: propertyPurposeSchema.optional(),
  description: z.string().optional(),
  status: propertyStatusSchema.optional(),
  totalAreaSqm: z.number().positive().optional(),
  builtAreaSqm: z.number().positive().optional(),
  bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().int().nonnegative().optional(),
  parkingSpots: z.number().int().nonnegative().optional(),
  furnished: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
});

export const createPropertyResponseSchema = z.object({ property: propertySchema });

export const listPropertiesQuerySchema = paginationQuerySchema.extend({
  status: propertyStatusSchema.optional(),
  /** Trecho do título, sem diferenciar maiúsculas (combobox de imóvel). */
  q: searchTextQuerySchema,
  /** Ids a resolver para as linhas de uma página. */
  ids: idListQuerySchema.optional(),
});

export const listPropertiesResponseSchema = z.object({
  properties: z.array(propertySummarySchema),
  total: z.number().int().nonnegative(),
});

export const updatePropertyRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  propertyType: propertyTypeSchema.optional(),
  purpose: propertyPurposeSchema.optional(),
  description: z.string().optional(),
  status: propertyStatusSchema.optional(),
  totalAreaSqm: z.number().positive().nullable().optional(),
  builtAreaSqm: z.number().positive().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  parkingSpots: z.number().int().nonnegative().nullable().optional(),
  furnished: z.boolean().optional(),
  petsAllowed: z.boolean().nullable().optional(),
});

export const updatePropertyResponseSchema = z.object({ property: propertySchema });

const addressInputSchema = z.object({
  label: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

export const upsertAddressRequestSchema = z.object({
  privateAddress: addressInputSchema.optional(),
  publicAddress: addressInputSchema.optional(),
});

export const upsertAddressResponseSchema = z.object({ property: propertySchema });

export const upsertFinancialTermsRequestSchema = z.object({
  /** Obrigatório para alugar; ausente no imóvel só à venda (o domínio confere). */
  monthlyRentCents: positiveAmountCentsSchema.optional(),
  /** Obrigatório à venda; ausente no imóvel só para alugar. */
  salePriceCents: positiveAmountCentsSchema.optional(),
  condoFeeCents: amountCentsSchema.optional(),
  iptuCents: amountCentsSchema.optional(),
  securityDepositCents: amountCentsSchema.optional(),
  minimumLeaseMonths: z.number().int().positive().optional(),
  availableFrom: z.string().optional(),
});

export const upsertFinancialTermsResponseSchema = z.object({ property: propertySchema });

export const addOwnerRequestSchema = z.object({
  partyId: uuidSchema,
  ownershipSharePct: z.number().int().min(0).max(100).optional(),
});

export const addOwnerResponseSchema = z.object({ property: propertySchema });

export const addFeatureRequestSchema = z.object({
  feature: z.string().min(1).max(40),
});

export const addFeatureResponseSchema = z.object({ property: propertySchema });

export const okResponseSchema = z.object({ ok: z.literal(true) });
