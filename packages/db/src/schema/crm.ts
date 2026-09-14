import { randomUUID } from 'node:crypto';
import {
  foreignKey,
  index,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users } from './identity.js';
import { properties } from './properties.js';

export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // PERSON | COMPANY (validação na aplicação)
    name: text('name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('parties_org_idx').on(t.orgId),
    // Alvo de FK composta: a referência passa a carregar a organização (P0-05).
    unique('parties_org_id_unique').on(t.orgId, t.id),
  ],
);

export const partyRoles = pgTable(
  'party_roles',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    // OWNER | TENANT | GUARANTOR | BROKER | LEGAL_REPRESENTATIVE (app-level)
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('party_roles_party_role_unique').on(t.partyId, t.role),
    index('party_roles_org_idx').on(t.orgId),
  ],
);

export const partyIdentities = pgTable(
  'party_identities',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // EMAIL | PHONE | CPF | CNPJ | PASSPORT
    value: text('value').notNull(), // normalizado
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('party_identities_org_kind_value_unique').on(t.orgId, t.kind, t.value),
    index('party_identities_party_idx').on(t.partyId),
  ],
);

export const partyDocuments = pgTable(
  'party_documents',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    documentKey: text('document_key').notNull(), // chave no storage
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('party_documents_party_idx').on(t.partyId)],
);

export const partyAddresses = pgTable(
  'party_addresses',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('party_addresses_party_idx').on(t.partyId)],
);

export const partyConsents = pgTable(
  'party_consents',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(), // LGPD: finalidade
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('party_consents_party_purpose_idx').on(t.partyId, t.purpose)],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('NEW'), // funil validado no domínio
    source: text('source'),
    channel: text('channel'), // PORTAL | WHATSAPP | INDICACAO | META | MANUAL ...
    partyId: uuid('party_id'), // FK composta (org_id, party_id) — ver abaixo
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    budgetMinCents: integer('budget_min_cents'),
    budgetMaxCents: integer('budget_max_cents'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leads_org_status_idx').on(t.orgId, t.status),
    index('leads_org_created_idx').on(t.orgId, t.createdAt),
    unique('leads_org_id_unique').on(t.orgId, t.id),
    // Lead de uma imobiliária não aponta para pessoa de outra, mesmo que uma
    // rota futura esqueça a checagem (auditoria 2026-09-10, P0-05).
    foreignKey({
      name: 'leads_party_org_fk',
      columns: [t.orgId, t.partyId],
      foreignColumns: [parties.orgId, parties.id],
    }).onDelete('set null'),
  ],
);

export const leadPropertyInterests = pgTable(
  'lead_property_interests',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull(),
    // ON DELETE SET NULL preserva o registro de CRM quando o imóvel some
    propertyId: uuid('property_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lead_property_interests_lead_property_unique').on(t.leadId, t.propertyId),
    index('lead_property_interests_property_idx').on(t.propertyId),
    foreignKey({
      name: 'lead_interests_lead_org_fk',
      columns: [t.orgId, t.leadId],
      foreignColumns: [leads.orgId, leads.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'lead_interests_property_org_fk',
      columns: [t.orgId, t.propertyId],
      foreignColumns: [properties.orgId, properties.id],
    }).onDelete('set null'),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('OPEN'), // OPEN | DONE | CANCELLED
    dueAt: timestamp('due_at', { withTimezone: true }),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: text('related_entity_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_status_idx').on(t.orgId, t.status),
    index('tasks_assignee_idx').on(t.assigneeUserId),
  ],
);

export const visits = pgTable(
  'visits',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id'),
    partyId: uuid('party_id'),
    propertyId: uuid('property_id'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('SCHEDULED'), // SCHEDULED | CONFIRMED | DONE | CANCELLED | NO_SHOW
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('visits_org_scheduled_idx').on(t.orgId, t.scheduledAt),
    foreignKey({
      name: 'visits_lead_org_fk',
      columns: [t.orgId, t.leadId],
      foreignColumns: [leads.orgId, leads.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'visits_party_org_fk',
      columns: [t.orgId, t.partyId],
      foreignColumns: [parties.orgId, parties.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'visits_property_org_fk',
      columns: [t.orgId, t.propertyId],
      foreignColumns: [properties.orgId, properties.id],
    }).onDelete('set null'),
  ],
);

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id'),
    partyId: uuid('party_id'),
    propertyId: uuid('property_id'),
    status: text('status').notNull().default('DRAFT'), // DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
    monthlyRentCents: integer('monthly_rent_cents').notNull(),
    terms: text('terms'),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('proposals_org_status_idx').on(t.orgId, t.status),
    unique('proposals_org_id_unique').on(t.orgId, t.id),
    foreignKey({
      name: 'proposals_lead_org_fk',
      columns: [t.orgId, t.leadId],
      foreignColumns: [leads.orgId, leads.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'proposals_party_org_fk',
      columns: [t.orgId, t.partyId],
      foreignColumns: [parties.orgId, parties.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'proposals_property_org_fk',
      columns: [t.orgId, t.propertyId],
      foreignColumns: [properties.orgId, properties.id],
    }).onDelete('set null'),
  ],
);

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // LEAD | PARTY | PROPOSAL | VISIT | TASK
    entityId: text('entity_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('timeline_events_entity_idx').on(t.orgId, t.entityType, t.entityId, t.occurredAt)],
);
