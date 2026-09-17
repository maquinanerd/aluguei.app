-- Decisão de crédito auditável (auditoria 2026-09-10, P1-06 — Gate G2).
-- Toda aprovação ou rejeição passa a registrar motivo, data e origem (MANUAL,
-- com responsável, ou AUTOMATIC, pelas regras sobre o resultado do screening);
-- candidatura com contrato ativo fica em CONTRACTING. Editada à mão: pré-voo e
-- backfill antes dos CHECKs (o drizzle-kit emite só a coluna e os CHECKs).
--
-- Pré-voo: aborta, sem alterar nada, se já houver candidatura que o defeito
-- P1-06 deixou decidida sem análise ou sem trilha. Cada uma exige revisão humana.
DO $$
DECLARE
  v record;
  msg text := '';
BEGIN
  FOR v IN
    WITH violacoes(problema, application_id) AS (
      SELECT 'decidida sem motivo', a.id::text FROM rental_applications a
        WHERE a.status IN ('APPROVED', 'REJECTED', 'CONTRACTING')
          AND (a.decision_reason IS NULL OR btrim(a.decision_reason) = '')
      UNION ALL SELECT 'decidida sem data da decisao', a.id::text FROM rental_applications a
        WHERE a.status IN ('APPROVED', 'REJECTED', 'CONTRACTING') AND a.decided_at IS NULL
      UNION ALL SELECT 'decidida sem responsavel nem regra automatica', a.id::text FROM rental_applications a
        WHERE a.status IN ('APPROVED', 'REJECTED', 'CONTRACTING') AND a.decided_by IS NULL
          AND coalesce(a.decision_reason, '') NOT LIKE 'auto:%'
      UNION ALL SELECT 'sem resultado de screening', a.id::text FROM rental_applications a
        WHERE a.status IN ('MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'CONTRACTING')
          AND NOT EXISTS (SELECT 1 FROM screening_results r WHERE r.application_id = a.id)
      UNION ALL SELECT 'em SCREENING sem pedido de screening', a.id::text FROM rental_applications a
        WHERE a.status = 'SCREENING'
          AND NOT EXISTS (SELECT 1 FROM screening_requests q WHERE q.application_id = a.id)
    )
    SELECT problema, count(*)::int AS total, min(application_id) AS exemplo
    FROM violacoes GROUP BY problema ORDER BY problema
  LOOP
    msg := msg || format('%s: %s candidatura(s) (ex.: %s); ', v.problema, v.total, v.exemplo);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0015 abortada: decisoes de credito sem trilha -- %', msg
      USING HINT = 'Revise cada candidatura (nova analise ou decisao manual com motivo e responsavel) antes de aplicar (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "rental_applications" ADD COLUMN "decision_source" text;--> statement-breakpoint

-- Backfill da origem: decisão com responsável é MANUAL; sem responsável, o
-- pré-voo garante que o motivo é o "auto:" gravado pelo worker.
UPDATE "rental_applications"
SET "decision_source" = CASE WHEN "decided_by" IS NOT NULL THEN 'MANUAL' ELSE 'AUTOMATIC' END
WHERE "status" IN ('APPROVED', 'REJECTED', 'CONTRACTING');--> statement-breakpoint

-- Candidatura aprovada com contrato não cancelado passa a CONTRACTING.
UPDATE "rental_applications" a
SET "status" = 'CONTRACTING', "updated_at" = now()
WHERE a."status" = 'APPROVED'
  AND EXISTS (SELECT 1 FROM "contracts" c WHERE c."application_id" = a."id" AND c."status" <> 'VOID');--> statement-breakpoint

ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_decision_source_valid" CHECK ("rental_applications"."decision_source" is null or "rental_applications"."decision_source" in ('MANUAL', 'AUTOMATIC'));--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_decision_recorded" CHECK ("rental_applications"."status" not in ('APPROVED', 'REJECTED', 'CONTRACTING') or ("rental_applications"."decision_reason" is not null and btrim("rental_applications"."decision_reason") <> '' and "rental_applications"."decided_at" is not null and "rental_applications"."decision_source" is not null));
