import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Planos das imobiliárias — limites de uso, sem cobrança (decisão do usuário de
 * 2026-09-15). Os três planos padrão são semeados pela migration 0018 com ids
 * fixos: o ESSENCIAL é o padrão de toda organização nova e o ILIMITADO recebe as
 * imobiliárias que já existiam antes do admin da plataforma.
 */
export const ESSENCIAL_PLAN_ID = '6f1c2a3e-1d2b-4c5a-8e9f-000000000001';
export const PROFISSIONAL_PLAN_ID = '6f1c2a3e-1d2b-4c5a-8e9f-000000000002';
export const ILIMITADO_PLAN_ID = '6f1c2a3e-1d2b-4c5a-8e9f-000000000003';

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    // null = ilimitado
    maxUsers: integer('max_users'),
    maxProperties: integer('max_properties'),
    maxPublishedListings: integer('max_published_listings'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('plans_code_format', sql`${t.code} ~ '^[A-Z0-9_]{2,40}$'`),
    check('plans_max_users_valid', sql`${t.maxUsers} is null or ${t.maxUsers} >= 1`),
    check('plans_max_properties_valid', sql`${t.maxProperties} is null or ${t.maxProperties} >= 0`),
    check(
      'plans_max_published_listings_valid',
      sql`${t.maxPublishedListings} is null or ${t.maxPublishedListings} >= 0`,
    ),
  ],
);
