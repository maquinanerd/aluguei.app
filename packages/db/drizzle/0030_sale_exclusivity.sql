-- Onda 5: exclusividade de venda.
--
-- E registro de acordo comercial, nao estado do anuncio: acabar a exclusividade
-- nao tira nada do ar, e por isso a tabela nao toca em `listings`.
--
-- O periodo e guardado em DIA, nao em instante: exclusividade vale por data, em
-- qualquer fuso. O CHECK garante fim depois do inicio; a sobreposicao de dois
-- periodos do mesmo imovel e recusada na escrita, dentro da transacao que trava
-- a linha do imovel, porque depende de comparar com os periodos existentes.
CREATE TABLE "property_sale_exclusivities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"document_media_id" uuid,
	"canceled_at" timestamp with time zone,
	"canceled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_sale_exclusivities_period_valid" CHECK ("property_sale_exclusivities"."ends_on" > "property_sale_exclusivities"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "property_sale_exclusivities" ADD CONSTRAINT "property_sale_exclusivities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_sale_exclusivities" ADD CONSTRAINT "property_sale_exclusivities_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "property_sale_exclusivities_property_idx" ON "property_sale_exclusivities" USING btree ("property_id","ends_on");