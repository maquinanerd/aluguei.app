-- Data de entrada no plano atual (ADR-105, B15). A coluna nasceu na 0037 com o horário da
-- migration; aqui ela passa a ser o último evento de auditoria que pôs a imobiliária no plano que
-- ela tem hoje (troca pela plataforma ou aprovação com plano) e, sem evento, a criação da
-- imobiliária, que é quando o plano padrão foi atribuído. Só dados; o esquema não muda.
UPDATE "organizations" AS o
SET "plan_started_at" = coalesce(
  (
    SELECT max(a."occurred_at")
    FROM "audit_events" AS a
    WHERE a."entity_type" = 'ORGANIZATION'
      AND a."entity_id" = o."id"::text
      AND a."payload" ->> 'toPlanId' = o."plan_id"::text
  ),
  o."created_at"
);
