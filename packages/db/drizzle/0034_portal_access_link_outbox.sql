-- Onda 6: a caixa de saida passa a aceitar o link de acesso do portal.
--
-- Ate aqui so a imobiliaria criava o link do inquilino e do proprietario. Quem
-- perdeu o link nao tinha como pedir outro sem ligar para a imobiliaria — e e
-- justamente quem ja e cliente.
--
-- Como toda mensagem do sistema, ela e GRAVADA e nao enviada: nenhum canal de
-- entrega esta ligado (docs/BLOCKERS.md). A tela diz isso em vez de prometer um
-- WhatsApp que ninguem manda.
ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_kind_valid";--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_kind_valid" CHECK ("email_outbox"."kind" in ('PASSWORD_RESET', 'MEMBER_INVITE', 'SEARCH_ALERT_CONFIRM', 'PORTAL_ACCESS_LINK'));