import { randomUUID } from 'node:crypto';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './identity.js';
import { listings, properties } from './properties.js';

/** Conexão Meta da organização (segredo criptografado, nunca em texto). */
export const metaConnections = pgTable(
  'meta_connections',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    providerUserId: text('provider_user_id'),
    status: text('status').notNull().default('CONNECTING'), // CONNECTING | ACTIVE | EXPIRED | REVOKED
    scopes: jsonb('scopes').notNull().default([]),
    accessTokenEncrypted: text('access_token_encrypted'),
    tokenKeyId: text('token_key_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meta_connections_org_idx').on(t.orgId),
    index('meta_connections_org_status_idx').on(t.orgId, t.status),
  ],
);

/** Ativos autorizados da conexão: ad accounts, pages, instagram, business. */
export const metaAssets = pgTable(
  'meta_assets',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaConnections.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // AD_ACCOUNT | PAGE | INSTAGRAM_ACCOUNT | BUSINESS
    providerAssetId: text('provider_asset_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | DISABLED | UNAVAILABLE
    isSelected: boolean('is_selected').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_assets_connection_kind_provider_unique').on(
      t.connectionId,
      t.kind,
      t.providerAssetId,
    ),
    index('meta_assets_org_kind_idx').on(t.orgId, t.kind),
  ],
);

/** Perfil de anúncio preparado a partir de um imóvel (material validado, sem PII). */
export const metaAdProfiles = pgTable(
  'meta_ad_profiles',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaConnections.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    objective: text('objective').notNull(), // OUTCOME_TRAFFIC | OUTCOME_LEADS | OUTCOME_ENGAGEMENT
    dailyBudgetCents: integer('daily_budget_cents'),
    lifetimeBudgetCents: integer('lifetime_budget_cents'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    geos: jsonb('geos').notNull().default([]),
    mediaSelection: jsonb('media_selection').notNull().default([]), // ids de property_media PHOTO pública
    pageAssetId: uuid('page_asset_id').references(() => metaAssets.id, { onDelete: 'set null' }),
    instagramAssetId: uuid('instagram_asset_id').references(() => metaAssets.id, {
      onDelete: 'set null',
    }),
    landingUrl: text('landing_url').notNull(),
    copyPrimary: text('copy_primary').notNull(),
    copyVariants: jsonb('copy_variants').notNull().default([]),
    specialAdCategories: jsonb('special_ad_categories').notNull().default([]), // ex: ['HOUSING']
    status: text('status').notNull().default('DRAFT'), // DRAFT | PREPARED | CREATED | PUBLISHED | PAUSED | ARCHIVED
    idempotencyKey: text('idempotency_key'),
    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_ad_profiles_org_idempotency_unique').on(t.orgId, t.idempotencyKey),
    index('meta_ad_profiles_org_property_idx').on(t.orgId, t.propertyId),
    index('meta_ad_profiles_org_status_idx').on(t.orgId, t.status),
  ],
);

