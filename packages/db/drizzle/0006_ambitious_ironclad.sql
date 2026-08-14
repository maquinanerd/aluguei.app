CREATE TABLE "inspection_ai_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"media_id" uuid,
	"transcript_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"confidence" double precision,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_comparisons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"checkin_inspection_id" uuid NOT NULL,
	"checkout_inspection_id" uuid NOT NULL,
	"room_id" uuid,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"differences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"room_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"duration_ms" integer,
	"is_evidence" boolean DEFAULT true NOT NULL,
	"captured_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "inspection_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"room_id" uuid,
	"media_id" uuid,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"ai_suggestion_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_transcripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"inspection_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"ai_model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"started_by" uuid,
	"completed_by" uuid,
	"scheduled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_ai_suggestions" ADD CONSTRAINT "inspection_ai_suggestions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_ai_suggestions" ADD CONSTRAINT "inspection_ai_suggestions_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_ai_suggestions" ADD CONSTRAINT "inspection_ai_suggestions_media_id_inspection_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."inspection_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_ai_suggestions" ADD CONSTRAINT "inspection_ai_suggestions_transcript_id_inspection_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."inspection_transcripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_comparisons" ADD CONSTRAINT "inspection_comparisons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_comparisons" ADD CONSTRAINT "inspection_comparisons_checkin_inspection_id_inspections_id_fk" FOREIGN KEY ("checkin_inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_comparisons" ADD CONSTRAINT "inspection_comparisons_checkout_inspection_id_inspections_id_fk" FOREIGN KEY ("checkout_inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_comparisons" ADD CONSTRAINT "inspection_comparisons_room_id_inspection_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."inspection_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_comparisons" ADD CONSTRAINT "inspection_comparisons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_room_id_inspection_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."inspection_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_room_id_inspection_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."inspection_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_media_id_inspection_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."inspection_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_ai_suggestion_id_inspection_ai_suggestions_id_fk" FOREIGN KEY ("ai_suggestion_id") REFERENCES "public"."inspection_ai_suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_rooms" ADD CONSTRAINT "inspection_rooms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_rooms" ADD CONSTRAINT "inspection_rooms_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_transcripts" ADD CONSTRAINT "inspection_transcripts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_transcripts" ADD CONSTRAINT "inspection_transcripts_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_transcripts" ADD CONSTRAINT "inspection_transcripts_media_id_inspection_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."inspection_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_ai_suggestions_inspection_status_idx" ON "inspection_ai_suggestions" USING btree ("inspection_id","status");--> statement-breakpoint
CREATE INDEX "inspection_ai_suggestions_media_idx" ON "inspection_ai_suggestions" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "inspection_ai_suggestions_org_idx" ON "inspection_ai_suggestions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_comparisons_checkin_checkout_unique" ON "inspection_comparisons" USING btree ("checkin_inspection_id","checkout_inspection_id");--> statement-breakpoint
CREATE INDEX "inspection_comparisons_org_idx" ON "inspection_comparisons" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "inspection_media_inspection_idx" ON "inspection_media" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "inspection_media_org_idx" ON "inspection_media" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_observations_suggestion_unique" ON "inspection_observations" USING btree ("ai_suggestion_id") WHERE ai_suggestion_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inspection_observations_inspection_room_idx" ON "inspection_observations" USING btree ("inspection_id","room_id");--> statement-breakpoint
CREATE INDEX "inspection_observations_inspection_status_idx" ON "inspection_observations" USING btree ("inspection_id","status");--> statement-breakpoint
CREATE INDEX "inspection_rooms_inspection_order_idx" ON "inspection_rooms" USING btree ("inspection_id","order_index");--> statement-breakpoint
CREATE INDEX "inspection_rooms_org_idx" ON "inspection_rooms" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inspection_transcripts_media_unique" ON "inspection_transcripts" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "inspection_transcripts_inspection_idx" ON "inspection_transcripts" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "inspection_transcripts_status_idx" ON "inspection_transcripts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inspections_org_created_idx" ON "inspections" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "inspections_org_status_idx" ON "inspections" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "inspections_property_idx" ON "inspections" USING btree ("property_id");