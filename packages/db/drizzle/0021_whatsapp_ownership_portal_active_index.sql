-- G3, trilha E2 (auditoria 2026-09-10).
-- 1. Portal (pendência do ADR-061): `portal_access_org_party_kind_active_unique` incluía
--    `revoked_at`, e o PostgreSQL trata nulos como distintos — o banco aceitava duas concessões
--    ativas da mesma pessoa. Passa a ser índice parcial `WHERE revoked_at IS NULL`.
-- 2. WhatsApp (P1-18, segunda parte): prova de posse do número. A conexão guarda o token cifrado
--    da conta do WhatsApp Business da própria organização, nasce PENDING e só recebe webhook
--    VERIFIED. As conexões antigas (ACTIVE) nunca provaram a posse: viram PENDING com o prazo já
--    vencido e sem token — a organização informa o token e verifica de novo.
-- Gerada pelo drizzle-kit; editada à mão em dois pontos: o pré-voo abaixo e o UPDATE do status
-- antigo antes dos CHECKs.
--
-- Pré-voo: se já houver duas concessões ativas da mesma pessoa e tipo, a migração para com a
-- lista (sem aplicar nada) em vez de falhar no CREATE UNIQUE INDEX. A organização revoga a
-- sobra (a concessão mais antiga, cujo link já não vale) e aplica de novo.
DO $$
DECLARE
  v record;
  msg text := '';
BEGIN
  FOR v IN
    SELECT org_id, party_id, kind, count(*)::int AS total
    FROM portal_access
    WHERE revoked_at IS NULL
    GROUP BY org_id, party_id, kind
    HAVING count(*) > 1
    ORDER BY org_id, party_id, kind
  LOOP
    msg := msg || format('org %s, pessoa %s, %s: %s ativas; ', v.org_id, v.party_id, v.kind, v.total);
  END LOOP;

  IF msg <> '' THEN
    RAISE EXCEPTION 'Migracao 0021 abortada: concessoes ativas duplicadas em portal_access -- %', msg
      USING HINT = 'Revogue as concessoes excedentes (revoked_at) antes de aplicar o indice parcial (docs/audits/2026-09-10).';
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX "portal_access_org_party_kind_active_unique";--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "token_key_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
-- Status antigo (ACTIVE, sem prova de posse) → PENDING vencida.
UPDATE "whatsapp_connections"
SET "status" = 'PENDING', "claim_expires_at" = coalesce("claim_expires_at", now()), "updated_at" = now()
WHERE "status" NOT IN ('VERIFIED', 'DISABLED');--> statement-breakpoint
CREATE UNIQUE INDEX "portal_access_org_party_kind_active_unique" ON "portal_access" USING btree ("org_id","party_id","kind") WHERE "portal_access"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_status_valid" CHECK ("whatsapp_connections"."status" in ('PENDING', 'VERIFIED', 'DISABLED'));--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_verified_needs_verified_at" CHECK (("whatsapp_connections"."status" <> 'VERIFIED') or ("whatsapp_connections"."verified_at" is not null));--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_pending_needs_claim_expiry" CHECK (("whatsapp_connections"."status" <> 'PENDING') or ("whatsapp_connections"."claim_expires_at" is not null));
