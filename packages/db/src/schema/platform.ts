import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Planos das imobiliárias — limites de uso e módulos incluídos. O preço mensal
 * (`monthly_price_cents`, nulo = "Fale com a gente") é só exibição na página
 * pública de planos: nada aqui cobra (decisão do usuário de 2026-09-15). Os três planos padrão são semeados pela migration 0018 com ids
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
    // null = ilimitado; conta locações em vigor (ACTIVE, DELINQUENT, TERMINATING)
    maxActiveLeases: integer('max_active_leases'),
    /** Módulos incluídos (`PLAN_MODULES` do domínio); o que falta abre a tela de upgrade. */
    modules: text('modules')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Preço mensal em centavos, só para exibição. null = "Fale com a gente". */
    monthlyPriceCents: integer('monthly_price_cents'),
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
    check(
      'plans_max_active_leases_valid',
      sql`${t.maxActiveLeases} is null or ${t.maxActiveLeases} >= 0`,
    ),
    check(
      'plans_modules_valid',
      sql`${t.modules} <@ array['CRM'::text, 'ATENDIMENTO'::text, 'LOCACAO'::text, 'FINANCEIRO'::text, 'VENDAS'::text, 'MARKETING'::text]`,
    ),
    // Teto de R$ 1.000.000,00 em centavos, igual ao resto do sistema (ADR-094).
    check(
      'plans_monthly_price_cents_valid',
      sql`${t.monthlyPriceCents} is null or (${t.monthlyPriceCents} >= 0 and ${t.monthlyPriceCents} <= 100000000)`,
    ),
  ],
);
