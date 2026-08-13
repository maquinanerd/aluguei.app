CREATE TABLE "channel_sync_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"listing_id" uuid,
	"channel" text NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb,
	"last_error" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_sync_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "listing_channel_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"channel_listing_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"last_payload" jsonb,
	"last_error" text,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" ADD CONSTRAINT "channel_sync_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" ADD CONSTRAINT "channel_sync_jobs_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_sync_jobs_org_status_run_idx" ON "channel_sync_jobs" USING btree ("org_id","status","run_at");--> statement-breakpoint
CREATE INDEX "channel_sync_jobs_org_channel_status_idx" ON "channel_sync_jobs" USING btree ("org_id","channel","status");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_publications_listing_channel_unique" ON "listing_channel_publications" USING btree ("listing_id","channel");--> statement-breakpoint
CREATE INDEX "channel_publications_org_status_idx" ON "listing_channel_publications" USING btree ("org_id","status");