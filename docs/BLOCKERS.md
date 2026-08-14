# Blockers externos

Nenhum no bootstrap.

O agente deve registrar aqui apenas dependências externas reais: credenciais, App Review, conta de teste, homologação, contrato de portal, sandbox indisponível etc. Não registrar dúvidas de arquitetura que ele próprio possa resolver.

## Fase 03 — IMPLEMENTED_NOT_LIVE_VERIFIED

- `GoogleMapsGeocodingAdapter` (REST) implementado com contrato zod, timeout e mock determinístico (`GeocodingMockService` em dev/test; `null` em produção sem chave). Sem credencial real de homologação → não validado contra a API Google live.
- `S3StorageAdapter.getPresignedPutUrl` (presigned PUT SigV4 via `@aws-sdk/s3-request-presigner`) implementado e testado com assinatura local; upload real contra Cloudflare R2 não verificado (sem credenciais/bucket de homologação).

## Fase 04 — IMPLEMENTED_NOT_LIVE_VERIFIED

- `IListingChannelAdapter` implementado com `FakeChannel` de referência (dev/test). Canais reais (Canal Pro/VivaReal/ZAP/OLX/Imovelweb) registrados SEM adapter — sem contrato oficial acessível, nenhum endpoint é inventado (docs/INTEGRATIONS.md). A implementação real de cada portal exige documentação oficial/contratual antes de qualquer chamada.

## Fase 04 — Dívidas registradas (pós-review)

- **LGPD — leads de canal sem consentimento registrado**: `importLeads` (worker) cria party+lead sem gravar `party_consents` (purpose `CHANNEL_LEAD_CONTACT`). O consentimento de leads provenientes de portais deve ser registrado na fase de Screening (Fase 07) antes de qualquer uso além de contato inicial.
- **Retry automático de jobs**: FAILED volta elegível quando `run_at` vence (attempts < 5); acima disso exige re-enfileiramento manual via API. Sem dead-letter queue (jobs FAILED com attempts ≥ 5 ficam visíveis no painel com last_error).

## Fase 05 — IMPLEMENTED_NOT_LIVE_VERIFIED

- `MetaWhatsAppAdapter` (Cloud API REST) implementado com zod, timeout 10s e verify token; sem credencial real de homologação → não validado contra a Meta live (`META_MODE=dry_run` usa FakeWhatsAppMessenger).
- `AiProvider` com `MockAiProvider` (regras determinísticas); adapters OpenAI/Gemini reais adiados (registry é o gancho; sem chave nunca chama LLM externo).
- Assinatura `X-Hub-Signature-256` validada quando `META_APP_SECRET` presente; sem secret, a segurança vem do verify token trocado na assinatura do webhook (documentado em INTEGRATIONS.md).

## Fase 06 — IMPLEMENTED_NOT_LIVE_VERIFIED

- `MockInspectionAiProvider` (transcrição/sugestões determinísticas por regras) é o padrão; adapters reais de transcrição/visão (LLM) exigem chave e devem obedecer o contrato de payload com EVIDÊNCIA OBSERVÁVEL apenas (nunca causa/diagnóstico) — nota em docs/AI_STRATEGY.md. Sem credencial → mock, nunca LLM externo.
- Assinatura de vistoria (SIGNED) reservada: transição existe na máquina, rota rejeita com 400 até a Fase 07. PDF de relatório adiado para a fase de relatórios (10) — endpoint de snapshot estruturado disponível.

## Fase 07 — IMPLEMENTED_NOT_LIVE_VERIFIED

- `IScreeningProvider` com `FakeScreeningProvider` determinístico; Serasa/SPC reais registrados SEM adapter (sem documentação/credencial acessível — job falha com "provider não configurado", nunca inventa endpoints).
- `ISignatureProvider` com `FakeSignatureProvider`; Clicksign/D4Sign reais sem token/doc → 400 "assinatura não configurada" (produção NUNCA assina fake). Webhook de assinatura aceita payload mínimo (sem validação HMAC — `SIGNATURE_WEBHOOK_TOKEN` reservado para quando o provider real documentar).
- Decisões de crédito são AUTOMÁTICAS por regras determinísticas (threshold `SCREENING_APPROVE_SCORE_MIN` default 700, rastreio em `decision_rules`); revisão humana obrigatória em casos inconclusivos (MANUAL_REVIEW com motivo).


## Fase 08 - IMPLEMENTED_NOT_LIVE_VERIFIED

- IPaymentProvider com FakePaymentProvider deterministico (dev/test); Asaas real registrado SEM adapter (sem documentacao/credencial acessivel - rotas respondem 400 Pagamento nao configurado e worker nunca confirma pagamento fake em producao). Webhook /webhooks/payments aceita payload minimo sem validacao HMAC (ASAAS_WEBHOOK_TOKEN reservado para quando o provider real documentar).
- Ledger dupla entrada via postLedgerTransaction (balance = 0, DEBIT positivo / CREDIT negativo, idempotente por UNIQUE transaction+account); contas CASH/AR_RECEIVABLE/AGENCY_FEE_REVENUE/LANDLORD_PAYABLE criadas por org sob demanda.
- Split deterministico: comissao da agencia (default 10%) nunca excede o valor pago; payout PENDING criado para o landlord, execucao de transferencia real adiada (sem credencial bancaria).
