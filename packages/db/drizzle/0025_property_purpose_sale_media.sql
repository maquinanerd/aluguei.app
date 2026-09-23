-- Onda 2A do frontend do AchouImovel: o imovel passa a ter FINALIDADE (alugar, vender ou
-- os dois) e PRECO DE VENDA, o vocabulario de TIPO ganha os quatro tipos que o design
-- desenhou (casa de condominio, sobrado, kitnet/studio e cobertura) e a foto ganha
-- LEGENDA, ORDEM e CAPA.
-- Gerada pelo drizzle-kit; editada a mao so para o pre-voo e para a capa das fotos.
--
-- Compatibilidade: todo imovel que ja existe nasce 'RENT' (era so o que o sistema fazia) e
-- `monthly_rent_cents` deixa de ser obrigatorio no banco porque imovel so a venda nao tem
-- aluguel; quem exige o valor certo para cada finalidade e o dominio
-- (assertTermsMatchPurpose), porque a regra cruza as duas tabelas.
--
-- Pre-voo: o CHECK do tipo so é ampliado, nunca restringido, mas se alguma linha estiver
-- fora do vocabulario novo a migracao para sem aplicar nada e diz qual é.
DO $$
DECLARE
  fora int;
  amostra text;
BEGIN
  SELECT count(*), string_agg(DISTINCT property_type, ', ')
    INTO fora, amostra
    FROM properties
   WHERE property_type NOT IN ('APARTMENT','HOUSE','HOUSE_CONDO','TOWNHOUSE','STUDIO','PENTHOUSE','COMMERCIAL','LAND');
  IF fora > 0 THEN
    RAISE EXCEPTION 'migration 0025: % imovel(is) com tipo fora do vocabulario novo (%)', fora, amostra;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "properties" DROP CONSTRAINT "properties_property_type_valid";--> statement-breakpoint
ALTER TABLE "property_financial_terms" ALTER COLUMN "monthly_rent_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "purpose" text DEFAULT 'RENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_financial_terms" ADD COLUMN "sale_price_cents" integer;--> statement-breakpoint
ALTER TABLE "property_media" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "property_media" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "property_media" ADD COLUMN "is_cover" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "property_media_property_order_idx" ON "property_media" USING btree ("property_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "property_media_cover_unique" ON "property_media" USING btree ("property_id") WHERE "property_media"."is_cover";--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_purpose_valid" CHECK ("properties"."purpose" in ('RENT', 'SALE', 'BOTH'));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_property_type_valid" CHECK ("properties"."property_type" in ('APARTMENT', 'HOUSE', 'HOUSE_CONDO', 'TOWNHOUSE', 'STUDIO', 'PENTHOUSE', 'COMMERCIAL', 'LAND'));--> statement-breakpoint
-- Capa das fotos: o primeiro anexo publico de cada imovel vira a capa, para a galeria do
-- portal nao comecar sem ordem definida. Imovel sem foto publica continua sem capa.
UPDATE "property_media" m
   SET "is_cover" = true
  WHERE m."kind" = 'PHOTO'
    AND m."is_public"
    AND m."id" = (
      SELECT m2."id" FROM "property_media" m2
       WHERE m2."property_id" = m."property_id" AND m2."kind" = 'PHOTO' AND m2."is_public"
       ORDER BY m2."created_at" ASC, m2."id" ASC
       LIMIT 1
    );