export const metaCampaignLinks = pgTable(
  'meta_campaign_links',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adProfileId: uuid('ad_profile_id')
      .notNull()
      .references(() => metaAdProfiles.id, { onDelete: 'cascade' }),
    providerCampaignId: text('provider_campaign_id').notNull(),
    name: text('name').notNull(),
    objective: text('objective').notNull(),
    specialAdCategories: jsonb('special_ad_categories').notNull().default([]),
    dailyBudgetCents: integer('daily_budget_cents'),
    lifetimeBudgetCents: integer('lifetime_budget_cents'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    status: text('status').notNull().default('CREATED_PAUSED'), // CREATED_PAUSED | ACTIVE | PAUSED | ARCHIVED
    lastPayload: jsonb('last_payload'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_campaign_links_provider_campaign_unique').on(t.providerCampaignId),
    index('meta_campaign_links_org_profile_idx').on(t.orgId, t.adProfileId),
  ],
);

export const metaAdsetLinks = pgTable(
  'meta_adset_links',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignLinkId: uuid('campaign_link_id')
      .notNull()
      .references(() => metaCampaignLinks.id, { onDelete: 'cascade' }),
    providerAdsetId: text('provider_adset_id').notNull(),
    name: text('name').notNull(),
    targeting: jsonb('targeting').notNull().default({}),
    budgetCents: integer('budget_cents'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    status: text('status').notNull().default('CREATED_PAUSED'),
    lastPayload: jsonb('last_payload'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_adset_links_provider_adset_unique').on(t.providerAdsetId),
    index('meta_adset_links_org_campaign_idx').on(t.orgId, t.campaignLinkId),
  ],
);

export const metaCreativeLinks = pgTable(
  'meta_creative_links',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adsetLinkId: uuid('adset_link_id')
      .notNull()
      .references(() => metaAdsetLinks.id, { onDelete: 'cascade' }),
    providerCreativeId: text('provider_creative_id').notNull(),
    name: text('name').notNull(),
    mediaRefs: jsonb('media_refs').notNull().default([]),
    copyPrimary: text('copy_primary').notNull(),
    landingUrl: text('landing_url').notNull(),
    mediaHash: text('media_hash'),
    status: text('status').notNull().default('CREATED_PAUSED'),
    lastPayload: jsonb('last_payload'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_creative_links_provider_creative_unique').on(t.providerCreativeId),
    index('meta_creative_links_org_adset_idx').on(t.orgId, t.adsetLinkId),
  ],
);

export const metaAdLinks = pgTable(
  'meta_ad_links',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adsetLinkId: uuid('adset_link_id')
      .notNull()
      .references(() => metaAdsetLinks.id, { onDelete: 'cascade' }),
    creativeLinkId: uuid('creative_link_id')
      .notNull()
      .references(() => metaCreativeLinks.id, { onDelete: 'cascade' }),
    providerAdId: text('provider_ad_id').notNull(),
    status: text('status').notNull().default('CREATED_PAUSED'), // CREATED_PAUSED | ACTIVE | PAUSED | ARCHIVED
    lastPayload: jsonb('last_payload'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_ad_links_provider_ad_unique').on(t.providerAdId),
    index('meta_ad_links_org_adset_idx').on(t.orgId, t.adsetLinkId),
  ],
);

/** Snapshot de insights (derivado — reconsultável; spend nunca recalculado como fonte). */
export const metaInsightSnapshots = pgTable(
  'meta_insight_snapshots',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adProfileId: uuid('ad_profile_id').references(() => metaAdProfiles.id, {
      onDelete: 'set null',
    }),
    campaignLinkId: uuid('campaign_link_id')
      .notNull()
      .references(() => metaCampaignLinks.id, { onDelete: 'cascade' }),
    adsetLinkId: uuid('adset_link_id').references(() => metaAdsetLinks.id, {
      onDelete: 'set null',
    }),
    adLinkId: uuid('ad_link_id').references(() => metaAdLinks.id, { onDelete: 'set null' }),
    dateStart: date('date_start', { mode: 'string' }).notNull(),
    dateEnd: date('date_end', { mode: 'string' }).notNull(),
    insights: jsonb('insights').notNull().default({}),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_insight_snapshots_campaign_dates_unique').on(
      t.campaignLinkId,
      t.dateStart,
      t.dateEnd,
    ),
    index('meta_insight_snapshots_org_campaign_idx').on(t.orgId, t.campaignLinkId),
  ],
);

/** Fila de intents/jobs do Meta (molde channel_sync_jobs). */
export const metaSyncJobs = pgTable(
  'meta_sync_jobs',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    adProfileId: uuid('ad_profile_id').references(() => metaAdProfiles.id, {
      onDelete: 'set null',
    }),
    jobType: text('job_type').notNull(), // SYNC_INSIGHTS | CREATE_CAMPAIGN | PUBLISH_INTENT | PAUSE | RESUME | UPDATE_BUDGET | UPDATE_SCHEDULE | UPDATE_CREATIVE | ARCHIVE
    status: text('status').notNull().default('PENDING'), // PENDING | RUNNING | SUCCESS | FAILED | CANCELLED
    attempts: integer('attempts').notNull().default(0),
    idempotencyKey: text('idempotency_key'),
    payload: jsonb('payload').notNull().default({}),
    lastError: text('last_error'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_sync_jobs_org_idempotency_unique').on(t.orgId, t.idempotencyKey),
    index('meta_sync_jobs_status_run_idx').on(t.status, t.runAt),
    index('meta_sync_jobs_org_profile_idx').on(t.orgId, t.adProfileId),
  ],
);

/** Arquivo/dedup de eventos webhook recebidos (processamento via webhook_inbox META). */
export const metaWebhookEvents = pgTable(
  'meta_webhook_events',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    providerEventId: text('provider_event_id').notNull().unique(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('QUEUED'), // QUEUED | PROCESSED | IGNORED
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('meta_webhook_events_org_received_idx').on(t.orgId, t.receivedAt)],
);

/** Limites configuráveis por org (budget máximo, geos permitidas, Housing targeting). */
export const metaOrgSettings = pgTable('meta_org_settings', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  maxDailyBudgetCents: integer('max_daily_budget_cents').notNull().default(100_000_00),
  maxLifetimeBudgetCents: integer('max_lifetime_budget_cents').notNull().default(1_000_000_00),
  allowedGeos: jsonb('allowed_geos').notNull().default([]),
  housingTargetingAllowed: boolean('housing_targeting_allowed').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Trilha de auditoria de chamadas de tool MCP (sem PII; digest do input). */
export const metaAuditEvents = pgTable(
  'meta_audit_events',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    action: text('action').notNull(),
    idempotencyKey: text('idempotency_key'),
    inputDigest: text('input_digest'),
    status: text('status').notNull(), // SUCCESS | ERROR
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meta_audit_events_org_tool_idx').on(t.orgId, t.tool, t.createdAt),
    index('meta_audit_events_org_idempotency_idx').on(t.orgId, t.idempotencyKey),
  ],
);
