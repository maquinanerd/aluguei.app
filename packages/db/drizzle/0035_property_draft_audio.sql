CREATE TABLE "property_draft_fields" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" text,
	"state" text NOT NULL,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_draft_fields_field_key_valid" CHECK ("property_draft_fields"."field_key" in ('TITLE', 'PROPERTY_TYPE', 'PURPOSE', 'TOTAL_AREA_SQM', 'BEDROOMS', 'BATHROOMS', 'PARKING_SPOTS', 'FURNISHED', 'PETS_ALLOWED', 'MONTHLY_RENT_CENTS', 'SALE_PRICE_CENTS', 'CONDO_FEE_CENTS', 'IPTU_CENTS', 'STREET', 'NUMBER', 'COMPLEMENT', 'NEIGHBORHOOD', 'CITY', 'STATE', 'ZIP_CODE')),
	CONSTRAINT "property_draft_fields_state_valid" CHECK ("property_draft_fields"."state" in ('FROM_AUDIO', 'NEEDS_CONFIRMATION', 'MISSING', 'EDITED'))
);
--> statement-breakpoint
CREATE TABLE "property_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"status" text DEFAULT 'CAPTURING' NOT NULL,
	"transcript" text,
	"audio_key" text,
	"audio_seconds" integer,
	"ai_provider" text,
	"failure_reason" text,
	"property_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_drafts_org_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "property_drafts_status_valid" CHECK ("property_drafts"."status" in ('CAPTURING', 'PROCESSING', 'REVIEW', 'CONFIRMED', 'DISCARDED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "property_draft_fields" ADD CONSTRAINT "property_draft_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_draft_fields" ADD CONSTRAINT "property_draft_fields_draft_id_property_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."property_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_draft_fields" ADD CONSTRAINT "property_draft_fields_draft_org_fk" FOREIGN KEY ("org_id","draft_id") REFERENCES "public"."property_drafts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_drafts" ADD CONSTRAINT "property_drafts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_drafts" ADD CONSTRAINT "property_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_drafts" ADD CONSTRAINT "property_drafts_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "property_draft_fields_draft_key_unique" ON "property_draft_fields" USING btree ("draft_id","field_key");--> statement-breakpoint
CREATE INDEX "property_draft_fields_draft_idx" ON "property_draft_fields" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "property_drafts_org_status_idx" ON "property_drafts" USING btree ("org_id","status");