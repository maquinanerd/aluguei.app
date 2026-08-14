CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"amount_cents" integer NOT NULL,
	"rent_cents" integer NOT NULL,
	"condo_fee_cents" integer DEFAULT 0 NOT NULL,
	"late_fee_cents" integer DEFAULT 0 NOT NULL,
	"interest_cents" integer DEFAULT 0 NOT NULL,
	"taxes_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"provider_charge_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"tenant_party_id" uuid,
	"landlord_party_id" uuid,
	"property_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"monthly_rent_cents" integer NOT NULL,
	"condo_fee_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"entry_type" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_bank_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"kind" text DEFAULT 'CHECKING' NOT NULL,
	"bank_code" text NOT NULL,
	"branch" text,
	"account_number" text,
	"account_digit" text,
	"pix_key" text,
	"holder_name" text NOT NULL,
	"holder_document" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_message" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"party_id" uuid,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_payout_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_total_cents" integer,
	"local_total_cents" integer,
	"differences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"party_id" uuid,
	"role" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"landlord_party_id" uuid,
	"agency_share_bps" integer DEFAULT 1000 NOT NULL,
	"landlord_share_bps" integer DEFAULT 9000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_party_id_parties_id_fk" FOREIGN KEY ("tenant_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_landlord_party_id_parties_id_fk" FOREIGN KEY ("landlord_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_allocations" ADD CONSTRAINT "split_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_allocations" ADD CONSTRAINT "split_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_allocations" ADD CONSTRAINT "split_allocations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rules" ADD CONSTRAINT "split_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rules" ADD CONSTRAINT "split_rules_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_rules" ADD CONSTRAINT "split_rules_landlord_party_id_parties_id_fk" FOREIGN KEY ("landlord_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_lease_period_unique" ON "charges" USING btree ("lease_id","period_start");--> statement-breakpoint
CREATE INDEX "charges_org_status_due_idx" ON "charges" USING btree ("org_id","status","due_date");--> statement-breakpoint
CREATE INDEX "charges_org_provider_idx" ON "charges" USING btree ("org_id","provider_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leases_contract_unique" ON "leases" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "leases_org_status_idx" ON "leases" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "leases_org_created_idx" ON "leases" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_org_code_unique" ON "ledger_accounts" USING btree ("org_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_transaction_account_unique" ON "ledger_entries" USING btree ("transaction_id","account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_org_account_created_idx" ON "ledger_entries" USING btree ("org_id","account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_org_reference_idx" ON "ledger_entries" USING btree ("org_id","reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "party_bank_accounts_org_party_idx" ON "party_bank_accounts" USING btree ("org_id","party_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_org_payment_idx" ON "payment_attempts" USING btree ("org_id","payment_id");--> statement-breakpoint
CREATE INDEX "payments_org_charge_idx" ON "payments" USING btree ("org_id","charge_id");--> statement-breakpoint
CREATE INDEX "payments_org_status_idx" ON "payments" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "payouts_org_status_idx" ON "payouts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "payouts_org_party_idx" ON "payouts" USING btree ("org_id","party_id");--> statement-breakpoint
CREATE INDEX "reconciliations_org_status_idx" ON "reconciliations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "reconciliations_org_provider_period_idx" ON "reconciliations" USING btree ("org_id","provider","period_start");--> statement-breakpoint
CREATE INDEX "split_allocations_org_payment_idx" ON "split_allocations" USING btree ("org_id","payment_id");--> statement-breakpoint
CREATE INDEX "split_allocations_org_status_idx" ON "split_allocations" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "split_rules_lease_unique" ON "split_rules" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "split_rules_org_idx" ON "split_rules" USING btree ("org_id");