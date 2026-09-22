import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
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
import { contracts, organizations, parties, properties, users } from './index.js';
import { domainCheck } from './checks.js';

export const leases = pgTable(
  'leases',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    tenantPartyId: uuid('tenant_party_id').references(() => parties.id, { onDelete: 'set null' }),
    // Proprietário principal (maior participação); o repasse usa `lease_landlords`.
    landlordPartyId: uuid('landlord_party_id').references(() => parties.id, {
      onDelete: 'set null',
    }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'), // PENDING | ACTIVE | DELINQUENT | TERMINATING | ENDED
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    // Aluguel em vigor hoje; o de cada período sai do histórico em `lease_amendments`.
    monthlyRentCents: integer('monthly_rent_cents').notNull(),
    condoFeeCents: integer('condo_fee_cents'),
    // Encargos por atraso e vencimento (auditoria 2026-09-10, P1-07).
    lateFeeBps: integer('late_fee_bps').notNull().default(200),
    interestMonthlyBps: integer('interest_monthly_bps').notNull().default(100),
    dueDay: integer('due_day').notNull().default(10),
    endReason: text('end_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leases_contract_unique').on(t.contractId),
    index('leases_org_status_idx').on(t.orgId, t.status),
    index('leases_org_created_idx').on(t.orgId, t.createdAt),
    unique('leases_org_id_unique').on(t.orgId, t.id),
    check('leases_late_fee_bps_range', sql`${t.lateFeeBps} between 0 and 1000`),
    check('leases_interest_monthly_bps_range', sql`${t.interestMonthlyBps} between 0 and 100`),
    check('leases_due_day_range', sql`${t.dueDay} between 1 and 28`),
    domainCheck('leases_status_valid', t.status, [
      'PENDING',
      'ACTIVE',
      'DELINQUENT',
      'TERMINATING',
      'ENDED',
    ]),
  ],
);

/** Participação de cada proprietário no repasse da locação (auditoria 2026-09-10, P1-08). */
export const leaseLandlords = pgTable(
  'lease_landlords',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leaseId: uuid('lease_id').notNull(),
    partyId: uuid('party_id').notNull(),
    shareBps: integer('share_bps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lease_landlords_lease_party_unique').on(t.leaseId, t.partyId),
    index('lease_landlords_org_party_idx').on(t.orgId, t.partyId),
    check('lease_landlords_share_bps_range', sql`${t.shareBps} > 0 and ${t.shareBps} <= 10000`),
    foreignKey({
      name: 'lease_landlords_lease_org_fk',
      columns: [t.orgId, t.leaseId],
      foreignColumns: [leases.orgId, leases.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'lease_landlords_party_org_fk',
      columns: [t.orgId, t.partyId],
      foreignColumns: [parties.orgId, parties.id],
    }).onDelete('restrict'),
  ],
);

/** Renovação, reajuste e encerramento da locação (auditoria 2026-09-10, P1-20). */
export const leaseAmendments = pgTable(
  'lease_amendments',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leaseId: uuid('lease_id').notNull(),
    kind: text('kind').notNull(), // RENEWAL | READJUSTMENT | TERMINATION
    // Primeiro dia do mês em que o novo aluguel vale (null quando o aluguel não muda).
    effectiveFrom: date('effective_from', { mode: 'string' }),
    previousEndDate: date('previous_end_date', { mode: 'string' }),
    newEndDate: date('new_end_date', { mode: 'string' }),
    previousRentCents: integer('previous_rent_cents'),
    newRentCents: integer('new_rent_cents'),
    indexName: text('index_name'),
    adjustmentBps: integer('adjustment_bps'),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lease_amendments_lease_created_idx').on(t.leaseId, t.createdAt),
    check(
      'lease_amendments_kind_valid',
      sql`${t.kind} in ('RENEWAL', 'READJUSTMENT', 'TERMINATION')`,
    ),
    domainCheck(
      'lease_amendments_index_name_valid',
      t.indexName,
      ['IGPM', 'IPCA', 'INPC', 'IVAR', 'OUTRO'],
      { nullable: true },
    ),
    check(
      'lease_amendments_rent_change_complete',
      sql`(${t.newRentCents} is null) = (${t.previousRentCents} is null) and (${t.newRentCents} is null or (${t.effectiveFrom} is not null and ${t.newRentCents} >= 0))`,
    ),
    foreignKey({
      name: 'lease_amendments_lease_org_fk',
      columns: [t.orgId, t.leaseId],
      foreignColumns: [leases.orgId, leases.id],
    }).onDelete('cascade'),
  ],
);

