import { randomUUID } from 'node:crypto';
import {
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

/** Canais de publicação (`CHANNEL_TYPES` do domínio). */
const CHANNEL_TYPES = ['fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb'] as const;

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
    channel: text('channel').notNull(), // fake | canalpro | vivareal | zap | olx | imovelweb
    channelListingId: text('channel_listing_id'),
    status: text('status').notNull().default('PENDING'),
    lastPayload: jsonb('last_payload'),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('channel_publications_listing_channel_unique').on(t.listingId, t.channel),
    index('channel_publications_org_status_idx').on(t.orgId, t.status),
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
    ]),
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
