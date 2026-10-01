import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { listings, organizations } from './index.js';
import { domainCheck } from './checks.js';

/**
 * Canais de publicação (`CHANNEL_TYPES` do domínio). `grupoolx` é o feed VRSync do Grupo OLX
 * (ADR-107); `canalpro`, `vivareal` e `zap` ficam só para não invalidar linha antiga.
 */
const CHANNEL_TYPES = [
  'fake',
  'canalpro',
  'vivareal',
  'zap',
  'olx',
  'imovelweb',
  'grupoolx',
] as const;

/** `PublicationType` do VRSync (`grupoOlxPublicationTierSchema` dos contratos). */
const PUBLICATION_TIERS = [
  'STANDARD',
  'PREMIUM',
  'SUPER_PREMIUM',
  'PREMIERE_1',
  'PREMIERE_2',
  'TRIPLE',
] as const;

/** `PropertyType` do VRSync (`grupoOlxPropertyTypeSchema` dos contratos). */
const PORTAL_PROPERTY_TYPES = [
  'Residential / Apartment',
  'Residential / Home',
  'Residential / Condo',
  'Residential / Village House',
  'Residential / Farm Ranch',
  'Residential / Penthouse',
  'Residential / Flat',
  'Residential / Kitnet',
  'Residential / Studio',
  'Residential / Loft',
  'Residential / Sobrado',
  'Residential / Agricultural',
  'Residential / Land Lot',
  'Commercial / Consultorio',
  'Commercial / Edificio Residencial',
  'Commercial / Industrial',
  'Commercial / Building',
  'Commercial / Garage',
  'Commercial / Hotel',
  'Commercial / Business',
  'Commercial / Corporate Floor',
  'Commercial / Land Lot',
  'Commercial / Office',
  'Commercial / Edificio Comercial',
] as const;

/** Estado desejado por (listing, canal) — independente do status do listing principal. */
export const listingChannelPublications = pgTable(
  'listing_channel_publications',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // vocabulário em CHANNEL_TYPES
    channelListingId: text('channel_listing_id'),
    status: text('status').notNull().default('PENDING'),
    lastPayload: jsonb('last_payload'),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Destaque contratado no portal (`PublicationType`); nulo = padrão. Propriedade da distribuição. */
    publicationTier: text('publication_tier'),
    /** Tipo no portal quando o tipo do AchouImóvel não decide sozinho (comercial, terreno). */
    portalPropertyType: text('portal_property_type'),
    /** Bloqueios e avisos da avaliação (modo FEED) e críticas do relatório de importação. */
    issues: jsonb('issues'),
    /** Última busca do robô do portal que levou este anúncio no arquivo. */
    lastInFeedAt: timestamp('last_in_feed_at', { withTimezone: true }),
    /** Hash do trecho do anúncio na última busca do robô: diz se a versão mudou. */
    feedContentHash: text('feed_content_hash'),
    /** Último relatório de importação que tratou deste anúncio. */
    lastReportAt: timestamp('last_report_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('channel_publications_listing_channel_unique').on(t.listingId, t.channel),
    index('channel_publications_org_status_idx').on(t.orgId, t.status),
    // Feed do Grupo OLX: anúncios desejados de uma imobiliária, na ordem do cursor do arquivo.
    index('channel_publications_org_channel_listing_idx').on(t.orgId, t.channel, t.listingId),
    domainCheck('listing_channel_publications_channel_valid', t.channel, CHANNEL_TYPES),
    domainCheck('listing_channel_publications_status_valid', t.status, [
      'PENDING',
      'PUBLISHING',
      'PUBLISHED',
      'UPDATE_PENDING',
      'REMOVING',
      'REMOVED',
      'FAILED',
      'RECONCILING',
      'BLOCKED',
      'ELIGIBLE',
      'AWAITING_IMPORT',
      'IMPORTED',
      'IMPORTED_WITH_WARNINGS',
      'IMPORT_ERROR',
    ]),
    domainCheck(
      'listing_channel_publications_publication_tier_valid',
      t.publicationTier,
      PUBLICATION_TIERS,
      { nullable: true },
    ),
    domainCheck(
      'listing_channel_publications_portal_property_type_valid',
      t.portalPropertyType,
      PORTAL_PROPERTY_TYPES,
      { nullable: true },
    ),
  ],
);

/** Fila + trilha operacional dos jobs de canal (claim atômico no Postgres). */
export const channelSyncJobs = pgTable(
  'channel_sync_jobs',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    jobType: text('job_type').notNull(), // PUBLISH | UPDATE | REMOVE | RECONCILE | IMPORT_LEADS
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    payload: jsonb('payload'),
    lastError: text('last_error'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('channel_sync_jobs_org_status_run_idx').on(t.orgId, t.status, t.runAt),
    index('channel_sync_jobs_org_channel_status_idx').on(t.orgId, t.channel, t.status),
    domainCheck('channel_sync_jobs_channel_valid', t.channel, CHANNEL_TYPES),
    domainCheck('channel_sync_jobs_job_type_valid', t.jobType, [
      'PUBLISH',
      'UPDATE',
      'REMOVE',
      'RECONCILE',
      'IMPORT_LEADS',
    ]),
    domainCheck('channel_sync_jobs_status_valid', t.status, [
      'PENDING',
      'RUNNING',
      'SUCCESS',
      'FAILED',
    ]),
  ],
);

/**
 * Conexão de uma imobiliária com um canal (ADR-107). No Grupo OLX: o feed (token opaco, só o hash
 * fica aqui), os portais e cotas que o contrato dela declara e o que se observou das buscas, dos
 * relatórios e dos leads. A homologação é do software, não da imobiliária: não fica aqui.
 */