export const charges = pgTable(
  'charges',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leaseId: uuid('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('SCHEDULED'), // SCHEDULED | OPEN | PAID | OVERDUE | CANCELLED | REFUNDED
    amountCents: integer('amount_cents').notNull(),
    rentCents: integer('rent_cents').notNull(),
    condoFeeCents: integer('condo_fee_cents').notNull().default(0),
    lateFeeCents: integer('late_fee_cents').notNull().default(0),
    interestCents: integer('interest_cents').notNull().default(0),
    taxesCents: integer('taxes_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Tentativa que liquidou a cobrança (sem FK: payments já referencia charges). */
    paidPaymentId: uuid('paid_payment_id'),
    providerChargeId: text('provider_charge_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('charges_lease_period_unique').on(t.leaseId, t.periodStart),
    index('charges_org_status_due_idx').on(t.orgId, t.status, t.dueDate),
    index('charges_org_provider_idx').on(t.orgId, t.providerChargeId),
    // Um id de cobrança do provider aponta para uma única cobrança (P0-03).
    uniqueIndex('charges_provider_charge_unique')
      .on(t.providerChargeId)
      .where(sql`${t.providerChargeId} is not null`),
    check(
      'charges_amounts_non_negative',
      sql`${t.amountCents} >= 0 and ${t.rentCents} >= 0 and ${t.condoFeeCents} >= 0 and ${t.lateFeeCents} >= 0 and ${t.interestCents} >= 0 and ${t.taxesCents} >= 0 and ${t.discountCents} >= 0`,
    ),
    domainCheck('charges_status_valid', t.status, [
      'SCHEDULED',
      'OPEN',
      'PAID',
      'OVERDUE',
      'CANCELLED',
      'REFUNDED',
    ]),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    chargeId: uuid('charge_id')
      .notNull()
      .references(() => charges.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    method: text('method').notNull(), // PIX | BOLETO | CREDIT_CARD | MANUAL
    status: text('status').notNull().default('PENDING'), // PENDING | CONFIRMED | FAILED | CANCELLED | REFUNDED
    provider: text('provider'), // FAKE | ASAAS — com provider_payment_id identifica a tentativa
    providerPaymentId: text('provider_payment_id'),
    /** QR/boleto emitidos pelo provider: reemissão idempotente devolve os mesmos. */
    pixQrCode: text('pix_qr_code'),
    boletoUrl: text('boleto_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_org_charge_idx').on(t.orgId, t.chargeId),
    index('payments_org_status_idx').on(t.orgId, t.status),
    // O evento do provider resolve exatamente uma tentativa (P0-01/P0-02).
    uniqueIndex('payments_provider_payment_unique')
      .on(t.provider, t.providerPaymentId)
      .where(sql`${t.providerPaymentId} is not null`),
    // No máximo uma tentativa pendente por cobrança (P0-03: reemissão idempotente).
    uniqueIndex('payments_charge_pending_unique')
      .on(t.chargeId)
      .where(sql`${t.status} = 'PENDING'`),
    check('payments_amount_non_negative', sql`${t.amountCents} >= 0`),
    check(
      'payments_provider_required_with_id',
      sql`${t.providerPaymentId} is null or ${t.provider} is not null`,
    ),
    domainCheck('payments_method_valid', t.method, ['PIX', 'BOLETO', 'CREDIT_CARD', 'MANUAL']),
    domainCheck('payments_status_valid', t.status, [
      'PENDING',
      'CONFIRMED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
    ]),
  ],
);

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'), // PENDING | SUCCESS | FAILED
    providerMessage: text('provider_message'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_attempts_org_payment_idx').on(t.orgId, t.paymentId)],
);

export const splitRules = pgTable(
  'split_rules',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leaseId: uuid('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    landlordPartyId: uuid('landlord_party_id').references(() => parties.id, {
      onDelete: 'set null',
    }),
    agencyShareBps: integer('agency_share_bps').notNull().default(1000), // 10% da comissão sobre aluguel
    landlordShareBps: integer('landlord_share_bps').notNull().default(9000),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('split_rules_lease_unique').on(t.leaseId),
    index('split_rules_org_idx').on(t.orgId),
  ],
);

export const splitAllocations = pgTable(
  'split_allocations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id').references(() => parties.id, { onDelete: 'set null' }),
    role: text('role').notNull(), // LANDLORD | AGENCY
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | PAID | FAILED | CANCELLED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('split_allocations_org_payment_idx').on(t.orgId, t.paymentId),
    index('split_allocations_org_status_idx').on(t.orgId, t.status),
    // Um split por pagamento/papel/parte — liquidação repetida não duplica (P0-01).
    unique('split_allocations_payment_role_party_unique')
      .on(t.paymentId, t.role, t.partyId)
      .nullsNotDistinct(),
    check('split_allocations_amount_non_negative', sql`${t.amountCents} >= 0`),
    domainCheck('split_allocations_role_valid', t.role, ['LANDLORD', 'AGENCY']),
  ],
);

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id').references(() => parties.id, { onDelete: 'set null' }),
    /** Pagamento que originou o repasse (liquidação repetida não gera segundo repasse). */
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | PAID | FAILED | CANCELLED
    providerPayoutId: text('provider_payout_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payouts_org_status_idx').on(t.orgId, t.status),
    index('payouts_org_party_idx').on(t.orgId, t.partyId),
    // Um repasse por pagamento/parte (P0-01: duplo repasse).
    uniqueIndex('payouts_payment_party_unique')
      .on(t.paymentId, t.partyId)
      .where(sql`${t.paymentId} is not null`),
    check('payouts_amount_non_negative', sql`${t.amountCents} >= 0`),
    domainCheck('payouts_status_valid', t.status, ['PENDING', 'PAID', 'FAILED', 'CANCELLED']),
  ],
);

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(), // CASH | AR_RECEIVABLE | AGENCY_FEE_REVENUE | LANDLORD_PAYABLE
    name: text('name').notNull(),
    type: text('type').notNull(), // ASSET | LIABILITY | REVENUE | EQUITY
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_accounts_org_code_unique').on(t.orgId, t.code),
    domainCheck('ledger_accounts_type_valid', t.type, ['ASSET', 'LIABILITY', 'REVENUE', 'EQUITY']),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(), // DEBIT positivo / CREDIT negativo (soma por transaction_id = 0)
    entryType: text('entry_type').notNull(), // DEBIT | CREDIT
    referenceType: text('reference_type').notNull(), // CHARGE | CHARGE_ADJUST | CHARGE_CANCEL | PAYMENT | PAYOUT | PAYOUT_REVERSAL | REFUND | RECONCILIATION
    referenceId: text('reference_id').notNull(),
    /** Operação de negócio (ex.: PAYMENT:<id>): a mesma chave nunca lança duas vezes. */
    businessKey: text('business_key'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_entries_transaction_account_unique').on(t.transactionId, t.accountId),
    index('ledger_entries_org_account_created_idx').on(t.orgId, t.accountId, t.createdAt),
    index('ledger_entries_org_reference_idx').on(t.orgId, t.referenceType, t.referenceId),
    uniqueIndex('ledger_entries_org_business_key_account_unique')
      .on(t.orgId, t.businessKey, t.accountId)
      .where(sql`${t.businessKey} is not null`),
    check(
      'ledger_entries_sign_matches_type',
      sql`(${t.entryType} = 'DEBIT' and ${t.amountCents} > 0) or (${t.entryType} = 'CREDIT' and ${t.amountCents} <= 0)`,
    ),
  ],
);

