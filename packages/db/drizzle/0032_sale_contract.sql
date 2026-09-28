-- Onda 5: contrato de compra e venda, sobre os modelos versionados e o envelope
-- de assinatura que ja existem.
--
-- `kind` nasce como LEASE porque todo contrato e todo modelo existentes sao de
-- locacao — e o unico backfill correto. Template de locacao e de compra e venda
-- falam de partes diferentes e oferecem variaveis diferentes; sem a especie, a
-- lista de modelos misturaria os dois e alguem geraria um contrato de venda com
-- clausula de aluguel.
--
-- `negotiation_id` e coluna propria, e nao um id generico: locacao nasce de uma
-- candidatura e venda nasce de uma negociacao. Dois caminhos diferentes, duas
-- colunas — id generico e o tipo de economia que ninguem consegue ler depois.
ALTER TABLE "contract_templates" ADD COLUMN "kind" text DEFAULT 'LEASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "kind" text DEFAULT 'LEASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "negotiation_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_kind_valid" CHECK ("contract_templates"."kind" in ('LEASE', 'SALE'));--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_kind_valid" CHECK ("contracts"."kind" in ('LEASE', 'SALE'));