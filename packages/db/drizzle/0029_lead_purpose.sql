-- Onda 4: o CRM passa a ter dois funis, aluguel e venda.
--
-- Poderia ser deduzido do imovel de interesse, mas lead sem imovel vinculado
-- existe (contato que chegou pelo WhatsApp antes de escolher), e imovel com
-- finalidade BOTH nao decide nada. Adivinhar o funil de um lead e pior do que
-- perguntar: quem atende e quem sabe.
--
-- O default e RENT porque ate aqui o produto era so locacao: toda linha
-- existente e de aluguel, e marcar como tal e o unico backfill correto.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'RENT';--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_purpose_valid') THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_purpose_valid" CHECK ("purpose" in ('RENT', 'SALE'));
  END IF;
END
$$;--> statement-breakpoint
-- O board do pipeline lista por funil e por etapa.
CREATE INDEX IF NOT EXISTS "leads_org_purpose_status_idx" ON "leads" ("org_id", "purpose", "status");
