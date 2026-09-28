import { randomUUID } from 'node:crypto';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, parties, users } from './index.js';
import { properties } from './properties.js';
import { domainCheck } from './checks.js';

/**
 * Vocabulários da venda. Repetidos aqui de propósito: o pacote de banco não
 * depende do domínio (como em `channels.ts`), e quem amarra os dois é o teste
 * da trilha G, que compara cada CHECK com a constante do domínio e do contrato.
 */
const SALE_NEGOTIATION_STAGES = [
  'PROPOSAL',
  'COUNTER',
  'DOCUMENTATION',
  'CONTRACT',
  'CLOSED',
  'LOST',
] as const;
const SALE_EVENT_KINDS = ['ASKING', 'BUYER_OFFER', 'SELLER_COUNTER'] as const;
const SALE_EVENT_OUTCOMES = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
const SALE_DOCUMENT_SIDES = ['PROPERTY', 'BUYER', 'SELLER'] as const;
const SALE_COMMISSION_ROLES = ['CAPTADOR', 'VENDEDOR'] as const;

/**
 * Negociação de venda (Onda 5): da proposta ao fechamento.
 *
 * O histórico é **imutável por desenho**: proposta, contraproposta e resposta
 * viram linhas em `sale_negotiation_events`, e o valor corrente da negociação é
 * consequência delas. Guardar só o último valor perderia a conversa — que é
 * justamente o que a imobiliária precisa para negociar.
 */
export const saleNegotiations = pgTable(
  'sale_negotiations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').notNull(),
    /** Comprador; a negociação nasce dele, então é obrigatório. */
    buyerPartyId: uuid('buyer_party_id').notNull(),
    stage: text('stage').notNull().default('PROPOSAL'),
    /** Pedido do proprietário quando a negociação começou. */
    askingPriceCents: integer('asking_price_cents'),
    /** Último valor em jogo; sai do evento mais recente. */
    currentAmountCents: integer('current_amount_cents'),
    /** Comissão em basis points sobre o valor fechado. */
    commissionBps: integer('commission_bps').notNull().default(0),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedAmountCents: integer('closed_amount_cents'),
    lostReason: text('lost_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_negotiations_org_stage_idx').on(t.orgId, t.stage),
    index('sale_negotiations_property_idx').on(t.propertyId),
    domainCheck('sale_negotiations_stage_valid', t.stage, SALE_NEGOTIATION_STAGES),
    // Negociação de uma imobiliária não aponta para imóvel nem para pessoa de
    // outra, mesmo que uma rota futura esqueça a checagem (P0-05).
    foreignKey({
      name: 'sale_negotiations_property_org_fk',
      columns: [t.orgId, t.propertyId],
      foreignColumns: [properties.orgId, properties.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sale_negotiations_buyer_org_fk',
      columns: [t.orgId, t.buyerPartyId],
      foreignColumns: [parties.orgId, parties.id],
    }).onDelete('restrict'),
  ],
);

/** Cada proposta, contraproposta e resposta, na ordem em que aconteceu. */
export const saleNegotiationEvents = pgTable(
  'sale_negotiation_events',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    negotiationId: uuid('negotiation_id')
      .notNull()
      .references(() => saleNegotiations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** Até quando a proposta vale; o vencimento é informação da negociação. */
    validUntil: date('valid_until'),
    outcome: text('outcome').notNull().default('PENDING'),
    note: text('note'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sale_negotiation_events_negotiation_idx').on(t.negotiationId, t.createdAt),
    domainCheck('sale_negotiation_events_kind_valid', t.kind, SALE_EVENT_KINDS),
    domainCheck('sale_negotiation_events_outcome_valid', t.outcome, SALE_EVENT_OUTCOMES),
  ],
);

/** Checklist de documentos da venda, por lado. */
export const saleNegotiationDocuments = pgTable(
  'sale_negotiation_documents',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    negotiationId: uuid('negotiation_id')
      .notNull()
      .references(() => saleNegotiations.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    label: text('label').notNull(),
    provided: boolean('provided').notNull().default(false),
    providedAt: timestamp('provided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sale_negotiation_documents_unique').on(t.negotiationId, t.side, t.label),
    domainCheck('sale_negotiation_documents_side_valid', t.side, SALE_DOCUMENT_SIDES),
  ],
);

/**
 * Divisão da comissão entre quem captou e quem vendeu. As participações somam
 * 100%; a conferência é do domínio, porque um CHECK não soma linhas.
 */
export const saleCommissionShares = pgTable(
  'sale_commission_shares',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    negotiationId: uuid('negotiation_id')
      .notNull()
      .references(() => saleNegotiations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    percentBps: integer('percent_bps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sale_commission_shares_unique').on(t.negotiationId, t.role),
    domainCheck('sale_commission_shares_role_valid', t.role, SALE_COMMISSION_ROLES),
  ],
);
