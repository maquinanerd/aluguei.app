-- G3, trilha G (auditoria 2026-09-10, P2-12): o banco passa a ser a última barreira do domínio.
-- 1. CHECK `<tabela>_<coluna>_valid` nas colunas `text` de domínio fechado que ainda não tinham
--    (status, tipos, papéis): a lista é a do domínio (`packages/domain`) ou, sem constante lá, a do
--    contrato da API (`packages/contracts`); `tests/integration/src/g3-g-schema-domain.test.ts`
--    compara as duas no banco migrado.
-- 2. `bigint` nos totais da conciliação (`reconciliations.provider_total_cents` e
--    `local_total_cents`): a soma das cobranças pagas da organização estourava o int4 acima de
--    R$ 21.474.836,47. Alargar o tipo não perde valor.
-- 3. `party_consents_active_unique` (índice parcial criado à mão na 0007, fora do schema do
--    drizzle) passa a ser declarado em `crm.ts`; aqui é recriado com a definição do schema.
-- Gerada pelo drizzle-kit; editada à mão em dois pontos: o pré-voo abaixo e o `DROP INDEX IF
-- EXISTS` antes de recriar o índice parcial.
--
-- Pré-voo: se alguma linha já tiver valor fora do domínio, a migração para sem aplicar nada e
-- lista tabela.coluna, id e valor de cada uma (até 20 por coluna, com a contagem do resto). A
-- lista de cada coluna é a mesma do ADD CONSTRAINT abaixo (o teste do schema confere).
DO $$
DECLARE
  r record;
  v record;
  total int;
  msg text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('leads', 'status', ARRAY['NEW', 'QUALIFYING', 'QUALIFIED', 'VISIT', 'PROPOSAL', 'APPLICATION', 'WON', 'LOST']),
      ('party_roles', 'role', ARRAY['OWNER', 'TENANT', 'GUARANTOR', 'BROKER', 'LEGAL_REPRESENTATIVE']),
      ('tasks', 'status', ARRAY['OPEN', 'DONE', 'CANCELLED']),
      ('listings', 'status', ARRAY['DRAFT', 'READY', 'PUBLISHED', 'PAUSED', 'ARCHIVED']),
      ('properties', 'status', ARRAY['ACTIVE', 'ARCHIVED']),
      ('properties', 'property_type', ARRAY['APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND']),
      ('property_media', 'kind', ARRAY['PHOTO', 'DOCUMENT', 'FLOORPLAN']),
      ('channel_sync_jobs', 'channel', ARRAY['fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb']),
      ('channel_sync_jobs', 'job_type', ARRAY['PUBLISH', 'UPDATE', 'REMOVE', 'RECONCILE', 'IMPORT_LEADS']),
      ('channel_sync_jobs', 'status', ARRAY['PENDING', 'RUNNING', 'SUCCESS', 'FAILED']),
      ('listing_channel_publications', 'channel', ARRAY['fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb']),
      ('listing_channel_publications', 'status', ARRAY['PENDING', 'PUBLISHING', 'PUBLISHED', 'UPDATE_PENDING', 'REMOVING', 'REMOVED', 'FAILED', 'RECONCILING']),
      ('conversation_intents', 'intent', ARRAY['VISIT_REQUEST', 'PRICE_QUERY', 'AVAILABILITY', 'OTHER']),
      ('conversation_intents', 'extracted_by', ARRAY['AI', 'RULE']),
      ('conversations', 'status', ARRAY['OPEN', 'ACTIVE', 'NEEDS_HUMAN', 'CLOSED']),
      ('messages', 'direction', ARRAY['INBOUND', 'OUTBOUND']),
      ('messages', 'sender_type', ARRAY['USER', 'AGENT', 'BOT']),
      ('inspection_ai_suggestions', 'kind', ARRAY['VISUAL', 'TRANSCRIPT']),
      ('inspection_comparisons', 'status', ARRAY['DRAFT', 'COMPLETED']),
      ('inspection_media', 'kind', ARRAY['PHOTO', 'AUDIO', 'VIDEO']),
      ('inspection_observations', 'category', ARRAY['DAMAGE', 'CONDITION', 'CLEANLINESS', 'FURNITURE', 'INSTALLATION', 'OTHER']),
      ('inspection_observations', 'severity', ARRAY['NONE', 'LOW', 'MEDIUM', 'HIGH']),
      ('inspection_observations', 'source', ARRAY['HUMAN', 'AI']),
      ('inspection_observations', 'status', ARRAY['DRAFT', 'CONFIRMED', 'REJECTED', 'EDITED']),
      ('inspection_transcripts', 'status', ARRAY['PENDING', 'PROCESSED', 'FAILED']),
      ('inspections', 'type', ARRAY['CHECKIN', 'CHECKOUT', 'INTERMEDIATE']),
      ('inspections', 'status', ARRAY['DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW', 'COMPLETED', 'SIGNED']),
      ('contract_parties', 'role', ARRAY['LANDLORD', 'TENANT', 'GUARANTOR']),
      ('contract_templates', 'status', ARRAY['DRAFT', 'APPROVED', 'ARCHIVED']),
      ('contracts', 'status', ARRAY['DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'SIGNED', 'VOID']),
      ('rental_applications', 'status', ARRAY['DRAFT', 'SUBMITTED', 'SCREENING', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'CONTRACTING']),
      ('screening_results', 'decision', ARRAY['APPROVE', 'REVIEW', 'REJECT']),
      ('signature_envelopes', 'status', ARRAY['PENDING', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'FAILED']),
      ('signature_events', 'event_type', ARRAY['SIGNER_SIGNED', 'COMPLETED', 'FAILED']),
      ('charges', 'status', ARRAY['SCHEDULED', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED']),
      ('lease_amendments', 'index_name', ARRAY['IGPM', 'IPCA', 'INPC', 'IVAR', 'OUTRO']),
      ('leases', 'status', ARRAY['PENDING', 'ACTIVE', 'DELINQUENT', 'TERMINATING', 'ENDED']),
      ('ledger_accounts', 'type', ARRAY['ASSET', 'LIABILITY', 'REVENUE', 'EQUITY']),
      ('party_bank_accounts', 'status', ARRAY['ACTIVE', 'INACTIVE']),
      ('payments', 'method', ARRAY['PIX', 'BOLETO', 'CREDIT_CARD', 'MANUAL']),
      ('payments', 'status', ARRAY['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUNDED']),
      ('payouts', 'status', ARRAY['PENDING', 'PAID', 'FAILED', 'CANCELLED']),
      ('reconciliations', 'status', ARRAY['PENDING', 'MATCHED', 'DISCREPANCY']),
      ('split_allocations', 'role', ARRAY['LANDLORD', 'AGENCY']),
      ('meta_ad_profiles', 'objective', ARRAY['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT']),
      ('meta_ad_profiles', 'status', ARRAY['DRAFT', 'PREPARED', 'CREATED', 'PUBLISHED', 'PAUSED', 'ARCHIVED']),
      ('meta_assets', 'kind', ARRAY['AD_ACCOUNT', 'PAGE', 'INSTAGRAM_ACCOUNT', 'BUSINESS']),
      ('meta_campaign_links', 'objective', ARRAY['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT']),
      ('meta_campaign_links', 'status', ARRAY['CREATED_PAUSED', 'ACTIVE', 'PAUSED', 'ARCHIVED']),
      ('meta_connections', 'status', ARRAY['CONNECTING', 'ACTIVE', 'EXPIRED', 'REVOKED']),
      ('meta_sync_jobs', 'job_type', ARRAY['SYNC_INSIGHTS', 'CREATE_CAMPAIGN', 'PUBLISH_INTENT', 'PAUSE', 'RESUME', 'UPDATE_BUDGET', 'UPDATE_SCHEDULE', 'UPDATE_CREATIVE', 'ARCHIVE']),
      ('portal_access', 'kind', ARRAY['LANDLORD', 'TENANT'])
    ) AS dominio(tabela, coluna, permitidos)
    ORDER BY tabela, coluna
  LOOP
    EXECUTE format(
      'SELECT count(*)::int FROM %I WHERE %I IS NOT NULL AND NOT (%I = ANY ($1))',
      r.tabela, r.coluna, r.coluna
    ) INTO total USING r.permitidos;
    IF total > 0 THEN
      FOR v IN EXECUTE format(
        'SELECT id::text AS id, %I AS valor FROM %I WHERE %I IS NOT NULL AND NOT (%I = ANY ($1)) ORDER BY id LIMIT 20',
        r.coluna, r.tabela, r.coluna, r.coluna
      ) USING r.permitidos
      LOOP
        msg := msg || format('%s.%s %s = %s; ', r.tabela, r.coluna, v.id, v.valor);
      END LOOP;
      IF total > 20 THEN
        msg := msg || format('%s.%s: mais %s linha(s); ', r.tabela, r.coluna, total - 20);
      END IF;
    END IF;
  END LOOP;

  -- O índice parcial é recriado: consentimento ativo duplicado também para a migração.
  FOR v IN
    SELECT party_id, purpose, count(*)::int AS total
    FROM party_consents
    WHERE revoked_at IS NULL
    GROUP BY party_id, purpose
    HAVING count(*) > 1
    ORDER BY party_id, purpose
  LOOP
    msg := msg || format('party_consents pessoa %s, %s: %s ativos; ', v.party_id, v.purpose, v.total);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0022 abortada: dados fora do dominio fechado -- %', msg
      USING HINT = 'Corrija cada linha listada para um valor do dominio e aplique de novo (docs/audits/2026-09-10/evidence/g3/track-g/README.md).';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "reconciliations" ALTER COLUMN "provider_total_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "reconciliations" ALTER COLUMN "local_total_cents" SET DATA TYPE bigint;--> statement-breakpoint
-- Criado à mão na 0007 (sem USING btree e com outra grafia do WHERE): recriado pelo schema.
DROP INDEX IF EXISTS "party_consents_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "party_consents_active_unique" ON "party_consents" USING btree ("party_id","purpose") WHERE "party_consents"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_valid" CHECK ("leads"."status" in ('NEW', 'QUALIFYING', 'QUALIFIED', 'VISIT', 'PROPOSAL', 'APPLICATION', 'WON', 'LOST'));--> statement-breakpoint
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_role_valid" CHECK ("party_roles"."role" in ('OWNER', 'TENANT', 'GUARANTOR', 'BROKER', 'LEGAL_REPRESENTATIVE'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_valid" CHECK ("tasks"."status" in ('OPEN', 'DONE', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_status_valid" CHECK ("listings"."status" in ('DRAFT', 'READY', 'PUBLISHED', 'PAUSED', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_status_valid" CHECK ("properties"."status" in ('ACTIVE', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_property_type_valid" CHECK ("properties"."property_type" in ('APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND'));--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_kind_valid" CHECK ("property_media"."kind" in ('PHOTO', 'DOCUMENT', 'FLOORPLAN'));--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" ADD CONSTRAINT "channel_sync_jobs_channel_valid" CHECK ("channel_sync_jobs"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb'));--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" ADD CONSTRAINT "channel_sync_jobs_job_type_valid" CHECK ("channel_sync_jobs"."job_type" in ('PUBLISH', 'UPDATE', 'REMOVE', 'RECONCILE', 'IMPORT_LEADS'));--> statement-breakpoint
ALTER TABLE "channel_sync_jobs" ADD CONSTRAINT "channel_sync_jobs_status_valid" CHECK ("channel_sync_jobs"."status" in ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED'));--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_channel_valid" CHECK ("listing_channel_publications"."channel" in ('fake', 'canalpro', 'vivareal', 'zap', 'olx', 'imovelweb'));--> statement-breakpoint
ALTER TABLE "listing_channel_publications" ADD CONSTRAINT "listing_channel_publications_status_valid" CHECK ("listing_channel_publications"."status" in ('PENDING', 'PUBLISHING', 'PUBLISHED', 'UPDATE_PENDING', 'REMOVING', 'REMOVED', 'FAILED', 'RECONCILING'));--> statement-breakpoint
ALTER TABLE "conversation_intents" ADD CONSTRAINT "conversation_intents_intent_valid" CHECK ("conversation_intents"."intent" in ('VISIT_REQUEST', 'PRICE_QUERY', 'AVAILABILITY', 'OTHER'));--> statement-breakpoint
ALTER TABLE "conversation_intents" ADD CONSTRAINT "conversation_intents_extracted_by_valid" CHECK ("conversation_intents"."extracted_by" in ('AI', 'RULE'));--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_status_valid" CHECK ("conversations"."status" in ('OPEN', 'ACTIVE', 'NEEDS_HUMAN', 'CLOSED'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_direction_valid" CHECK ("messages"."direction" in ('INBOUND', 'OUTBOUND'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_type_valid" CHECK ("messages"."sender_type" in ('USER', 'AGENT', 'BOT'));--> statement-breakpoint
ALTER TABLE "inspection_ai_suggestions" ADD CONSTRAINT "inspection_ai_suggestions_kind_valid" CHECK ("inspection_ai_suggestions"."kind" in ('VISUAL', 'TRANSCRIPT'));--> statement-breakpoint
ALTER TABLE "inspection_comparisons" ADD CONSTRAINT "inspection_comparisons_status_valid" CHECK ("inspection_comparisons"."status" in ('DRAFT', 'COMPLETED'));--> statement-breakpoint
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_kind_valid" CHECK ("inspection_media"."kind" in ('PHOTO', 'AUDIO', 'VIDEO'));--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_category_valid" CHECK ("inspection_observations"."category" in ('DAMAGE', 'CONDITION', 'CLEANLINESS', 'FURNITURE', 'INSTALLATION', 'OTHER'));--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_severity_valid" CHECK ("inspection_observations"."severity" in ('NONE', 'LOW', 'MEDIUM', 'HIGH'));--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_source_valid" CHECK ("inspection_observations"."source" in ('HUMAN', 'AI'));--> statement-breakpoint
ALTER TABLE "inspection_observations" ADD CONSTRAINT "inspection_observations_status_valid" CHECK ("inspection_observations"."status" in ('DRAFT', 'CONFIRMED', 'REJECTED', 'EDITED'));--> statement-breakpoint
ALTER TABLE "inspection_transcripts" ADD CONSTRAINT "inspection_transcripts_status_valid" CHECK ("inspection_transcripts"."status" in ('PENDING', 'PROCESSED', 'FAILED'));--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_type_valid" CHECK ("inspections"."type" in ('CHECKIN', 'CHECKOUT', 'INTERMEDIATE'));--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_status_valid" CHECK ("inspections"."status" in ('DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW', 'COMPLETED', 'SIGNED'));--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_role_valid" CHECK ("contract_parties"."role" in ('LANDLORD', 'TENANT', 'GUARANTOR'));--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_status_valid" CHECK ("contract_templates"."status" in ('DRAFT', 'APPROVED', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_status_valid" CHECK ("contracts"."status" in ('DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'SIGNED', 'VOID'));--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_status_valid" CHECK ("rental_applications"."status" in ('DRAFT', 'SUBMITTED', 'SCREENING', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'CONTRACTING'));--> statement-breakpoint
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_decision_valid" CHECK ("screening_results"."decision" in ('APPROVE', 'REVIEW', 'REJECT'));--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_status_valid" CHECK ("signature_envelopes"."status" in ('PENDING', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'FAILED'));--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_event_type_valid" CHECK ("signature_events"."event_type" in ('SIGNER_SIGNED', 'COMPLETED', 'FAILED'));--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_status_valid" CHECK ("charges"."status" in ('SCHEDULED', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'));--> statement-breakpoint
ALTER TABLE "lease_amendments" ADD CONSTRAINT "lease_amendments_index_name_valid" CHECK ("lease_amendments"."index_name" is null or "lease_amendments"."index_name" in ('IGPM', 'IPCA', 'INPC', 'IVAR', 'OUTRO'));--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_status_valid" CHECK ("leases"."status" in ('PENDING', 'ACTIVE', 'DELINQUENT', 'TERMINATING', 'ENDED'));--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_type_valid" CHECK ("ledger_accounts"."type" in ('ASSET', 'LIABILITY', 'REVENUE', 'EQUITY'));--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_status_valid" CHECK ("party_bank_accounts"."status" in ('ACTIVE', 'INACTIVE'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_valid" CHECK ("payments"."method" in ('PIX', 'BOLETO', 'CREDIT_CARD', 'MANUAL'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_valid" CHECK ("payments"."status" in ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUNDED'));--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_status_valid" CHECK ("payouts"."status" in ('PENDING', 'PAID', 'FAILED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_status_valid" CHECK ("reconciliations"."status" in ('PENDING', 'MATCHED', 'DISCREPANCY'));--> statement-breakpoint
ALTER TABLE "split_allocations" ADD CONSTRAINT "split_allocations_role_valid" CHECK ("split_allocations"."role" in ('LANDLORD', 'AGENCY'));--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_objective_valid" CHECK ("meta_ad_profiles"."objective" in ('OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT'));--> statement-breakpoint
ALTER TABLE "meta_ad_profiles" ADD CONSTRAINT "meta_ad_profiles_status_valid" CHECK ("meta_ad_profiles"."status" in ('DRAFT', 'PREPARED', 'CREATED', 'PUBLISHED', 'PAUSED', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "meta_assets" ADD CONSTRAINT "meta_assets_kind_valid" CHECK ("meta_assets"."kind" in ('AD_ACCOUNT', 'PAGE', 'INSTAGRAM_ACCOUNT', 'BUSINESS'));--> statement-breakpoint
ALTER TABLE "meta_campaign_links" ADD CONSTRAINT "meta_campaign_links_objective_valid" CHECK ("meta_campaign_links"."objective" in ('OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT'));--> statement-breakpoint
ALTER TABLE "meta_campaign_links" ADD CONSTRAINT "meta_campaign_links_status_valid" CHECK ("meta_campaign_links"."status" in ('CREATED_PAUSED', 'ACTIVE', 'PAUSED', 'ARCHIVED'));--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_status_valid" CHECK ("meta_connections"."status" in ('CONNECTING', 'ACTIVE', 'EXPIRED', 'REVOKED'));--> statement-breakpoint
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_job_type_valid" CHECK ("meta_sync_jobs"."job_type" in ('SYNC_INSIGHTS', 'CREATE_CAMPAIGN', 'PUBLISH_INTENT', 'PAUSE', 'RESUME', 'UPDATE_BUDGET', 'UPDATE_SCHEDULE', 'UPDATE_CREATIVE', 'ARCHIVE'));--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_kind_valid" CHECK ("portal_access"."kind" in ('LANDLORD', 'TENANT'));