export const reconciliations = pgTable(
  'reconciliations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // FAKE | ASAAS | NONE (sem provider de pagamento)
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | MATCHED | DISCREPANCY
    // Soma de muitas cobranças: int4 estourava acima de R$ 21.474.836,47 (P2-12). O modo
    // number vale até 2^53 − 1 centavos; o contrato da API continua número inteiro.
    providerTotalCents: bigint('provider_total_cents', { mode: 'number' }),
    localTotalCents: bigint('local_total_cents', { mode: 'number' }),
    differences: jsonb('differences').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reconciliations_org_status_idx').on(t.orgId, t.status),
    index('reconciliations_org_provider_period_idx').on(t.orgId, t.provider, t.periodStart),
    domainCheck('reconciliations_status_valid', t.status, ['PENDING', 'MATCHED', 'DISCREPANCY']),
    domainCheck('reconciliations_provider_valid', t.provider, ['FAKE', 'ASAAS', 'NONE']),
  ],
);

/**
 * Estado do provider de pagamento FAKE (dev/E2E). API e worker são processos
 * separados: com o estado em memória a stack integrada nunca liquidava um
 * pagamento (auditoria 2026-09-10, P1-13). Nunca é usada com provider real.
 */
export const fakeProviderCharges = pgTable('fake_provider_charges', {
  providerChargeId: text('provider_charge_id').primaryKey(),
  amountCents: integer('amount_cents').notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING | CONFIRMED | FAILED | REFUNDED
  externalReference: text('external_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partyBankAccounts = pgTable(
  'party_bank_accounts',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('CHECKING'), // CHECKING | SAVINGS | PAYMENT_ACCOUNT
    bankCode: text('bank_code').notNull(),
    branch: text('branch'),
    accountNumber: text('account_number'),
    accountDigit: text('account_digit'),
    pixKey: text('pix_key'),
    holderName: text('holder_name').notNull(),
    holderDocument: text('holder_document').notNull(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | INACTIVE
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('party_bank_accounts_org_party_idx').on(t.orgId, t.partyId),
    domainCheck('party_bank_accounts_status_valid', t.status, ['ACTIVE', 'INACTIVE']),
  ],
);
