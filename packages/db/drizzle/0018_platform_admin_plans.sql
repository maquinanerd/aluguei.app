-- Admin da plataforma (decisão do usuário, 2026-09-15): cadastro aberto de imobiliária com
-- aprovação por um admin da plataforma e planos com limites, sem cobrança.
-- Editada à mão: o drizzle-kit adiciona as colunas já com o padrão final, o que deixaria
-- toda imobiliária existente pendente de aprovação e presa ao plano ESSENCIAL. Aqui os
-- planos padrão são semeados primeiro e as organizações existentes ficam ACTIVE no plano
-- ILIMITADO; só depois o padrão passa a PENDING_APPROVAL e ESSENCIAL para as novas.
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_users" integer,
	"max_properties" integer,
	"max_published_listings" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code"),
	CONSTRAINT "plans_code_format" CHECK ("plans"."code" ~ '^[A-Z0-9_]{2,40}$'),
	CONSTRAINT "plans_max_users_valid" CHECK ("plans"."max_users" is null or "plans"."max_users" >= 1),
	CONSTRAINT "plans_max_properties_valid" CHECK ("plans"."max_properties" is null or "plans"."max_properties" >= 0),
	CONSTRAINT "plans_max_published_listings_valid" CHECK ("plans"."max_published_listings" is null or "plans"."max_published_listings" >= 0)
);
--> statement-breakpoint
INSERT INTO "plans" ("id", "code", "name", "description", "max_users", "max_properties", "max_published_listings") VALUES
	('6f1c2a3e-1d2b-4c5a-8e9f-000000000001', 'ESSENCIAL', 'Essencial', 'Plano padrão de toda imobiliária nova.', 3, 50, 20),
	('6f1c2a3e-1d2b-4c5a-8e9f-000000000002', 'PROFISSIONAL', 'Profissional', 'Equipe maior e carteira ampla.', 10, 300, 150),
	('6f1c2a3e-1d2b-4c5a-8e9f-000000000003', 'ILIMITADO', 'Ilimitado', 'Sem limites de uso.', NULL, NULL, NULL);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_id" uuid DEFAULT '6f1c2a3e-1d2b-4c5a-8e9f-000000000003' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "plan_id" SET DEFAULT '6f1c2a3e-1d2b-4c5a-8e9f-000000000001';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "document" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "creci" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organizations_status_created_idx" ON "organizations" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_valid" CHECK ("organizations"."status" in ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED'));
