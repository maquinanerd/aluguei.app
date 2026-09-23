-- Onda 2A do portal (ADR-099): endereco publico ganha as CHAVES DE URL (cidade e bairro em
-- slug) e o anuncio ganha um SLUG PUBLICO UNICO NO PAIS, com historico para redirecionar
-- (301) quando ele mudar. /imovel/[slug] nao e escopado por imobiliaria, e o unique de hoje
-- e so (org_id, slug).
-- Gerada pelo drizzle-kit; editada a mao: a coluna nasce anulavel, e preenchida e so entao
-- vira NOT NULL.
CREATE TABLE "listing_slug_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_slug_history_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "property_addresses" ADD COLUMN "city_slug" text;--> statement-breakpoint
ALTER TABLE "property_addresses" ADD COLUMN "neighborhood_slug" text;--> statement-breakpoint
ALTER TABLE "listing_slug_history" ADD CONSTRAINT "listing_slug_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_slug_history" ADD CONSTRAINT "listing_slug_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_slug_history_listing_idx" ON "listing_slug_history" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "property_addresses_place_idx" ON "property_addresses" USING btree ("city_slug","neighborhood_slug");--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_public_slug_unique" UNIQUE("public_slug");--> statement-breakpoint
-- Slug publico das linhas que ja existem: o proprio slug quando ele ja e unico no pais;
-- senao, com um sufixo curto e estavel tirado do id.
UPDATE "listings" l
   SET "public_slug" = l."slug"
 WHERE NOT EXISTS (
   SELECT 1 FROM "listings" o WHERE o."slug" = l."slug" AND o."id" <> l."id"
 );--> statement-breakpoint
UPDATE "listings" l
   SET "public_slug" = l."slug" || '-' || substr(replace(l."id"::text, '-', ''), 1, 6)
 WHERE l."public_slug" IS NULL;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "public_slug" SET NOT NULL;--> statement-breakpoint
-- Cidade e bairro em slug, com a mesma conta de slugifyPlace/citySlug do dominio: tira
-- acento, baixa a caixa e troca o resto por hifen. Endereco sem cidade ou sem UF de duas
-- letras fica nulo e simplesmente nao aparece na busca por lugar.
UPDATE "property_addresses" a
   SET "city_slug" = CASE
         WHEN a."city" IS NULL OR a."state" IS NULL THEN NULL
         WHEN length(btrim(regexp_replace(lower(a."state"), '[^a-z0-9]+', '-', 'g'), '-')) <> 2 THEN NULL
         WHEN btrim(regexp_replace(lower(translate(a."city",
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', '-', 'g'), '-') = '' THEN NULL
         ELSE left(btrim(regexp_replace(lower(translate(a."city",
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', '-', 'g'), '-'), 80)
              || '-' || btrim(regexp_replace(lower(a."state"), '[^a-z0-9]+', '-', 'g'), '-')
       END,
       "neighborhood_slug" = CASE
         WHEN a."neighborhood" IS NULL THEN NULL
         ELSE nullif(left(btrim(regexp_replace(lower(translate(a."neighborhood",
              'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', '-', 'g'), '-'), 80), '')
       END;
