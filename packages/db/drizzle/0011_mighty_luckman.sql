CREATE TABLE "portal_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by" uuid NOT NULL,
	"one_time_token_hash" text,
	"one_time_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"access_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_access_id_portal_access_id_fk" FOREIGN KEY ("access_id") REFERENCES "public"."portal_access"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_access_org_party_idx" ON "portal_access" USING btree ("org_id","party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_access_org_party_kind_active_unique" ON "portal_access" USING btree ("org_id","party_id","kind","revoked_at");--> statement-breakpoint
CREATE INDEX "portal_access_token_hash_idx" ON "portal_access" USING btree ("one_time_token_hash");--> statement-breakpoint
CREATE INDEX "portal_sessions_org_party_idx" ON "portal_sessions" USING btree ("org_id","party_id");--> statement-breakpoint
CREATE INDEX "portal_sessions_access_idx" ON "portal_sessions" USING btree ("access_id");