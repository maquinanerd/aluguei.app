-- Grupo OLX (ADR-107): canal grupoolx em modo FEED, conexao por imobiliaria (token do feed so em
-- hash), registro das buscas do feed e dos relatorios de importacao, colunas da distribuicao na
-- publicacao (destaque, tipo no portal, motivos, ultima busca), suites no imovel e e-mail publico de
-- contato da imobiliaria. So amplia CHECKs: nenhum valor antigo deixa de valer.
CREATE TABLE "channel_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"destinations" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_account_id" text,
	"external_customer_id" text,
	"feed_token_hash" text,
	"feed_token_hint" text,
	"feed_token_created_at" timestamp with time zone,
	"display_address" text DEFAULT 'Neighborhood' NOT NULL,
	"listing_quota" integer,
	"featured_quota" integer,
	"super_featured_quota" integer,
	"last_feed_fetch_at" timestamp with time zone,
	"last_crawler_fetch_at" timestamp with time zone,
	"last_crawler_listing_count" integer,
	"last_report_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"lead_duplicate_deliveries" integer DEFAULT 0 NOT NULL,
	"last_lead_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_connections_channel_valid" CHECK ("channel_connections"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb', 'grupoolx')),
	CONSTRAINT "channel_connections_display_address_valid" CHECK ("channel_connections"."display_address" in ('Neighborhood', 'Street', 'All')),
	CONSTRAINT "channel_connections_destinations_valid" CHECK ("channel_connections"."destinations" <@ array['ZAP'::text, 'VIVAREAL'::text, 'OLX'::text]),
	CONSTRAINT "channel_connections_quotas_nonnegative" CHECK (("channel_connections"."listing_quota" is null or "channel_connections"."listing_quota" >= 0) and ("channel_connections"."featured_quota" is null or "channel_connections"."featured_quota" >= 0) and ("channel_connections"."super_featured_quota" is null or "channel_connections"."super_featured_quota" >= 0)),
	CONSTRAINT "channel_connections_feed_token_complete" CHECK (("channel_connections"."feed_token_hash" is null) = ("channel_connections"."feed_token_hint" is null) and ("channel_connections"."feed_token_hash" is null) = ("channel_connections"."feed_token_created_at" is null))
);
--> statement-breakpoint
CREATE TABLE "channel_feed_fetches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_crawler" boolean NOT NULL,
	"user_agent" text,
	"listing_count" integer DEFAULT 0 NOT NULL,
	"blocked_count" integer DEFAULT 0 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"error_message" text,
	CONSTRAINT "channel_feed_fetches_channel_valid" CHECK ("channel_feed_fetches"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb', 'grupoolx')),
	CONSTRAINT "channel_feed_fetches_outcome_valid" CHECK ("channel_feed_fetches"."outcome" in ('OK', 'ERROR'))
);
--> statement-breakpoint
CREATE TABLE "channel_import_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid,
	"channel" text NOT NULL,
	"external_report_id" text NOT NULL,
	"company" text,
	"report_date" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contracted" integer,
	"created" integer,
	"updated" integer,
	"deleted" integer,
	"unchanged" integer,
	"error_count" integer,
	"warning_count" integer,
	"link" text,
	"errors" jsonb,
	"warnings" jsonb,
	CONSTRAINT "channel_import_reports_channel_valid" CHECK ("channel_import_reports"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb', 'grupoolx'))
);
--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" DROP CONSTRAINT "channel_sync_jobs_channel_valid";--> statement-breakpoint
ALTER TABLE "listing_channel_publications" DROP CONSTRAINT "listing_channel_publications_channel_valid";--> statement-breakpoint
ALTER TABLE "listing_channel_publications" DROP CONSTRAINT "listing_channel_publications_status_valid";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_contact_email" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "suites" integer;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD COLUMN "publication_tier" text;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD COLUMN "portal_property_type" text;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD COLUMN "issues" jsonb;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD COLUMN "last_in_feed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD COLUMN "feed_content_hash" text;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD COLUMN "last_report_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_feed_fetches" ADD CONSTRAINT "channel_feed_fetches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_feed_fetches" ADD CONSTRAINT "channel_feed_fetches_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_import_reports" ADD CONSTRAINT "channel_import_reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_import_reports" ADD CONSTRAINT "channel_import_reports_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_org_channel_unique" ON "channel_connections" USING btree ("org_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_feed_token_hash_unique" ON "channel_connections" USING btree ("feed_token_hash");--> statement-breakpoint
CREATE INDEX "channel_feed_fetches_connection_fetched_idx" ON "channel_feed_fetches" USING btree ("connection_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_import_reports_org_external_unique" ON "channel_import_reports" USING btree ("org_id","channel","external_report_id");--> statement-breakpoint
CREATE INDEX "channel_import_reports_org_received_idx" ON "channel_import_reports" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE INDEX "channel_publications_org_channel_listing_idx" ON "listing_channel_publications" USING btree ("org_id","channel","listing_id");--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" ADD CONSTRAINT "channel_sync_jobs_channel_valid" CHECK ("channel_sync_jobs"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb', 'grupoolx'));--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_publication_tier_valid" CHECK ("listing_channel_publications"."publication_tier" is null or "listing_channel_publications"."publication_tier" in ('STANDARD', 'PREMIUM', 'SUPER_PREMIUM', 'PREMIERE_1', 'PREMIERE_2', 'TRIPLE'));--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_portal_property_type_valid" CHECK ("listing_channel_publications"."portal_property_type" is null or "listing_channel_publications"."portal_property_type" in ('Residential / Apartment', 'Residential / Home', 'Residential / Condo', 'Residential / Village House', 'Residential / Farm Ranch', 'Residential / Penthouse', 'Residential / Flat', 'Residential / Kitnet', 'Residential / Studio', 'Residential / Loft', 'Residential / Sobrado', 'Residential / Agricultural', 'Residential / Land Lot', 'Commercial / Consultorio', 'Commercial / Edificio Residencial', 'Commercial / Industrial', 'Commercial / Building', 'Commercial / Garage', 'Commercial / Hotel', 'Commercial / Business', 'Commercial / Corporate Floor', 'Commercial / Land Lot', 'Commercial / Office', 'Commercial / Edificio Comercial'));--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_channel_valid" CHECK ("listing_channel_publications"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb', 'grupoolx'));--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_status_valid" CHECK ("listing_channel_publications"."status" in ('PENDING', 'PUBLISHING', 'PUBLISHED', 'UPDATE_PENDING', 'REMOVING', 'REMOVED', 'FAILED', 'RECONCILING', 'BLOCKED', 'ELIGIBLE', 'AWAITING_IMPORT', 'IMPORTED', 'IMPORTED_WITH_WARNINGS', 'IMPORT_ERROR'));