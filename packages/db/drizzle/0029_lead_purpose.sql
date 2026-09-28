-- Onda 4: o CRM passa a ter dois funis, aluguel e venda.
--
-- O funil e declarado, nao deduzido do imovel de interesse: lead sem imovel
-- vinculado existe (contato que chegou pelo WhatsApp antes de escolher), e
-- imovel com finalidade BOTH nao decide nada. Adivinhar o funil de um lead e
-- pior do que assumir o historico.
--
-- Por isso o default e RENT: ate aqui o produto era so locacao, entao toda
-- linha existente e de aluguel e marcar como tal e o unico backfill correto.
ALTER TABLE "leads" ADD COLUMN "purpose" text DEFAULT 'RENT' NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_org_purpose_status_idx" ON "leads" USING btree ("org_id","purpose","status");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_purpose_valid" CHECK ("leads"."purpose" in ('RENT', 'SALE'));