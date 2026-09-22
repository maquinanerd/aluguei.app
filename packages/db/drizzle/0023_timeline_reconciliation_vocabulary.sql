-- Vocabulário da timeline e da conciliação (pendências do inventário da trilha G do G3, auditoria
-- 2026-09-10, P2-12). A 0022 deixou sem CHECK as duas colunas em que o contrato não descrevia o que
-- a API e o worker gravam:
-- 1. `timeline_events.entity_type`: além das entidades do CRM (LEAD, PARTY, PROPOSAL, VISIT, TASK),
--    a API grava CONVERSATION e LISTING e o worker grava RENTAL_APPLICATION — o mesmo vocabulário de
--    `timelineEntityTypeSchema` (packages/contracts).
-- 2. `reconciliations.provider`: FAKE ou ASAAS, ou NONE quando a conciliação roda sem provider de
--    pagamento (`reconciliationProviderSchema`).
-- Gerada pelo drizzle-kit; editada à mão só no pré-voo abaixo.
--
-- Pré-voo: se alguma linha já tiver valor fora do vocabulário, a migração para sem aplicar nada e
-- lista tabela.coluna, id e valor de cada uma (até 20 por coluna, com a contagem do resto), como a
-- 0022. A lista de cada coluna é a mesma do ADD CONSTRAINT abaixo (o teste do schema confere).
DO $$
DECLARE
  r record;
  v record;
  total int;
  msg text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('reconciliations', 'provider', ARRAY['FAKE', 'ASAAS', 'NONE']),
      ('timeline_events', 'entity_type', ARRAY['LEAD', 'PARTY', 'PROPOSAL', 'VISIT', 'TASK', 'CONVERSATION', 'LISTING', 'RENTAL_APPLICATION'])
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

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0023 abortada: valores fora do vocabulario -- %', msg
      USING HINT = 'Corrija as linhas listadas (UPDATE para um valor do vocabulario) e aplique de novo (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_entity_type_valid" CHECK ("timeline_events"."entity_type" in ('LEAD', 'PARTY', 'PROPOSAL', 'VISIT', 'TASK', 'CONVERSATION', 'LISTING', 'RENTAL_APPLICATION'));--> statement-breakpoint
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_provider_valid" CHECK ("reconciliations"."provider" in ('FAKE', 'ASAAS', 'NONE'));