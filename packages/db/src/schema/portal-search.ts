import { randomUUID } from 'node:crypto';
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { listings, organizations } from './index.js';
import { domainCheck } from './checks.js';

/**
 * Slugs que um anúncio já teve no portal. Quando o slug público muda, o endereço
 * antigo responde 301 em vez de 404 — página indexada que some sem redirecionar
 * é visita perdida e sinal ruim para o buscador (ADR-099).
 */
export const listingSlugHistory = pgTable(
  'listing_slug_history',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('listing_slug_history_slug_unique').on(t.slug),
    index('listing_slug_history_listing_idx').on(t.listingId),
  ],
);

/**
 * Alerta de imóvel: quem não achou o que procurava deixa o contato e recebe
 * quando aparecer algo no recorte. Nasce PENDING e só vira ACTIVE depois da
 * confirmação pelo link de uso único — ninguém entra numa lista sem confirmar.
 *
 * A imobiliária nunca vê este contato: o painel enxerga só o agregado
 * ("demanda por bairro"). Por isso a tabela não tem `org_id`.
 */
export const searchAlerts = pgTable(
  'search_alerts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    purpose: text('purpose').notNull(),
    citySlug: text('city_slug').notNull(),
    neighborhoodSlug: text('neighborhood_slug'),
    propertyType: text('property_type'),
    bedrooms: integer('bedrooms'),
    maxPriceCents: integer('max_price_cents'),
    /** EMAIL ou WHATSAPP — como a pessoa quer ser avisada. */
    contactKind: text('contact_kind').notNull(),
    contactValue: text('contact_value').notNull(),
    /** O texto exato do consentimento aceito, e quando (LGPD). */
    consentText: text('consent_text').notNull(),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('PENDING'),
    /** SHA-256 do token de uso único que confirma e cancela o alerta. */
    tokenHash: text('token_hash').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('search_alerts_token_hash_unique').on(t.tokenHash),
    index('search_alerts_place_idx').on(t.citySlug, t.neighborhoodSlug, t.status),
    domainCheck('search_alerts_purpose_valid', t.purpose, ['RENT', 'SALE']),
    domainCheck('search_alerts_status_valid', t.status, ['PENDING', 'ACTIVE', 'CANCELED']),
    domainCheck('search_alerts_contact_kind_valid', t.contactKind, ['EMAIL', 'WHATSAPP']),
  ],
);
