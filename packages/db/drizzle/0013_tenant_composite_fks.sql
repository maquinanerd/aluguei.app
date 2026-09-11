-- Isolamento multi-tenant no banco (auditoria 2026-09-10, P0-05).
-- A aplicação já valida o dono em cada rota; estas FKs compostas são a segunda
-- linha de defesa: a referência passa a carregar a organização, então uma rota
-- futura que esqueça a checagem falha com 23503 em vez de gravar o vínculo.
--
-- Pré-voo: se o banco JÁ tiver referência entre organizações, a migração para
-- com a lista das relações afetadas em vez de falhar no meio do ALTER TABLE.
DO $$
DECLARE
  v record;
  msg text := '';
BEGIN
  FOR v IN
    WITH violacoes(relation, row_id) AS (
      SELECT 'leads.party_id', c.id::text FROM leads c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'lead_property_interests.lead_id', c.id::text FROM lead_property_interests c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'lead_property_interests.property_id', c.id::text FROM lead_property_interests c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'visits.lead_id', c.id::text FROM visits c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'visits.party_id', c.id::text FROM visits c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'visits.property_id', c.id::text FROM visits c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'proposals.lead_id', c.id::text FROM proposals c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'proposals.party_id', c.id::text FROM proposals c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'proposals.property_id', c.id::text FROM proposals c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'rental_applications.lead_id', c.id::text FROM rental_applications c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'rental_applications.party_id', c.id::text FROM rental_applications c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'rental_applications.property_id', c.id::text FROM rental_applications c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'rental_applications.proposal_id', c.id::text FROM rental_applications c JOIN proposals r ON r.id = c.proposal_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'inspections.property_id', c.id::text FROM inspections c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'inspection_media.room_id', c.id::text FROM inspection_media c JOIN inspection_rooms r ON r.id = c.room_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'inspection_observations.room_id', c.id::text FROM inspection_observations c JOIN inspection_rooms r ON r.id = c.room_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'inspection_observations.media_id', c.id::text FROM inspection_observations c JOIN inspection_media r ON r.id = c.media_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'meta_assets.connection_id', c.id::text FROM meta_assets c JOIN meta_connections r ON r.id = c.connection_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'meta_ad_profiles.connection_id', c.id::text FROM meta_ad_profiles c JOIN meta_connections r ON r.id = c.connection_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'meta_ad_profiles.property_id', c.id::text FROM meta_ad_profiles c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'meta_ad_profiles.page_asset_id', c.id::text FROM meta_ad_profiles c JOIN meta_assets r ON r.id = c.page_asset_id WHERE r.org_id <> c.org_id
      UNION ALL SELECT 'meta_ad_profiles.instagram_asset_id', c.id::text FROM meta_ad_profiles c JOIN meta_assets r ON r.id = c.instagram_asset_id WHERE r.org_id <> c.org_id
    )
    SELECT relation, count(*)::int AS total, min(row_id) AS exemplo
    FROM violacoes GROUP BY relation ORDER BY relation
  LOOP
    msg := msg || format('%s: %s linha(s) (ex.: %s); ', v.relation, v.total, v.exemplo);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0013 abortada: referencias entre organizacoes ja existentes -- %', msg
      USING HINT = 'Corrija os dados antes de aplicar as FKs compostas (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint

-- 1. Alvos: a organização passa a fazer parte da chave referenciável.
ALTER TABLE "parties" ADD CONSTRAINT "parties_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "inspection_rooms" ADD CONSTRAINT "inspection_rooms_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "meta_assets" ADD CONSTRAINT "meta_assets_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint

