-- Onda 5: o contrato de compra e venda tem partes proprias.
--
-- Comprador e vendedor nao sao inquilino e locador. Reaproveitar LANDLORD e
-- TENANT no contrato de venda mentiria no corpo do documento e na ordem de
-- assinatura — por isso o vocabulario cresce em vez de ser reinterpretado.
--
-- O CHECK e recriado (nao ha ALTER de CHECK no Postgres); nenhuma linha muda de
-- valor, entao a troca nao invalida contrato existente.
ALTER TABLE "contract_parties" DROP CONSTRAINT "contract_parties_role_valid";--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_role_valid" CHECK ("contract_parties"."role" in ('LANDLORD', 'TENANT', 'GUARANTOR', 'SELLER', 'BUYER'));