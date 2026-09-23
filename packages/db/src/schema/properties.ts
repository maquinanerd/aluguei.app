import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, parties } from './index.js';
import { domainCheck } from './checks.js';

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | ARCHIVED (app-level)
    propertyType: text('property_type').notNull(), // vocabulário em properties_property_type_valid
    /** RENT | SALE | BOTH — o imóvel que já existia é de aluguel. */
    purpose: text('purpose').notNull().default('RENT'),
    code: text('code'),
    totalAreaSqm: doublePrecision('total_area_sqm'),
    builtAreaSqm: doublePrecision('built_area_sqm'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    parkingSpots: integer('parking_spots'),
    furnished: boolean('furnished').notNull().default(false),
    petsAllowed: boolean('pets_allowed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('properties_org_idx').on(t.orgId),
    index('properties_org_status_idx').on(t.orgId, t.status),
    uniqueIndex('properties_org_code_unique').on(t.orgId, t.code),
    // Alvo de FK composta: a referência passa a carregar a organização (P0-05).
    unique('properties_org_id_unique').on(t.orgId, t.id),
    domainCheck('properties_status_valid', t.status, ['ACTIVE', 'ARCHIVED']),
    domainCheck('properties_property_type_valid', t.propertyType, [
      'APARTMENT',
      'HOUSE',
      'HOUSE_CONDO',
      'TOWNHOUSE',
      'STUDIO',
      'PENTHOUSE',
      'COMMERCIAL',
      'LAND',
    ]),
    domainCheck('properties_purpose_valid', t.purpose, ['RENT', 'SALE', 'BOTH']),
  ],
);

export const propertyAddresses = pgTable(
  'property_addresses',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    label: text('label'),
    street: text('street'),
    number: text('number'),
    complement: text('complement'),
    neighborhood: text('neighborhood'),
    city: text('city'),
    state: text('state'),
    /**
     * Chaves das URLs do portal (`goiania-go`, `setor-bueno`), calculadas por
     * `citySlug`/`slugifyPlace` do domínio na escrita. Sem elas, a busca por
     * cidade e bairro viraria comparação de texto com acento.
     */
    citySlug: text('city_slug'),
    neighborhoodSlug: text('neighborhood_slug'),
    zipCode: text('zip_code'),
    country: text('country'),
    isPublic: boolean('is_public').notNull().default(false),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('property_addresses_place_idx').on(t.citySlug, t.neighborhoodSlug),
    uniqueIndex('property_addresses_property_public_unique').on(t.propertyId, t.isPublic),
    index('property_addresses_property_idx').on(t.propertyId),
  ],
);

export const propertyFinancialTerms = pgTable(
  'property_financial_terms',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    // Nulo no imóvel só à venda; a regra de quem precisa de quê é do domínio
    // (assertTermsMatchPurpose), porque depende da finalidade, que é da outra tabela.
    monthlyRentCents: integer('monthly_rent_cents'),
    salePriceCents: integer('sale_price_cents'),
    condoFeeCents: integer('condo_fee_cents'),
    iptuCents: integer('iptu_cents'),
    securityDepositCents: integer('security_deposit_cents'),
    minimumLeaseMonths: integer('minimum_lease_months'),
    availableFrom: date('available_from', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('property_financial_terms_property_unique').on(t.propertyId)],
);

export const propertyOwners = pgTable(
  'property_owners',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    ownershipSharePct: integer('ownership_share_pct'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('property_owners_property_party_unique').on(t.propertyId, t.partyId),
    index('property_owners_property_idx').on(t.propertyId),
  ],
);

export const propertyFeatures = pgTable(
  'property_features',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('property_features_property_feature_unique').on(t.propertyId, t.feature),
    index('property_features_property_idx').on(t.propertyId),
  ],
);

export const propertyMedia = pgTable(
  'property_media',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // PHOTO | DOCUMENT | FLOORPLAN
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    isPublic: boolean('is_public').notNull().default(false),
    /** Legenda da foto no portal ("Cozinha", "Suíte"). Sugestão da IA precisa de confirmação. */
    caption: text('caption'),
    /** Ordem na galeria; empate desempata por created_at. */
    sortOrder: integer('sort_order').notNull().default(0),
    /** Foto de capa do anúncio: no máximo uma por imóvel. */
    isCover: boolean('is_cover').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('property_media_property_idx').on(t.propertyId),
    index('property_media_property_order_idx').on(t.propertyId, t.sortOrder),
    uniqueIndex('property_media_cover_unique')
      .on(t.propertyId)
      .where(sql`${t.isCover}`),
    domainCheck('property_media_kind_valid', t.kind, ['PHOTO', 'DOCUMENT', 'FLOORPLAN']),
  ],
);

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('DRAFT'), // DRAFT | READY | PUBLISHED | PAUSED | ARCHIVED
    title: text('title').notNull(),
    description: text('description'),
    slug: text('slug').notNull(),
    /**
     * Slug do portal: único no país inteiro, porque `/imovel/[slug]` não é
     * escopado por imobiliária. Não muda quando o título muda — trocar o
     * endereço de uma página indexada é redirecionar gente e perder histórico.
     */
    publicSlug: text('public_slug').notNull().unique(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('listings_org_slug_unique').on(t.orgId, t.slug),
    index('listings_org_status_idx').on(t.orgId, t.status),
    domainCheck('listings_status_valid', t.status, [
      'DRAFT',
      'READY',
      'PUBLISHED',
      'PAUSED',
      'ARCHIVED',
    ]),
  ],
);