export const channelConnections = pgTable(
  'channel_connections',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    /** Portais do contrato (ZAP, VIVAREAL, OLX), declarados pela imobiliária. */
    destinations: text('destinations')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Conta da imobiliária no portal (login ou código), informada por ela. */
    externalAccountId: text('external_account_id'),
    /** Código de cliente/anunciante no portal, informado por ela. */
    externalCustomerId: text('external_customer_id'),
    /** SHA-256 do token do feed. O token só aparece uma vez, na geração. */
    feedTokenHash: text('feed_token_hash'),
    /** Últimos caracteres do token, para conferir com a URL cadastrada no portal. */
    feedTokenHint: text('feed_token_hint'),
    feedTokenCreatedAt: timestamp('feed_token_created_at', { withTimezone: true }),
    /**
     * Referência opaca da conexão para uma URL de webhook por imobiliária, se o Grupo OLX pedir
     * esse formato na homologação (ADR-108). Não é segredo — quem autentica é a chave do webhook —,
     * mas não revela id interno nem é previsível.
     */
    leadsEndpointRef: text('leads_endpoint_ref')
      .notNull()
      .$defaultFn(() => randomBytes(16).toString('base64url')),
    /** `displayAddress` do VRSync: o portal recebe o endereço completo e mostra só isto. */
    displayAddress: text('display_address').notNull().default('Neighborhood'),
    listingQuota: integer('listing_quota'),
    featuredQuota: integer('featured_quota'),
    superFeaturedQuota: integer('super_featured_quota'),
    lastFeedFetchAt: timestamp('last_feed_fetch_at', { withTimezone: true }),
    lastCrawlerFetchAt: timestamp('last_crawler_fetch_at', { withTimezone: true }),
    lastCrawlerListingCount: integer('last_crawler_listing_count'),
    lastReportAt: timestamp('last_report_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    /** Entregas de lead repetidas (mesmo `originLeadId`), descartadas sem criar lead. */
    leadDuplicateDeliveries: integer('lead_duplicate_deliveries').notNull().default(0),
    lastLeadAt: timestamp('last_lead_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('channel_connections_org_channel_unique').on(t.orgId, t.channel),
    uniqueIndex('channel_connections_feed_token_hash_unique').on(t.feedTokenHash),
    uniqueIndex('channel_connections_leads_endpoint_ref_unique').on(t.leadsEndpointRef),
    domainCheck('channel_connections_channel_valid', t.channel, CHANNEL_TYPES),
    domainCheck('channel_connections_display_address_valid', t.displayAddress, [
      'Neighborhood',
      'Street',
      'All',
    ]),
    check(
      'channel_connections_destinations_valid',
      sql`${t.destinations} <@ array['ZAP'::text, 'VIVAREAL'::text, 'OLX'::text]`,
    ),
    check(
      'channel_connections_quotas_nonnegative',
      sql`(${t.listingQuota} is null or ${t.listingQuota} >= 0) and (${t.featuredQuota} is null or ${t.featuredQuota} >= 0) and (${t.superFeaturedQuota} is null or ${t.superFeaturedQuota} >= 0)`,
    ),
    // Token e dica andam juntos: um sem o outro é URL que ninguém consegue conferir.
    check(
      'channel_connections_feed_token_complete',
      sql`(${t.feedTokenHash} is null) = (${t.feedTokenHint} is null) and (${t.feedTokenHash} is null) = (${t.feedTokenCreatedAt} is null)`,
    ),
  ],
);

/** Cada busca do feed (robô do portal ou outro cliente), para a tela de acompanhamento. */
export const channelFeedFetches = pgTable(
  'channel_feed_fetches',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => channelConnections.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    /** User-Agent do robô do portal. Identifica, não autentica: quem autentica é o token. */
    isCrawler: boolean('is_crawler').notNull(),
    userAgent: text('user_agent'),
    listingCount: integer('listing_count').notNull().default(0),
    blockedCount: integer('blocked_count').notNull().default(0),
    bytes: integer('bytes').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    outcome: text('outcome').notNull(),
    errorMessage: text('error_message'),
  },
  (t) => [
    index('channel_feed_fetches_connection_fetched_idx').on(t.connectionId, t.fetchedAt),
    domainCheck('channel_feed_fetches_channel_valid', t.channel, CHANNEL_TYPES),
    domainCheck('channel_feed_fetches_outcome_valid', t.outcome, ['OK', 'ERROR']),
  ],
);

/** Relatório de importação recebido do portal (Grupo OLX: `FEEDS_INTEGRATION_REPORT`). */
export const channelImportReports = pgTable(
  'channel_import_reports',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => channelConnections.id, {
      onDelete: 'set null',
    }),
    channel: text('channel').notNull(),
    externalReportId: text('external_report_id').notNull(),
    /** Tipo de contrato que o portal informa (VIVAREAL, ZAP, GRUPOZAP, ZAP_OLX). */
    company: text('company'),
    reportDate: timestamp('report_date', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    contracted: integer('contracted'),
    created: integer('created'),
    updated: integer('updated'),
    deleted: integer('deleted'),
    unchanged: integer('unchanged'),
    errorCount: integer('error_count'),
    warningCount: integer('warning_count'),
    link: text('link'),
    errors: jsonb('errors'),
    warnings: jsonb('warnings'),
  },
  (t) => [
    uniqueIndex('channel_import_reports_org_external_unique').on(
      t.orgId,
      t.channel,
      t.externalReportId,
    ),
    index('channel_import_reports_org_received_idx').on(t.orgId, t.receivedAt),
    domainCheck('channel_import_reports_channel_valid', t.channel, CHANNEL_TYPES),
  ],
);
