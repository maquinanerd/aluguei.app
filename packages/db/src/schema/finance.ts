import { randomUUID } from 'node:crypto';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { contracts, organizations, parties, properties, users } from './index.js';

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
    landlordPartyId: uuid('landlord_party_id').references(() => parties.id, {
      onDelete: 'set null',
    }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'), // PENDING | ACTIVE | DELINQUENT | TERMINATING | ENDED
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    monthlyRentCents: integer('monthly_rent_cents').notNull(),
    condoFeeCents: integer('condo_fee_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leases_contract_unique').on(t.contractId),
    index('leases_org_status_idx').on(t.orgId, t.status),
    index('leases_org_created_idx').on(t.orgId, t.createdAt),
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
    providerChargeId: text('provider_charge_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('charges_lease_period_unique').on(t.leaseId, t.periodStart),
    index('charges_org_status_due_idx').on(t.orgId, t.status, t.dueDate),
    index('charges_org_provider_idx').on(t.orgId, t.providerChargeId),
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
    status: text('status').notNull().default('PENDING'), // PENDING | CONFIRMED | FAILED | REFUNDED
    providerPaymentId: text('provider_payment_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_org_charge_idx').on(t.orgId, t.chargeId),
    index('payments_org_status_idx').on(t.orgId, t.status),
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
    status: text('status').notNull().default('PENDING'), // PENDING | PAID | FAILED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('split_allocations_org_payment_idx').on(t.orgId, t.paymentId),
    index('split_allocations_org_status_idx').on(t.orgId, t.status),
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
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | PAID | FAILED
    providerPayoutId: text('provider_payout_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payouts_org_status_idx').on(t.orgId, t.status),
    index('payouts_org_party_idx').on(t.orgId, t.partyId),
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
  (t) => [uniqueIndex('ledger_accounts_org_code_unique').on(t.orgId, t.code)],
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
    referenceType: text('reference_type').notNull(), // CHARGE | PAYMENT | PAYOUT | REFUND | RECONCILIATION
    referenceId: text('reference_id').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_entries_transaction_account_unique').on(t.transactionId, t.accountId),
    index('ledger_entries_org_account_created_idx').on(t.orgId, t.accountId, t.createdAt),
    index('ledger_entries_org_reference_idx').on(t.orgId, t.referenceType, t.referenceId),
  ],
);

export const reconciliations = pgTable(
  'reconciliations',
  {
    id: uuid('id').primaryKey().$defaultFn(randomUUID),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // FAKE | ASAAS
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | MATCHED | DISCREPANCY
    providerTotalCents: integer('provider_total_cents'),
    localTotalCents: integer('local_total_cents'),
    differences: jsonb('differences').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reconciliations_org_status_idx').on(t.orgId, t.status),
    index('reconciliations_org_provider_period_idx').on(t.orgId, t.provider, t.periodStart),
  ],
);

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
  (t) => [index('party_bank_accounts_org_party_idx').on(t.orgId, t.partyId)],
);
