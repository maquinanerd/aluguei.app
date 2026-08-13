import { randomUUID } from 'node:crypto';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, parties } from './index.js';

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
    propertyType: text('property_type').notNull(), // APARTMENT | HOUSE | COMMERCIAL | LAND
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
    zipCode: text('zip_code'),
    country: text('country'),
    isPublic: boolean('is_public').notNull().default(false),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
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
    monthlyRentCents: integer('monthly_rent_cents').notNull(),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('property_media_property_idx').on(t.propertyId)],
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
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('listings_org_slug_unique').on(t.orgId, t.slug),
    index('listings_org_status_idx').on(t.orgId, t.status),
  ],
);
