import { randomUUID } from 'node:crypto';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './identity.js';
import { parties } from './crm.js';

/** Concessão de acesso ao portal externo para uma party (proprietário/locatário). */
export const portalAccess = pgTable(
  'portal_access',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // LANDLORD | TENANT
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Token one-time de convite (hash; consumo único marca como nulo).
    oneTimeTokenHash: text('one_time_token_hash'),
    oneTimeTokenExpiresAt: timestamp('one_time_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('portal_access_org_party_idx').on(t.orgId, t.partyId),
    uniqueIndex('portal_access_org_party_kind_active_unique').on(
      t.orgId,
      t.partyId,
      t.kind,
      t.revokedAt,
    ),
    index('portal_access_token_hash_idx').on(t.oneTimeTokenHash),
  ],
);

/** Sessão opaca do portal externo (token hashado, revogável). */
export const portalSessions = pgTable(
  'portal_sessions',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    accessId: uuid('access_id')
      .notNull()
      .references(() => portalAccess.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('portal_sessions_org_party_idx').on(t.orgId, t.partyId),
    index('portal_sessions_access_idx').on(t.accessId),
  ],
);
