-- Onda 5: negociacao de venda, da proposta ao fechamento.
--
-- O historico e imutavel por desenho: proposta, contraproposta e resposta viram
-- linhas em `sale_negotiation_events`, e o valor corrente da negociacao e
-- consequencia delas. Guardar so o ultimo valor perderia a conversa — que e
-- justamente o que a imobiliaria precisa para negociar.
--
-- As FKs compostas (org_id, property_id) e (org_id, buyer_party_id) impedem
-- que uma negociacao aponte para imovel ou pessoa de outra imobiliaria, mesmo
-- que uma rota futura esqueca a checagem (P0-05, ADR-045).
--
-- A soma das participacoes da comissao e conferida no dominio: CHECK nao soma
-- linhas.
CREATE TABLE "sale_commission_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"user_id" uuid,
	"percent_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_commission_shares_role_valid" CHECK ("sale_commission_shares"."role" in ('CAPTADOR', 'VENDEDOR'))
);
--> statement-breakpoint
CREATE TABLE "sale_negotiation_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"side" text NOT NULL,
	"label" text NOT NULL,
	"provided" boolean DEFAULT false NOT NULL,
	"provided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_negotiation_documents_side_valid" CHECK ("sale_negotiation_documents"."side" in ('PROPERTY', 'BUYER', 'SELLER'))
);
--> statement-breakpoint
CREATE TABLE "sale_negotiation_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"valid_until" date,
	"outcome" text DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_negotiation_events_kind_valid" CHECK ("sale_negotiation_events"."kind" in ('ASKING', 'BUYER_OFFER', 'SELLER_COUNTER')),
	CONSTRAINT "sale_negotiation_events_outcome_valid" CHECK ("sale_negotiation_events"."outcome" in ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "sale_negotiations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"buyer_party_id" uuid NOT NULL,
	"stage" text DEFAULT 'PROPOSAL' NOT NULL,
	"asking_price_cents" integer,
	"current_amount_cents" integer,
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"owner_user_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_amount_cents" integer,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_negotiations_stage_valid" CHECK ("sale_negotiations"."stage" in ('PROPOSAL', 'COUNTER', 'DOCUMENTATION', 'CONTRACT', 'CLOSED', 'LOST'))
);
--> statement-breakpoint
ALTER TABLE "sale_commission_shares" ADD CONSTRAINT "sale_commission_shares_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_commission_shares" ADD CONSTRAINT "sale_commission_shares_negotiation_id_sale_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."sale_negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_commission_shares" ADD CONSTRAINT "sale_commission_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiation_documents" ADD CONSTRAINT "sale_negotiation_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiation_documents" ADD CONSTRAINT "sale_negotiation_documents_negotiation_id_sale_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."sale_negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiation_events" ADD CONSTRAINT "sale_negotiation_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiation_events" ADD CONSTRAINT "sale_negotiation_events_negotiation_id_sale_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."sale_negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiation_events" ADD CONSTRAINT "sale_negotiation_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiations" ADD CONSTRAINT "sale_negotiations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiations" ADD CONSTRAINT "sale_negotiations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiations" ADD CONSTRAINT "sale_negotiations_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_negotiations" ADD CONSTRAINT "sale_negotiations_buyer_org_fk" FOREIGN KEY ("org_id","buyer_party_id") REFERENCES "public"."parties"("org_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_commission_shares_unique" ON "sale_commission_shares" USING btree ("negotiation_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_negotiation_documents_unique" ON "sale_negotiation_documents" USING btree ("negotiation_id","side","label");--> statement-breakpoint
CREATE INDEX "sale_negotiation_events_negotiation_idx" ON "sale_negotiation_events" USING btree ("negotiation_id","created_at");--> statement-breakpoint
CREATE INDEX "sale_negotiations_org_stage_idx" ON "sale_negotiations" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "sale_negotiations_property_idx" ON "sale_negotiations" USING btree ("property_id");