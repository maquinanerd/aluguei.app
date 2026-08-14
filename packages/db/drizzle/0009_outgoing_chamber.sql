CREATE TABLE "meta_ad_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"adset_link_id" uuid NOT NULL,
	"creative_link_id" uuid NOT NULL,
	"provider_ad_id" text NOT NULL,
	"status" text DEFAULT 'CREATED_PAUSED' NOT NULL,
	"last_payload" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"listing_id" uuid,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"daily_budget_cents" integer,
	"lifetime_budget_cents" integer,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"geos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_selection" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_asset_id" uuid,
	"instagram_asset_id" uuid,
	"landing_url" text NOT NULL,
	"copy_primary" text NOT NULL,
	"copy_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"special_ad_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"idempotency_key" text,
	"prepared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_adset_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_link_id" uuid NOT NULL,
	"provider_adset_id" text NOT NULL,
	"name" text NOT NULL,
	"targeting" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"budget_cents" integer,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" text DEFAULT 'CREATED_PAUSED' NOT NULL,
	"last_payload" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider_asset_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"action" text NOT NULL,
	"idempotency_key" text,
	"input_digest" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_campaign_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"ad_profile_id" uuid NOT NULL,
	"provider_campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"special_ad_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_budget_cents" integer,
	"lifetime_budget_cents" integer,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" text DEFAULT 'CREATED_PAUSED' NOT NULL,
	"last_payload" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"provider_user_id" text,
	"status" text DEFAULT 'CONNECTING' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_token_encrypted" text,
	"token_key_id" text,
	"expires_at" timestamp with time zone,
	"last_tested_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_creative_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"adset_link_id" uuid NOT NULL,
	"provider_creative_id" text NOT NULL,
	"name" text NOT NULL,
	"media_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"copy_primary" text NOT NULL,
	"landing_url" text NOT NULL,
	"media_hash" text,
	"status" text DEFAULT 'CREATED_PAUSED' NOT NULL,
	"last_payload" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_insight_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"ad_profile_id" uuid,
	"campaign_link_id" uuid NOT NULL,
	"adset_link_id" uuid,
	"ad_link_id" uuid,
	"date_start" date NOT NULL,
	"date_end" date NOT NULL,
	"insights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_org_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"max_daily_budget_cents" integer DEFAULT 10000000 NOT NULL,
	"max_lifetime_budget_cents" integer DEFAULT 100000000 NOT NULL,
	"allowed_geos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"housing_targeting_allowed" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_sync_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"ad_profile_id" uuid,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_webhook_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
