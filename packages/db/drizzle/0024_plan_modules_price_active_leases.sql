-- Onda 1A do frontend do AchouImóvel: o plano passa a dizer QUAIS MÓDULOS a imobiliária
-- tem (cadeado no menu e 403 PLAN_MODULE_NOT_INCLUDED na API), quantas LOCAÇÕES EM VIGOR
-- ela pode manter e qual PREÇO MENSAL a página pública de planos exibe (nulo = "Fale com
-- a gente"; nada aqui cobra).
-- Gerada pelo drizzle-kit; editada à mão só para semear os módulos (abaixo).
--
-- Compatibilidade: todo plano que já existe recebe os cinco módulos que o sistema tem hoje,
-- então nenhuma imobiliária perde acesso ao que já usava. VENDAS fica só no ILIMITADO porque
-- o módulo ainda não existe no produto — é o que dá um estado bloqueado real para a interface.
-- `max_active_leases` e `monthly_price_cents` ficam nulos: ilimitado e sem preço definido.
ALTER TABLE "plans" ADD COLUMN "max_active_leases" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "modules" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "monthly_price_cents" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_max_active_leases_valid" CHECK ("plans"."max_active_leases" is null or "plans"."max_active_leases" >= 0);--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_modules_valid" CHECK ("plans"."modules" <@ array['CRM'::text, 'ATENDIMENTO'::text, 'LOCACAO'::text, 'FINANCEIRO'::text, 'VENDAS'::text, 'MARKETING'::text]);--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_monthly_price_cents_valid" CHECK ("plans"."monthly_price_cents" is null or ("plans"."monthly_price_cents" >= 0 and "plans"."monthly_price_cents" <= 100000000));--> statement-breakpoint
UPDATE "plans" SET "modules" = array['CRM', 'ATENDIMENTO', 'LOCACAO', 'FINANCEIRO', 'MARKETING']::text[];--> statement-breakpoint
UPDATE "plans" SET "modules" = "modules" || 'VENDAS'::text WHERE "code" = 'ILIMITADO';
