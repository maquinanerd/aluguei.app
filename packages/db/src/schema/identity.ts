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

/**
 * Recuperação de senha (auditoria 2026-09-10, P2-04). Só o hash do token é guardado; uso único
 * (`used_at`) e validade curta. Nada é enviado: a mensagem vai para `email_outbox`.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    requestedIp: text('requested_ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('password_reset_tokens_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Convite de membro por e-mail (auditoria 2026-09-10, P2-04: `POST /organizations/:orgId/members`
 * exigia o `userId` de quem já existia). O aceite cria o usuário com a senha que a própria pessoa
 * escolhe e vira membro com a função do convite.
 */
export const memberInvites = pgTable(
  'member_invites',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(), // normalizado (lowercase)
    role: roleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedByUserId: uuid('invited_by_user_id').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    acceptedUserId: uuid('accepted_user_id').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('member_invites_org_email_idx').on(t.orgId, t.email),
    index('member_invites_email_idx').on(t.email),
  ],
);

/** Tipos de mensagem da caixa de saída (domínio fechado, com CHECK). */
export const EMAIL_OUTBOX_KINDS = ['PASSWORD_RESET', 'MEMBER_INVITE'] as const;
export const EMAIL_OUTBOX_STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;

/**
 * Caixa de saída local de e-mail (auditoria 2026-09-10, trilha D): a recuperação de senha e o
 * convite de membro **gravam a mensagem aqui e não enviam nada**. Sem provider de e-mail, sem
 * efeito externo. Mensagem de senha tem `org_id` nulo e nunca é lida pela rota da organização.
 */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('QUEUED'),
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: text('related_entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    index('email_outbox_org_created_idx').on(t.orgId, t.createdAt),
    index('email_outbox_to_created_idx').on(t.toEmail, t.createdAt),
    check('email_outbox_kind_valid', sql`${t.kind} in ('PASSWORD_RESET', 'MEMBER_INVITE')`),
    check('email_outbox_status_valid', sql`${t.status} in ('QUEUED', 'SENT', 'FAILED')`),
  ],
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
