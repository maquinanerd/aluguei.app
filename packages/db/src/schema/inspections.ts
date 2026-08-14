import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, properties, users } from './index.js';

/** Vistoria — status/type em text validados no domínio. */
export const inspections = pgTable(
  'inspections',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // CHECKIN | CHECKOUT | INTERMEDIATE
    status: text('status').notNull().default('DRAFT'), // DRAFT | CAPTURING | PROCESSING | REVIEW | COMPLETED | SIGNED
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inspections_org_created_idx').on(t.orgId, t.createdAt),
    index('inspections_org_status_idx').on(t.orgId, t.status),
    index('inspections_property_idx').on(t.propertyId),
  ],
);

export const inspectionRooms = pgTable(
  'inspection_rooms',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inspection_rooms_inspection_order_idx').on(t.inspectionId, t.orderIndex),
    index('inspection_rooms_org_idx').on(t.orgId),
  ],
);

/** Mídia de vistoria — SEM isPublic (privacy guard ADR-015): nunca vira anúncio. */
export const inspectionMedia = pgTable(
  'inspection_media',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => inspectionRooms.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(), // PHOTO | AUDIO | VIDEO
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    durationMs: integer('duration_ms'),
    isEvidence: boolean('is_evidence').notNull().default(true),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inspection_media_inspection_idx').on(t.inspectionId),
    index('inspection_media_org_idx').on(t.orgId),
  ],
);

export const inspectionTranscripts = pgTable(
  'inspection_transcripts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => inspectionMedia.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | PROCESSED | FAILED
    aiModel: text('ai_model'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inspection_transcripts_media_unique').on(t.mediaId),
    index('inspection_transcripts_inspection_idx').on(t.inspectionId),
    index('inspection_transcripts_status_idx').on(t.status),
  ],
);

/** Sugestões de IA — payload só com evidência observável, nunca causa/diagnóstico. */
export const inspectionAiSuggestions = pgTable(
  'inspection_ai_suggestions',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id').references(() => inspectionMedia.id, { onDelete: 'set null' }),
    transcriptId: uuid('transcript_id').references(() => inspectionTranscripts.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(), // VISUAL | TRANSCRIPT
    payload: jsonb('payload').notNull(),
    confidence: doublePrecision('confidence'),
    status: text('status').notNull().default('PENDING'), // PENDING | ACCEPTED | REJECTED | EDITED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inspection_ai_suggestions_inspection_status_idx').on(t.inspectionId, t.status),
    index('inspection_ai_suggestions_media_idx').on(t.mediaId),
    index('inspection_ai_suggestions_org_idx').on(t.orgId),
  ],
);

export const inspectionObservations = pgTable(
  'inspection_observations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => inspectionRooms.id, { onDelete: 'set null' }),
    mediaId: uuid('media_id').references(() => inspectionMedia.id, { onDelete: 'set null' }),
    category: text('category').notNull(), // DAMAGE | CONDITION | CLEANLINESS | FURNITURE | INSTALLATION | OTHER
    severity: text('severity').notNull(), // NONE | LOW | MEDIUM | HIGH
    description: text('description').notNull(),
    source: text('source').notNull(), // HUMAN | AI
    status: text('status').notNull().default('CONFIRMED'), // DRAFT | CONFIRMED | REJECTED | EDITED
    aiSuggestionId: uuid('ai_suggestion_id').references(() => inspectionAiSuggestions.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inspection_observations_suggestion_unique')
      .on(t.aiSuggestionId)
      .where(sql`ai_suggestion_id IS NOT NULL`),
    index('inspection_observations_inspection_room_idx').on(t.inspectionId, t.roomId),
    index('inspection_observations_inspection_status_idx').on(t.inspectionId, t.status),
  ],
);

export const inspectionComparisons = pgTable(
  'inspection_comparisons',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    checkinInspectionId: uuid('checkin_inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    checkoutInspectionId: uuid('checkout_inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => inspectionRooms.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('COMPLETED'), // DRAFT | COMPLETED
    differences: jsonb('differences').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inspection_comparisons_checkin_checkout_unique').on(
      t.checkinInspectionId,
      t.checkoutInspectionId,
    ),
    index('inspection_comparisons_org_idx').on(t.orgId),
  ],
);
