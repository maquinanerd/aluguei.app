import { randomUUID } from 'node:crypto';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from 'drizzle-orm/pg-core';
import { organizations } from './identity.js';
import { leads, parties } from './crm.js';
import { properties } from './properties.js';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    partyId: uuid('party_id').references(() => parties.id, { onDelete: 'set null' }),
    waContactId: text('wa_contact_id'),
    waPhoneNumberId: text('wa_phone_number_id'),
    status: text('status').notNull().default('OPEN'), // OPEN | ACTIVE | NEEDS_HUMAN | CLOSED
    channel: text('channel').notNull().default('whatsapp'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conversations_org_status_updated_idx').on(t.orgId, t.status, t.updatedAt),
    index('conversations_org_channel_contact_idx').on(t.orgId, t.channel, t.waContactId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(), // INBOUND | OUTBOUND
    senderType: text('sender_type').notNull(), // USER | AGENT | BOT
    body: text('body').notNull(),
    messageType: text('message_type').notNull().default('TEXT'),
    waMessageId: text('wa_message_id').unique(),
    // FK self removida (referência circular no drizzle) — integridade pela aplicação.
    replyToMessageId: uuid('reply_to_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_org_conversation_created_idx').on(t.orgId, t.conversationId, t.createdAt),
  ],
);

export const conversationIntents = pgTable(
  'conversation_intents',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    intent: text('intent').notNull(), // VISIT_REQUEST | PRICE_QUERY | AVAILABILITY | OTHER
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    budgetMinCents: integer('budget_min_cents'),
    budgetMaxCents: integer('budget_max_cents'),
    moveInDate: date('move_in_date', { mode: 'string' }),
    extractedBy: text('extracted_by').notNull(), // AI | RULE
    confidence: doublePrecision('confidence'),
    raw: jsonb('raw').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conversation_intents_org_conversation_idx').on(t.orgId, t.conversationId, t.createdAt),
    index('conversation_intents_org_intent_idx').on(t.orgId, t.intent, t.createdAt),
  ],
);

export const whatsappConnections = pgTable(
  'whatsapp_connections',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    phoneNumberId: text('phone_number_id').notNull().unique(),
    businessAccountId: text('business_account_id'),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | DISABLED
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('whatsapp_connections_org_idx').on(t.orgId)],
);

export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // WHATSAPP (genérico p/ fases futuras)
    providerEventId: text('provider_event_id').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | RUNNING | SUCCESS | FAILED
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('webhook_inbox_provider_event_unique').on(t.provider, t.providerEventId),
    index('webhook_inbox_status_run_idx').on(t.status, t.runAt),
  ],
);
