import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { ESSENCIAL_PLAN_ID, plans } from './platform.js';

export const roleEnum = pgEnum('role', [
  'owner',
  'admin',
  'agent',
  'inspector',
  'finance',
  'viewer',
]);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    // Admin da plataforma: nasce aguardando aprovação e só opera em ACTIVE.
    status: text('status').notNull().default('PENDING_APPROVAL'), // PENDING_APPROVAL | ACTIVE | SUSPENDED | REJECTED
    statusReason: text('status_reason'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    statusChangedBy: uuid('status_changed_by').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    planId: uuid('plan_id')
      .notNull()
      .default(ESSENCIAL_PLAN_ID)
      .references(() => plans.id, { onDelete: 'restrict' }),
    // Dados do cadastro para a análise: CPF/CNPJ e telefone só com dígitos.
    document: text('document'),
    phone: text('phone'),
    creci: text('creci'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('organizations_status_created_idx').on(t.status, t.createdAt),
    check(
      'organizations_status_valid',
      sql`${t.status} in ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED')`,
    ),
  ],
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(randomUUID),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_unique').on(t.orgId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    activeOrgId: uuid('active_org_id').references(() => organizations.id, { onDelete: 'set null' }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('user_sessions_user_idx').on(t.userId)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_org_time_idx').on(t.orgId, t.occurredAt),
    index('audit_events_entity_idx').on(t.entityType, t.entityId),
  ],
);
