import { randomUUID } from 'node:crypto';
import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users } from './index.js';
import { properties } from './properties.js';
import { domainCheck } from './checks.js';

/**
 * Cadastro de imóvel por áudio (ADR-104).
 *
 * O rascunho é peça **separada do imóvel**, não um imóvel meio-criado: um
 * palpite errado da IA não pode entrar no cadastro real e depois precisar ser
 * caçado. Só a confirmação de uma pessoa transforma rascunho em imóvel, e é
 * essa transformação que grava `property_id` aqui.
 *
 * Vocabulários repetidos de propósito (como em `sale.ts`): o pacote de banco
 * não depende do domínio, e quem amarra os dois é o teste da trilha G.
 */
const PROPERTY_DRAFT_STATUSES = [
  'CAPTURING',
  'PROCESSING',
  'REVIEW',
  'CONFIRMED',
  'DISCARDED',
  'FAILED',
] as const;

const PROPERTY_DRAFT_FIELD_STATES = [
  'FROM_AUDIO',
  'NEEDS_CONFIRMATION',
  'MISSING',
  'EDITED',
] as const;

const PROPERTY_DRAFT_FIELD_KEYS = [
  'TITLE',
  'PROPERTY_TYPE',
  'PURPOSE',
  'TOTAL_AREA_SQM',
  'BEDROOMS',
  'BATHROOMS',
  'PARKING_SPOTS',
  'FURNISHED',
  'PETS_ALLOWED',
  'MONTHLY_RENT_CENTS',
  'SALE_PRICE_CENTS',
  'CONDO_FEE_CENTS',
  'IPTU_CENTS',
  'STREET',
  'NUMBER',
  'COMPLEMENT',
  'NEIGHBORHOOD',
  'CITY',
  'STATE',
  'ZIP_CODE',
] as const;

export const propertyDrafts = pgTable(
  'property_drafts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('CAPTURING'),
    /**
     * Transcrição **já redigida**: CPF, telefone e e-mail saem antes de chegar
     * aqui (ADR-104). O que não é guardado não vaza depois.
     */
    transcript: text('transcript'),
    /** Chave do áudio no storage da própria imobiliária; nunca do provedor. */
    audioKey: text('audio_key'),
    audioSeconds: integer('audio_seconds'),
    /** Nome do transcritor usado — a tela avisa quando é simulação. */
    aiProvider: text('ai_provider'),
    failureReason: text('failure_reason'),
    /** Preenchido só na confirmação: é a prova de que virou imóvel. */
    propertyId: uuid('property_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('property_drafts_org_status_idx').on(t.orgId, t.status),
    // UNIQUE de tabela, não índice: a FK composta do campo aponta para
    // (org_id, id), e uma FK só enxerga constraint criada junto da tabela.
    unique('property_drafts_org_id_unique').on(t.orgId, t.id),
    domainCheck('property_drafts_status_valid', t.status, PROPERTY_DRAFT_STATUSES),
    // O imóvel criado pela confirmação é da mesma imobiliária do rascunho (P0-05).
    foreignKey({
      name: 'property_drafts_property_org_fk',
      columns: [t.orgId, t.propertyId],
      foreignColumns: [properties.orgId, properties.id],
    }).onDelete('set null'),
  ],
);

/**
 * Um campo sugerido por rascunho. Tabela própria em vez de um `jsonb`: o estado
 * do campo é vocabulário do produto — a tela colore por ele — e vocabulário sem
 * CHECK vira grafia livre em três meses.
 */
export const propertyDraftFields = pgTable(
  'property_draft_fields',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => propertyDrafts.id, { onDelete: 'cascade' }),
    fieldKey: text('field_key').notNull(),
    /** Sempre texto: é o que a pessoa lê e edita. A conversão é na confirmação. */
    value: text('value'),
    state: text('state').notNull(),
    /** Trecho da transcrição que originou o valor; liga campo e áudio na tela. */
    evidence: text('evidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Um campo por chave em cada rascunho: duas linhas de "Aluguel" seriam duas
    // respostas para a mesma pergunta, e a tela teria de escolher uma.
    uniqueIndex('property_draft_fields_draft_key_unique').on(t.draftId, t.fieldKey),
    index('property_draft_fields_draft_idx').on(t.draftId),
    domainCheck('property_draft_fields_field_key_valid', t.fieldKey, PROPERTY_DRAFT_FIELD_KEYS),
    domainCheck('property_draft_fields_state_valid', t.state, PROPERTY_DRAFT_FIELD_STATES),
    foreignKey({
      name: 'property_draft_fields_draft_org_fk',
      columns: [t.orgId, t.draftId],
      foreignColumns: [propertyDrafts.orgId, propertyDrafts.id],
    }).onDelete('cascade'),
  ],
);
