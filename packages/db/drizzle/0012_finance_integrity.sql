CREATE TABLE "fake_provider_charges" (
	"provider_charge_id" text PRIMARY KEY NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"external_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "paid_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "business_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pix_qr_code" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "boleto_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DO $$
DECLARE duplicated bigint;
BEGIN
  SELECT count(*) INTO duplicated FROM (
    SELECT payment_id, role, party_id FROM split_allocations
    GROUP BY payment_id, role, party_id HAVING count(*) > 1
  ) t;
  IF duplicated > 0 THEN
    RAISE EXCEPTION 'split_allocations duplicadas (%): efeito do duplo credito (auditoria 2026-09-10, P0-01). Sanear os dados antes de aplicar esta migration.', duplicated;
  END IF;
END $$;--> statement-breakpoint
UPDATE charges SET provider_charge_id = provider_charge_id || '.legacy.' || id::text
WHERE provider_charge_id LIKE 'pc.fake.%'
  AND provider_charge_id IN (
    SELECT provider_charge_id FROM charges WHERE provider_charge_id IS NOT NULL
    GROUP BY provider_charge_id HAVING count(*) > 1
  );--> statement-breakpoint
DO $$
DECLARE duplicated bigint;
BEGIN
  SELECT count(*) INTO duplicated FROM (
    SELECT provider_charge_id FROM charges WHERE provider_charge_id IS NOT NULL
    GROUP BY provider_charge_id HAVING count(*) > 1
  ) t;
  IF duplicated > 0 THEN
    RAISE EXCEPTION 'provider_charge_id repetido em % cobrancas: resolver manualmente antes de aplicar esta migration.', duplicated;
  END IF;
END $$;--> statement-breakpoint
UPDATE payments p SET status = 'CANCELLED'
WHERE p.status = 'PENDING' AND EXISTS (
  SELECT 1 FROM payments q
  WHERE q.charge_id = p.charge_id AND q.status = 'PENDING'
    AND (q.created_at > p.created_at OR (q.created_at = p.created_at AND q.id > p.id))
);--> statement-breakpoint
UPDATE payments p
SET provider = CASE WHEN c.provider_charge_id LIKE 'pc.fake.%' THEN 'FAKE' ELSE 'ASAAS' END,
    provider_payment_id = c.provider_charge_id
FROM charges c
WHERE p.charge_id = c.id
  AND c.provider_charge_id IS NOT NULL
  AND p.provider_payment_id IS NULL
  AND p.id = (SELECT q.id FROM payments q WHERE q.charge_id = c.id ORDER BY q.created_at DESC, q.id DESC LIMIT 1);--> statement-breakpoint
UPDATE charges c SET paid_payment_id = p.id
FROM payments p
WHERE p.charge_id = c.id
  AND c.status IN ('PAID', 'REFUNDED')
  AND p.status IN ('CONFIRMED', 'REFUNDED')
  AND (SELECT count(*) FROM payments q WHERE q.charge_id = c.id AND q.status IN ('CONFIRMED', 'REFUNDED')) = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_provider_charge_unique" ON "charges" USING btree ("provider_charge_id") WHERE "charges"."provider_charge_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_org_business_key_account_unique" ON "ledger_entries" USING btree ("org_id","business_key","account_id") WHERE "ledger_entries"."business_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_charge_pending_unique" ON "payments" USING btree ("charge_id") WHERE "payments"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_payment_party_unique" ON "payouts" USING btree ("payment_id","party_id") WHERE "payouts"."payment_id" is not null;--> statement-breakpoint
ALTER TABLE "split_allocations" ADD CONSTRAINT "split_allocations_payment_role_party_unique" UNIQUE NULLS NOT DISTINCT("payment_id","role","party_id");--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_amounts_non_negative" CHECK ("charges"."amount_cents" >= 0 and "charges"."rent_cents" >= 0 and "charges"."condo_fee_cents" >= 0 and "charges"."late_fee_cents" >= 0 and "charges"."interest_cents" >= 0 and "charges"."taxes_cents" >= 0 and "charges"."discount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_sign_matches_type" CHECK (("ledger_entries"."entry_type" = 'DEBIT' and "ledger_entries"."amount_cents" > 0) or ("ledger_entries"."entry_type" = 'CREDIT' and "ledger_entries"."amount_cents" <= 0));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_required_with_id" CHECK ("payments"."provider_payment_id" is null or "payments"."provider" is not null);--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_non_negative" CHECK ("payouts"."amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "split_allocations" ADD CONSTRAINT "split_allocations_amount_non_negative" CHECK ("split_allocations"."amount_cents" >= 0);
