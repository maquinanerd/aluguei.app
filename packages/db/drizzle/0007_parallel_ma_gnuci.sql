CREATE TABLE "contract_parties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"party_id" uuid,
	"role" text NOT NULL,
	"sign_order" integer NOT NULL,
	"signed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid,
	"application_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"content" text,
	"content_hash" text,
	"signed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"lead_id" uuid,
	"party_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"proposal_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"decision_reason" text,
	"submitted_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"party_id" uuid,
	"provider" text NOT NULL,
	"purpose" text NOT NULL,
	"consent_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"raw_payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "screening_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"request_id" uuid,
	"provider" text NOT NULL,
	"score" integer,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"red_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" text NOT NULL,
	"decision_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_envelopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_envelope_id" text NOT NULL,
	"status" text DEFAULT 'SENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_application_id_rental_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."rental_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_requests" ADD CONSTRAINT "screening_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_requests" ADD CONSTRAINT "screening_requests_application_id_rental_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."rental_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_requests" ADD CONSTRAINT "screening_requests_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_requests" ADD CONSTRAINT "screening_requests_consent_id_party_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."party_consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_application_id_rental_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."rental_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_request_id_screening_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."screening_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_parties_contract_party_unique" ON "contract_parties" USING btree ("contract_id","party_id");--> statement-breakpoint
CREATE INDEX "contract_parties_org_idx" ON "contract_parties" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_templates_org_name_version_unique" ON "contract_templates" USING btree ("org_id","name","version");--> statement-breakpoint
CREATE INDEX "contract_templates_org_status_idx" ON "contract_templates" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "contracts_org_status_idx" ON "contracts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "contracts_org_application_idx" ON "contracts" USING btree ("org_id","application_id");--> statement-breakpoint
CREATE INDEX "rental_applications_org_status_idx" ON "rental_applications" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "rental_applications_org_created_idx" ON "rental_applications" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "rental_applications_party_idx" ON "rental_applications" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "rental_applications_lead_idx" ON "rental_applications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "rental_applications_property_idx" ON "rental_applications" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "rental_applications_proposal_idx" ON "rental_applications" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "screening_requests_org_application_idx" ON "screening_requests" USING btree ("org_id","application_id");--> statement-breakpoint
CREATE INDEX "screening_requests_status_idx" ON "screening_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "screening_requests_provider_idx" ON "screening_requests" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "screening_results_org_application_idx" ON "screening_results" USING btree ("org_id","application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_envelopes_provider_id_unique" ON "signature_envelopes" USING btree ("provider","provider_envelope_id");--> statement-breakpoint
CREATE INDEX "signature_envelopes_org_contract_idx" ON "signature_envelopes" USING btree ("org_id","contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_events_provider_id_unique" ON "signature_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "signature_events_org_envelope_idx" ON "signature_events" USING btree ("org_id","envelope_id");--> statement-breakpoint
-- Consentimento LGPD: um consentimento ativo por (party, purpose)
CREATE UNIQUE INDEX "party_consents_active_unique" ON "party_consents" ("party_id", "purpose") WHERE "revoked_at" IS NULL;
