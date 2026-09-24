-- Onda 3: o cadastro em etapas pergunta qual plano a imobiliaria quer usar.
--
-- O plano PEDIDO nao e o plano VIGENTE: quem decide e o admin da plataforma, na
-- aprovacao (ADR-060), e continua sendo `plan_id`. Esta coluna guarda so a
-- intencao declarada no cadastro, para a fila de aprovacao mostrar "pediu Gestao
-- Locacao" em vez de o admin adivinhar.
--
-- Guardamos o CODIGO, nao o id: o codigo e o que viaja no `?plano=` da URL
-- publica e o que o portal conhece, e plano apagado nao apaga o pedido. O CHECK
-- repete o formato de `plans_code_format`, para pedido vindo de URL montada a
-- mao nao entrar no banco.
ALTER TABLE "organizations" ADD COLUMN "requested_plan_code" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_requested_plan_code_format" CHECK ("organizations"."requested_plan_code" is null or "organizations"."requested_plan_code" ~ '^[A-Z0-9_]{2,40}$');