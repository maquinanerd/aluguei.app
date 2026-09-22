import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
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
import { leads, parties, partyConsents, proposals } from './crm.js';
import { properties } from './properties.js';
import { domainCheck } from './checks.js';

export const rentalApplications = pgTable(
  'rental_applications',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id'),
    partyId: uuid('party_id').notNull(),
    propertyId: uuid('property_id').notNull(),
    proposalId: uuid('proposal_id'),
    status: text('status').notNull().default('DRAFT'), // DRAFT|SUBMITTED|SCREENING|MANUAL_REVIEW|APPROVED|REJECTED|CONTRACTING
    decisionReason: text('decision_reason'),
    // Origem da decisão de crédito (P1-06): MANUAL (pessoa, com decided_by) |
    // AUTOMATIC (regras sobre o resultado do screening, sem decided_by).
    decisionSource: text('decision_source'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rental_applications_org_status_idx').on(t.orgId, t.status),
    index('rental_applications_org_created_idx').on(t.orgId, t.createdAt),
    index('rental_applications_party_idx').on(t.partyId),
    index('rental_applications_lead_idx').on(t.leadId),
    index('rental_applications_property_idx').on(t.propertyId),
    index('rental_applications_proposal_idx').on(t.proposalId),
    // Candidatura só referencia pessoa, imóvel, lead e proposta da própria
    // organização (auditoria 2026-09-10, P0-05).
    foreignKey({
      name: 'applications_party_org_fk',
      columns: [t.orgId, t.partyId],
      foreignColumns: [parties.orgId, parties.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'applications_property_org_fk',
      columns: [t.orgId, t.propertyId],
      foreignColumns: [properties.orgId, properties.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'applications_lead_org_fk',
      columns: [t.orgId, t.leadId],
      foreignColumns: [leads.orgId, leads.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'applications_proposal_org_fk',
      columns: [t.orgId, t.proposalId],
      foreignColumns: [proposals.orgId, proposals.id],
    }).onDelete('set null'),
    // Decisão de crédito sempre com motivo, data e origem (P1-06). `decided_by`
    // fica fora do CHECK porque a FK é ON DELETE SET NULL.
    check(
      'rental_applications_decision_source_valid',
      sql`${t.decisionSource} is null or ${t.decisionSource} in ('MANUAL', 'AUTOMATIC')`,
    ),
    check(
      'rental_applications_decision_recorded',
      sql`${t.status} not in ('APPROVED', 'REJECTED', 'CONTRACTING') or (${t.decisionReason} is not null and btrim(${t.decisionReason}) <> '' and ${t.decidedAt} is not null and ${t.decisionSource} is not null)`,
    ),
    domainCheck('rental_applications_status_valid', t.status, [
      'DRAFT',
      'SUBMITTED',
      'SCREENING',
      'MANUAL_REVIEW',
      'APPROVED',
      'REJECTED',
      'CONTRACTING',
    ]),
  ],
);

export const screeningRequests = pgTable(
  'screening_requests',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => rentalApplications.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id').references(() => parties.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(), // SERASA | SPC | FAKE
    purpose: text('purpose').notNull(), // CREDIT_SCREENING (LGPD)
    consentId: uuid('consent_id').references(() => partyConsents.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('PENDING'), // PENDING | COMPLETED | FAILED
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rawPayload: jsonb('raw_payload'), // sensível — sem isPublic
  },
  (t) => [
    index('screening_requests_org_application_idx').on(t.orgId, t.applicationId),
    index('screening_requests_status_idx').on(t.status),
    index('screening_requests_provider_idx').on(t.provider),
  ],
);

export const screeningResults = pgTable(
  'screening_results',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => rentalApplications.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').references(() => screeningRequests.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    score: integer('score'),
    summary: jsonb('summary').notNull().default({}),
    redFlags: jsonb('red_flags').notNull().default([]),
    decision: text('decision').notNull(), // APPROVE | REVIEW | REJECT
    decisionRules: jsonb('decision_rules').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('screening_results_org_application_idx').on(t.orgId, t.applicationId, t.createdAt),
    domainCheck('screening_results_decision_valid', t.decision, ['APPROVE', 'REVIEW', 'REJECT']),
  ],
);

export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    body: text('body').notNull(), // placeholders {{var}}
    status: text('status').notNull().default('DRAFT'), // DRAFT | APPROVED | ARCHIVED
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contract_templates_org_name_version_unique').on(t.orgId, t.name, t.version),
    index('contract_templates_org_status_idx').on(t.orgId, t.status),
    domainCheck('contract_templates_status_valid', t.status, ['DRAFT', 'APPROVED', 'ARCHIVED']),
  ],
);

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => contractTemplates.id, {
      onDelete: 'set null',
    }),
    applicationId: uuid('application_id').references(() => rentalApplications.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('DRAFT'), // DRAFT|GENERATED|SENT_FOR_SIGNATURE|PARTIALLY_SIGNED|SIGNED|VOID
    // Cópia da versão vigente (contract_versions): conteúdo e hash só mudam em
    // DRAFT/GENERATED; a partir do envio o banco recusa a escrita (P0-04).
    content: text('content'),
    contentHash: text('content_hash'),
    currentVersion: integer('current_version'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contracts_org_status_idx').on(t.orgId, t.status),
    index('contracts_org_application_idx').on(t.orgId, t.applicationId),
    unique('contracts_org_id_unique').on(t.orgId, t.id),
    domainCheck('contracts_status_valid', t.status, [
      'DRAFT',
      'GENERATED',
      'SENT_FOR_SIGNATURE',
      'PARTIALLY_SIGNED',
      'SIGNED',
      'VOID',
    ]),
  ],
);