ALTER TABLE "meta_ad_links" ADD CONSTRAINT "meta_ad_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_links" ADD CONSTRAINT "meta_ad_links_adset_link_id_meta_adset_links_id_fk" FOREIGN KEY ("adset_link_id") REFERENCES "public"."meta_adset_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_links" ADD CONSTRAINT "meta_ad_links_creative_link_id_meta_creative_links_id_fk" FOREIGN KEY ("creative_link_id") REFERENCES "public"."meta_creative_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_page_asset_id_meta_assets_id_fk" FOREIGN KEY ("page_asset_id") REFERENCES "public"."meta_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_instagram_asset_id_meta_assets_id_fk" FOREIGN KEY ("instagram_asset_id") REFERENCES "public"."meta_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_adset_links" ADD CONSTRAINT "meta_adset_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_adset_links" ADD CONSTRAINT "meta_adset_links_campaign_link_id_meta_campaign_links_id_fk" FOREIGN KEY ("campaign_link_id") REFERENCES "public"."meta_campaign_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_assets" ADD CONSTRAINT "meta_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_assets" ADD CONSTRAINT "meta_assets_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_audit_events" ADD CONSTRAINT "meta_audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaign_links" ADD CONSTRAINT "meta_campaign_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaign_links" ADD CONSTRAINT "meta_campaign_links_ad_profile_id_meta_ad_profiles_id_fk" FOREIGN KEY ("ad_profile_id") REFERENCES "public"."meta_ad_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_creative_links" ADD CONSTRAINT "meta_creative_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_creative_links" ADD CONSTRAINT "meta_creative_links_adset_link_id_meta_adset_links_id_fk" FOREIGN KEY ("adset_link_id") REFERENCES "public"."meta_adset_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insight_snapshots" ADD CONSTRAINT "meta_insight_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insight_snapshots" ADD CONSTRAINT "meta_insight_snapshots_ad_profile_id_meta_ad_profiles_id_fk" FOREIGN KEY ("ad_profile_id") REFERENCES "public"."meta_ad_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insight_snapshots" ADD CONSTRAINT "meta_insight_snapshots_campaign_link_id_meta_campaign_links_id_fk" FOREIGN KEY ("campaign_link_id") REFERENCES "public"."meta_campaign_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insight_snapshots" ADD CONSTRAINT "meta_insight_snapshots_adset_link_id_meta_adset_links_id_fk" FOREIGN KEY ("adset_link_id") REFERENCES "public"."meta_adset_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insight_snapshots" ADD CONSTRAINT "meta_insight_snapshots_ad_link_id_meta_ad_links_id_fk" FOREIGN KEY ("ad_link_id") REFERENCES "public"."meta_ad_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_org_settings" ADD CONSTRAINT "meta_org_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_ad_profile_id_meta_ad_profiles_id_fk" FOREIGN KEY ("ad_profile_id") REFERENCES "public"."meta_ad_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_webhook_events" ADD CONSTRAINT "meta_webhook_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_links_provider_ad_unique" ON "meta_ad_links" USING btree ("provider_ad_id");--> statement-breakpoint
CREATE INDEX "meta_ad_links_org_adset_idx" ON "meta_ad_links" USING btree ("org_id","adset_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_profiles_org_idempotency_unique" ON "meta_ad_profiles" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "meta_ad_profiles_org_property_idx" ON "meta_ad_profiles" USING btree ("org_id","property_id");--> statement-breakpoint
CREATE INDEX "meta_ad_profiles_org_status_idx" ON "meta_ad_profiles" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_adset_links_provider_adset_unique" ON "meta_adset_links" USING btree ("provider_adset_id");--> statement-breakpoint
CREATE INDEX "meta_adset_links_org_campaign_idx" ON "meta_adset_links" USING btree ("org_id","campaign_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_assets_connection_kind_provider_unique" ON "meta_assets" USING btree ("connection_id","kind","provider_asset_id");--> statement-breakpoint
CREATE INDEX "meta_assets_org_kind_idx" ON "meta_assets" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "meta_audit_events_org_tool_idx" ON "meta_audit_events" USING btree ("org_id","tool","created_at");--> statement-breakpoint
CREATE INDEX "meta_audit_events_org_idempotency_idx" ON "meta_audit_events" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_campaign_links_provider_campaign_unique" ON "meta_campaign_links" USING btree ("provider_campaign_id");--> statement-breakpoint
CREATE INDEX "meta_campaign_links_org_profile_idx" ON "meta_campaign_links" USING btree ("org_id","ad_profile_id");--> statement-breakpoint
CREATE INDEX "meta_connections_org_idx" ON "meta_connections" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "meta_connections_org_status_idx" ON "meta_connections" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_creative_links_provider_creative_unique" ON "meta_creative_links" USING btree ("provider_creative_id");--> statement-breakpoint
CREATE INDEX "meta_creative_links_org_adset_idx" ON "meta_creative_links" USING btree ("org_id","adset_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_insight_snapshots_campaign_dates_unique" ON "meta_insight_snapshots" USING btree ("campaign_link_id","date_start","date_end");--> statement-breakpoint
CREATE INDEX "meta_insight_snapshots_org_campaign_idx" ON "meta_insight_snapshots" USING btree ("org_id","campaign_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_sync_jobs_org_idempotency_unique" ON "meta_sync_jobs" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "meta_sync_jobs_status_run_idx" ON "meta_sync_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "meta_sync_jobs_org_profile_idx" ON "meta_sync_jobs" USING btree ("org_id","ad_profile_id");--> statement-breakpoint
CREATE INDEX "meta_webhook_events_org_received_idx" ON "meta_webhook_events" USING btree ("org_id","received_at");