-- 2. Fora as FKs de coluna única, que aceitavam qualquer organização.
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_party_id_parties_id_fk";--> statement-breakpoint
ALTER TABLE "lead_property_interests" DROP CONSTRAINT IF EXISTS "lead_property_interests_lead_id_leads_id_fk";--> statement-breakpoint
ALTER TABLE "lead_property_interests" DROP CONSTRAINT IF EXISTS "lead_property_interests_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_lead_id_leads_id_fk";--> statement-breakpoint
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_party_id_parties_id_fk";--> statement-breakpoint
ALTER TABLE "visits" DROP CONSTRAINT IF EXISTS "visits_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_lead_id_leads_id_fk";--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_party_id_parties_id_fk";--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT IF EXISTS "proposals_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "rental_applications" DROP CONSTRAINT IF EXISTS "rental_applications_lead_id_leads_id_fk";--> statement-breakpoint
ALTER TABLE "rental_applications" DROP CONSTRAINT IF EXISTS "rental_applications_party_id_parties_id_fk";--> statement-breakpoint
ALTER TABLE "rental_applications" DROP CONSTRAINT IF EXISTS "rental_applications_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "rental_applications" DROP CONSTRAINT IF EXISTS "rental_applications_proposal_id_proposals_id_fk";--> statement-breakpoint
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "inspection_media" DROP CONSTRAINT IF EXISTS "inspection_media_room_id_inspection_rooms_id_fk";--> statement-breakpoint
ALTER TABLE "inspection_observations" DROP CONSTRAINT IF EXISTS "inspection_observations_room_id_inspection_rooms_id_fk";--> statement-breakpoint
ALTER TABLE "inspection_observations" DROP CONSTRAINT IF EXISTS "inspection_observations_media_id_inspection_media_id_fk";--> statement-breakpoint
ALTER TABLE "meta_assets" DROP CONSTRAINT IF EXISTS "meta_assets_connection_id_meta_connections_id_fk";--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" DROP CONSTRAINT IF EXISTS "meta_ad_profiles_connection_id_meta_connections_id_fk";--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" DROP CONSTRAINT IF EXISTS "meta_ad_profiles_property_id_properties_id_fk";--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" DROP CONSTRAINT IF EXISTS "meta_ad_profiles_page_asset_id_meta_assets_id_fk";--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" DROP CONSTRAINT IF EXISTS "meta_ad_profiles_instagram_asset_id_meta_assets_id_fk";--> statement-breakpoint

-- 3. FKs compostas. ON DELETE SET NULL lista a coluna da referência: org_id é
-- NOT NULL e não pode ser anulada junto (Postgres 15+).
ALTER TABLE "leads" ADD CONSTRAINT "leads_party_org_fk" FOREIGN KEY ("org_id","party_id") REFERENCES "public"."parties"("org_id","id") ON DELETE SET NULL ("party_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_property_interests" ADD CONSTRAINT "lead_interests_lead_org_fk" FOREIGN KEY ("org_id","lead_id") REFERENCES "public"."leads"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_property_interests" ADD CONSTRAINT "lead_interests_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE SET NULL ("property_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_org_fk" FOREIGN KEY ("org_id","lead_id") REFERENCES "public"."leads"("org_id","id") ON DELETE SET NULL ("lead_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_party_org_fk" FOREIGN KEY ("org_id","party_id") REFERENCES "public"."parties"("org_id","id") ON DELETE SET NULL ("party_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE SET NULL ("property_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_org_fk" FOREIGN KEY ("org_id","lead_id") REFERENCES "public"."leads"("org_id","id") ON DELETE SET NULL ("lead_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_party_org_fk" FOREIGN KEY ("org_id","party_id") REFERENCES "public"."parties"("org_id","id") ON DELETE SET NULL ("party_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE SET NULL ("property_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "applications_party_org_fk" FOREIGN KEY ("org_id","party_id") REFERENCES "public"."parties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "applications_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "applications_lead_org_fk" FOREIGN KEY ("org_id","lead_id") REFERENCES "public"."leads"("org_id","id") ON DELETE SET NULL ("lead_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "applications_proposal_org_fk" FOREIGN KEY ("org_id","proposal_id") REFERENCES "public"."proposals"("org_id","id") ON DELETE SET NULL ("proposal_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_room_org_fk" FOREIGN KEY ("org_id","room_id") REFERENCES "public"."inspection_rooms"("org_id","id") ON DELETE SET NULL ("room_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_room_org_fk" FOREIGN KEY ("org_id","room_id") REFERENCES "public"."inspection_rooms"("org_id","id") ON DELETE SET NULL ("room_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_media_org_fk" FOREIGN KEY ("org_id","media_id") REFERENCES "public"."inspection_media"("org_id","id") ON DELETE SET NULL ("media_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_assets" ADD CONSTRAINT "meta_assets_connection_org_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."meta_connections"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_connection_org_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."meta_connections"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_property_org_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_page_asset_org_fk" FOREIGN KEY ("org_id","page_asset_id") REFERENCES "public"."meta_assets"("org_id","id") ON DELETE SET NULL ("page_asset_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_instagram_asset_org_fk" FOREIGN KEY ("org_id","instagram_asset_id") REFERENCES "public"."meta_assets"("org_id","id") ON DELETE SET NULL ("instagram_asset_id") ON UPDATE no action;
