-- Contrato enviado ou assinado é imutável (auditoria 2026-09-10, P0-04 — Gate G2).
-- Cada geração do texto vira uma linha em contract_versions (com hash); o
-- envelope registra a versão enviada; gatilhos recusam reescrever o texto a
-- partir do envio para assinatura e regredir contrato assinado/cancelado.
-- Editada à mão: pré-voo, ordem UNIQUE → FK composta, backfill e gatilhos (o
-- drizzle-kit não modela gatilho e emitia a FK antes da UNIQUE que ela exige).
--
-- Pré-voo: aborta, sem alterar nada, se o banco já tiver contrato que o defeito
-- P0-04 corrompeu ou que não tenha como virar versão 1 íntegra.
DO $$
DECLARE
  v record;
  msg text := '';
BEGIN
  FOR v IN
    WITH violacoes(problema, contract_id) AS (
      -- sintoma direto do P0-04: regenerado depois de assinado (signed_at preservado)
      SELECT 'assinado e regenerado (signed_at com status diferente de SIGNED)', c.id::text
        FROM contracts c WHERE c.signed_at IS NOT NULL AND c.status <> 'SIGNED' AND c.status <> 'VOID'
      -- texto gerado de novo depois do envio para assinatura (trilha de auditoria)
      UNION ALL SELECT 'regenerado depois do envio para assinatura', g.entity_id
        FROM audit_events g
        JOIN audit_events s ON s.entity_type = 'CONTRACT' AND s.entity_id = g.entity_id
         AND s.action = 'contract.sent_for_signature'
        WHERE g.entity_type = 'CONTRACT' AND g.action = 'contract.generated'
          AND g.occurred_at > s.occurred_at
      UNION ALL SELECT 'sem conteudo fora de DRAFT', c.id::text
        FROM contracts c WHERE c.status <> 'DRAFT' AND c.content IS NULL
      UNION ALL SELECT 'hash nao confere com o conteudo', c.id::text
        FROM contracts c WHERE c.content IS NOT NULL
         AND c.content_hash IS DISTINCT FROM encode(sha256(convert_to(c.content, 'UTF8')), 'hex')
    )
    SELECT problema, count(DISTINCT contract_id)::int AS total, min(contract_id) AS exemplo
    FROM violacoes GROUP BY problema ORDER BY problema
  LOOP
    msg := msg || format('%s: %s contrato(s) (ex.: %s); ', v.problema, v.total, v.exemplo);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0014 abortada: contratos inconsistentes -- %', msg
      USING HINT = 'O texto valido e o documento enviado ao provider; revise estes contratos antes de aplicar (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "contract_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"template_id" uuid,
	"template_version" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_versions_version_positive" CHECK ("contract_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "current_version" integer;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD COLUMN "contract_version" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_org_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_org_fk" FOREIGN KEY ("org_id","contract_id") REFERENCES "public"."contracts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_versions_contract_version_unique" ON "contract_versions" USING btree ("contract_id","version");--> statement-breakpoint
CREATE INDEX "contract_versions_org_contract_idx" ON "contract_versions" USING btree ("org_id","contract_id");--> statement-breakpoint

-- Backfill: o texto vigente de cada contrato já gerado vira a versão 1.
INSERT INTO "contract_versions" ("id", "org_id", "contract_id", "version", "content", "content_hash", "template_id", "template_version", "created_by", "created_at")
SELECT gen_random_uuid(), c.org_id, c.id, 1, c.content, c.content_hash, c.template_id, t.version, c.created_by, c.updated_at
FROM "contracts" c
LEFT JOIN "contract_templates" t ON t.id = c.template_id
WHERE c.content IS NOT NULL;--> statement-breakpoint
UPDATE "contracts" SET "current_version" = 1 WHERE "content" IS NOT NULL;--> statement-breakpoint
UPDATE "signature_envelopes" e SET "contract_version" = 1
FROM "contracts" c
WHERE c.id = e.contract_id AND c.content IS NOT NULL;--> statement-breakpoint

-- Gatilhos: segunda linha de defesa. A API já recusa com 409; se uma escrita
-- escapar dela, o banco recusa com check_violation (23514).
CREATE OR REPLACE FUNCTION "contracts_guard_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'SIGNED', 'VOID') AND (
       NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.current_version IS DISTINCT FROM OLD.current_version
  ) THEN
    RAISE EXCEPTION 'contrato % em %: o texto enviado para assinatura e imutavel', OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.status IN ('SIGNED', 'VOID') AND NEW.status IS DISTINCT FROM OLD.status)
    OR (OLD.status = 'SENT_FOR_SIGNATURE' AND NEW.status IN ('DRAFT', 'GENERATED'))
    OR (OLD.status = 'PARTIALLY_SIGNED' AND NEW.status IN ('DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE'))
  THEN
    RAISE EXCEPTION 'contrato %: transicao % -> % recusada (status nao regride depois do envio)', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'SIGNED' AND NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'contrato %: data de assinatura e imutavel', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "contracts_immutable_after_send" BEFORE UPDATE ON "contracts"
FOR EACH ROW EXECUTE FUNCTION "contracts_guard_immutable"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "contract_versions_guard_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
  THEN
    RAISE EXCEPTION 'versao % do contrato % e imutavel', OLD.version, OLD.contract_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "contract_versions_immutable" BEFORE UPDATE ON "contract_versions"
FOR EACH ROW EXECUTE FUNCTION "contract_versions_guard_immutable"();
