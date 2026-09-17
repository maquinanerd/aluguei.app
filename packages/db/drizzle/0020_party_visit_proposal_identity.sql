-- G3, trilha D (auditoria 2026-09-10, P2-01, P2-02 e P2-04): pessoa com status e documentos,
-- ciclo de vida da visita e da proposta, recuperação de senha, convite de membro por e-mail e
-- caixa de saída local de e-mail (nada é enviado).
-- Editada à mão num ponto: `proposals.valid_until` deixa de ser instante e passa a ser data civil,
-- com o USING explícito no fuso de São Paulo — sem ele a conversão usaria o fuso da sessão e a
-- validade de uma proposta criada à noite cairia um dia antes (mesma armadilha do P1-07).
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"kind" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_kind_valid" CHECK ("email_outbox"."kind" in ('PASSWORD_RESET', 'MEMBER_INVITE')),
	CONSTRAINT "email_outbox_status_valid" CHECK ("email_outbox"."status" in ('QUEUED', 'SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "member_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"requested_ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "valid_until" SET DATA TYPE date USING ("valid_until" AT TIME ZONE 'America/Sao_Paulo')::date;--> statement-breakpoint
ALTER TABLE "party_documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "party_documents" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_org_created_idx" ON "email_outbox" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_to_created_idx" ON "email_outbox" USING btree ("to_email","created_at");--> statement-breakpoint
CREATE INDEX "member_invites_org_email_idx" ON "member_invites" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "member_invites_email_idx" ON "member_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "proposals_valid_until_idx" ON "proposals" USING btree ("status","valid_until");--> statement-breakpoint
CREATE INDEX "visits_org_status_idx" ON "visits" USING btree ("org_id","status");--> statement-breakpoint
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_document_key_unique" UNIQUE("document_key");--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_type_valid" CHECK ("parties"."type" in ('PERSON', 'COMPANY'));--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_status_valid" CHECK ("parties"."status" in ('ACTIVE', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "party_documents" ADD CONSTRAINT "party_documents_kind_valid" CHECK ("party_documents"."kind" in ('IDENTITY', 'CPF', 'PROOF_OF_INCOME', 'PROOF_OF_ADDRESS', 'MARITAL_STATUS', 'COMPANY_BYLAWS', 'OTHER'));--> statement-breakpoint
ALTER TABLE "party_identities" ADD CONSTRAINT "party_identities_kind_valid" CHECK ("party_identities"."kind" in ('EMAIL', 'PHONE', 'CPF', 'CNPJ', 'PASSPORT'));--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_status_valid" CHECK ("proposals"."status" in ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'));--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_sent_needs_valid_until" CHECK (("proposals"."status" = 'DRAFT') or ("proposals"."valid_until" is not null));--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_rejected_needs_reason" CHECK (("proposals"."status" <> 'REJECTED') or ("proposals"."decision_reason" is not null));--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_status_valid" CHECK ("visits"."status" in ('SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW'));--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_cancel_reason_required" CHECK (("visits"."status" <> 'CANCELLED') or ("visits"."cancel_reason" is not null));