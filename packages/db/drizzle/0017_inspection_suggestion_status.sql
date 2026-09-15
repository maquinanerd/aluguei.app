-- Sugestão de IA: status é o resultado, nunca a ação (auditoria 2026-09-10, P1-05 — Gate G2).
-- A API gravava a ação (ACCEPT | REJECT | EDIT) na coluna status e toda leitura da
-- vistoria respondia 400. Editada à mão: pré-voo e conversão dos dados antes do CHECK
-- (o drizzle-kit emite só o CHECK, que falharia com as linhas já gravadas).
--
-- Pré-voo: aborta, sem alterar nada, se houver status que não seja um dos quatro
-- válidos nem uma das três ações que o defeito gravava.
DO $$
DECLARE
  v record;
  msg text := '';
BEGIN
  FOR v IN
    SELECT s.status, count(*)::int AS total, min(s.id::text) AS exemplo
    FROM inspection_ai_suggestions s
    WHERE s.status NOT IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED', 'ACCEPT', 'REJECT', 'EDIT')
    GROUP BY s.status ORDER BY s.status
  LOOP
    msg := msg || format('status desconhecido %s: %s sugestao(oes) (ex.: %s); ', v.status, v.total, v.exemplo);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0017 abortada: sugestoes de IA com status desconhecido -- %', msg
      USING HINT = 'Revise cada sugestao (validos: PENDING, ACCEPTED, REJECTED, EDITED) antes de aplicar (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint
-- Conversão das linhas que o defeito gravou: ação → status.
UPDATE "inspection_ai_suggestions"
SET "status" = CASE "status" WHEN 'ACCEPT' THEN 'ACCEPTED' WHEN 'REJECT' THEN 'REJECTED' WHEN 'EDIT' THEN 'EDITED' END,
    "updated_at" = now()
WHERE "status" IN ('ACCEPT', 'REJECT', 'EDIT');--> statement-breakpoint
ALTER TABLE "inspection_ai_suggestions" ADD CONSTRAINT "inspection_ai_suggestions_status_valid" CHECK ("inspection_ai_suggestions"."status" in ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED'));
