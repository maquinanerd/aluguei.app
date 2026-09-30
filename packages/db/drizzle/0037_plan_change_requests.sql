CREATE TABLE "plan_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"requested_module" text,
	"requested_plan_code" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	CONSTRAINT "plan_change_requests_status_valid" CHECK ("plan_change_requests"."status" in ('PENDING', 'DONE', 'DISMISSED')),
	CONSTRAINT "plan_change_requests_requested_module_valid" CHECK ("plan_change_requests"."requested_module" is null or "plan_change_requests"."requested_module" in ('CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'VENDAS', 'MARKETING')),
	CONSTRAINT "plan_change_requests_target_required" CHECK ("plan_change_requests"."requested_module" is not null or "plan_change_requests"."requested_plan_code" is not null),
	CONSTRAINT "plan_change_requests_resolution_consistent" CHECK (("plan_change_requests"."status" = 'PENDING') = ("plan_change_requests"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_change_requests" ADD CONSTRAINT "plan_change_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_change_requests_one_pending_per_org" ON "plan_change_requests" USING btree ("org_id") WHERE "plan_change_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "plan_change_requests_status_created_idx" ON "plan_change_requests" USING btree ("status","created_at");