/**
 * Versões do texto do contrato (auditoria 2026-09-10, P0-04): cada geração
 * grava uma linha nova com o hash do conteúdo; nenhuma versão é reescrita
 * (gatilho `contract_versions_immutable` na migration 0014).
 */
export const contractVersions = pgTable(
  'contract_versions',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    templateId: uuid('template_id').references(() => contractTemplates.id, {
      onDelete: 'set null',
    }),
    templateVersion: integer('template_version'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contract_versions_contract_version_unique').on(t.contractId, t.version),
    index('contract_versions_org_contract_idx').on(t.orgId, t.contractId),
    foreignKey({
      name: 'contract_versions_contract_org_fk',
      columns: [t.orgId, t.contractId],
      foreignColumns: [contracts.orgId, contracts.id],
    }).onDelete('cascade'),
    check('contract_versions_version_positive', sql`${t.version} > 0`),
  ],
);

export const contractParties = pgTable(
  'contract_parties',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id').references(() => parties.id, { onDelete: 'set null' }),
    role: text('role').notNull(), // LANDLORD | TENANT | GUARANTOR
    signOrder: integer('sign_order').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('contract_parties_contract_party_unique').on(t.contractId, t.partyId),
    index('contract_parties_org_idx').on(t.orgId),
    domainCheck('contract_parties_role_valid', t.role, ['LANDLORD', 'TENANT', 'GUARANTOR']),
  ],
);

export const signatureEnvelopes = pgTable(
  'signature_envelopes',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // CLICKSIGN | D4SIGN | FAKE
    providerEnvelopeId: text('provider_envelope_id').notNull(),
    // Versão do contrato enviada ao provider (P0-04).
    contractVersion: integer('contract_version'),
    // SHA-256 hex do documento (PDF) enviado ao provider (P1-11).
    documentHash: text('document_hash'),
    status: text('status').notNull().default('SENT'), // PENDING|SENT|PARTIALLY_SIGNED|SIGNED|FAILED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('signature_envelopes_provider_id_unique').on(t.provider, t.providerEnvelopeId),
    index('signature_envelopes_org_contract_idx').on(t.orgId, t.contractId),
    domainCheck('signature_envelopes_status_valid', t.status, [
      'PENDING',
      'SENT',
      'PARTIALLY_SIGNED',
      'SIGNED',
      'FAILED',
    ]),
  ],
);

export const signatureEvents = pgTable(
  'signature_events',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => signatureEnvelopes.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(), // SIGNER_SIGNED | COMPLETED | FAILED
    providerEventId: text('provider_event_id').notNull(),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('signature_events_provider_id_unique').on(t.provider, t.providerEventId),
    index('signature_events_org_envelope_idx').on(t.orgId, t.envelopeId),
    domainCheck('signature_events_event_type_valid', t.eventType, [
      'SIGNER_SIGNED',
      'COMPLETED',
      'FAILED',
    ]),
  ],
);
