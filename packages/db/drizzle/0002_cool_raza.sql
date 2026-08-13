CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"property_type" text NOT NULL,
	"total_area_sqm" double precision,
	"built_area_sqm" double precision,
	"bedrooms" integer,
	"bathrooms" integer,
	"parking_spots" integer,
	"furnished" boolean DEFAULT false NOT NULL,
	"pets_allowed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"label" text,
	"street" text,
	"number" text,
	"complement" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"country" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_features" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_financial_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"monthly_rent_cents" integer NOT NULL,
	"condo_fee_cents" integer,
	"iptu_cents" integer,
	"security_deposit_cents" integer,
	"minimum_lease_months" integer,
	"available_from" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "property_owners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"ownership_share_pct" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_addresses" ADD CONSTRAINT "property_addresses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_addresses" ADD CONSTRAINT "property_addresses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_features" ADD CONSTRAINT "property_features_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_features" ADD CONSTRAINT "property_features_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_financial_terms" ADD CONSTRAINT "property_financial_terms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_financial_terms" ADD CONSTRAINT "property_financial_terms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_owners" ADD CONSTRAINT "property_owners_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_org_slug_unique" ON "listings" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "listings_org_status_idx" ON "listings" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "properties_org_idx" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "properties_org_status_idx" ON "properties" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "property_addresses_property_public_unique" ON "property_addresses" USING btree ("property_id","is_public");--> statement-breakpoint
CREATE INDEX "property_addresses_property_idx" ON "property_addresses" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_features_property_feature_unique" ON "property_features" USING btree ("property_id","feature");--> statement-breakpoint
CREATE INDEX "property_features_property_idx" ON "property_features" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_financial_terms_property_unique" ON "property_financial_terms" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_media_property_idx" ON "property_media" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_owners_property_party_unique" ON "property_owners" USING btree ("property_id","party_id");--> statement-breakpoint
CREATE INDEX "property_owners_property_idx" ON "property_owners" USING btree ("property_id");--> statement-breakpoint
ALTER TABLE "lead_property_interests" ADD CONSTRAINT "lead_property_interests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;