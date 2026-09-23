-- Onda 2A do portal: ALERTA DE IMOVEL. Quem nao acha o que procura deixa o contato e e
-- avisado quando aparecer algo no recorte. O alerta nasce PENDING e so vale depois da
-- confirmacao pelo link de uso unico -- ninguem entra numa lista sem confirmar.
-- A tabela nao tem org_id de proposito: o contato de quem procura imovel nao pertence a
-- nenhuma imobiliaria, que enxerga so o agregado ("demanda por bairro").
-- A caixa de saida local passa a aceitar a mensagem de confirmacao do alerta.
CREATE TABLE "search_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"city_slug" text NOT NULL,
	"neighborhood_slug" text,
	"property_type" text,
	"bedrooms" integer,
	"max_price_cents" integer,
	"contact_kind" text NOT NULL,
	"contact_value" text NOT NULL,
	"consent_text" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"token_hash" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_alerts_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "search_alerts_purpose_valid" CHECK ("search_alerts"."purpose" in ('RENT', 'SALE')),
	CONSTRAINT "search_alerts_status_valid" CHECK ("search_alerts"."status" in ('PENDING', 'ACTIVE', 'CANCELED')),
	CONSTRAINT "search_alerts_contact_kind_valid" CHECK ("search_alerts"."contact_kind" in ('EMAIL', 'WHATSAPP'))
);
--> statement-breakpoint
ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_kind_valid";--> statement-breakpoint
CREATE INDEX "search_alerts_place_idx" ON "search_alerts" USING btree ("city_slug","neighborhood_slug","status");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_kind_valid" CHECK ("email_outbox"."kind" in ('PASSWORD_RESET', 'MEMBER_INVITE', 'SEARCH_ALERT_CONFIRM'));