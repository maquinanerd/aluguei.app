-- G3, trilha C (auditoria 2026-09-10, P1-07, P1-08 e P1-20): encargos por atraso e dia de
-- vencimento na locação, participação de cada proprietário no repasse e histórico de renovação,
-- reajuste e encerramento.
-- Editada à mão em dois pontos: a restrição única (org_id, id) de "leases" vem antes das chaves
-- estrangeiras compostas que a usam (o drizzle-kit a colocava depois, e o PostgreSQL recusa FK sem
-- restrição única correspondente); e as locações existentes ganham o repasse de 100% para o
-- proprietário que já tinham, para a liquidação continuar pagando quem recebia.
ALTER TABLE "leases" ADD CONSTRAINT "leases_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
CREATE TABLE "lease_amendments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"effective_from" date,
	"previous_end_date" date,
	"new_end_date" date,
	"previous_rent_cents" integer,
	"new_rent_cents" integer,
	"index_name" text,
	"adjustment_bps" integer,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_amendments_kind_valid" CHECK ("lease_amendments"."kind" in ('RENEWAL', 'READJUSTMENT', 'TERMINATION')),
	CONSTRAINT "lease_amendments_rent_change_complete" CHECK (("lease_amendments"."new_rent_cents" is null) = ("lease_amendments"."previous_rent_cents" is null) and ("lease_amendments"."new_rent_cents" is null or ("lease_amendments"."effective_from" is not null and "lease_amendments"."new_rent_cents" >= 0)))
);
--> statement-breakpoint
CREATE TABLE "lease_landlords" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"share_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_landlords_share_bps_range" CHECK ("lease_landlords"."share_bps" > 0 and "lease_landlords"."share_bps" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "late_fee_bps" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "interest_monthly_bps" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "due_day" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "lease_amendments" ADD CONSTRAINT "lease_amendments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_amendments" ADD CONSTRAINT "lease_amendments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_amendments" ADD CONSTRAINT "lease_amendments_lease_org_fk" FOREIGN KEY ("org_id","lease_id") REFERENCES "public"."leases"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_landlords" ADD CONSTRAINT "lease_landlords_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_landlords" ADD CONSTRAINT "lease_landlords_lease_org_fk" FOREIGN KEY ("org_id","lease_id") REFERENCES "public"."leases"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_landlords" ADD CONSTRAINT "lease_landlords_party_org_fk" FOREIGN KEY ("org_id","party_id") REFERENCES "public"."parties"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lease_amendments_lease_created_idx" ON "lease_amendments" USING btree ("lease_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lease_landlords_lease_party_unique" ON "lease_landlords" USING btree ("lease_id","party_id");--> statement-breakpoint
CREATE INDEX "lease_landlords_org_party_idx" ON "lease_landlords" USING btree ("org_id","party_id");--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_late_fee_bps_range" CHECK ("leases"."late_fee_bps" between 0 and 1000);--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_interest_monthly_bps_range" CHECK ("leases"."interest_monthly_bps" between 0 and 100);--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_due_day_range" CHECK ("leases"."due_day" between 1 and 28);--> statement-breakpoint
-- Locações existentes: o proprietário que recebia o repasse continua com 100%.
INSERT INTO "lease_landlords" ("id", "org_id", "lease_id", "party_id", "share_bps")
SELECT gen_random_uuid(), l."org_id", l."id", l."landlord_party_id", 10000
FROM "leases" l
JOIN "parties" p ON p."id" = l."landlord_party_id" AND p."org_id" = l."org_id"
WHERE l."landlord_party_id" IS NOT NULL;
