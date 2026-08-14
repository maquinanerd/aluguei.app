# Integrações externas

## Regra para todos os providers

Cada integração possui interface local, adapter, configuração tipada, testes por contrato/fixture e estado de reconciliação. SDKs externos não vazam para o domínio.

## Google

Uso: autocomplete/endereço, geocoding, mapa e validação de endereço quando contratado.

## WhatsApp / Meta

Uso: mensagens, webhooks, templates, identificação do lead/imóvel e atendimento inicial.

Implementação (Fase 05): `WhatsAppMessenger` em `packages/integrations/src/whatsapp/` com `MetaWhatsAppAdapter` (REST Cloud API, IMPLEMENTED_NOT_LIVE_VERIFIED) e `FakeWhatsAppMessenger` (dev/test determinístico). Webhook `POST /webhooks/whatsapp` valida verify token → deduplica por `wa_message_id` → enfileira em `webhook_inbox` → responde 200; worker processa via `runInboxJobs`. Assinatura `X-Hub-Signature-256` validada quando `META_APP_SECRET` presente; sem secret, a segurança vem do verify token trocado na assinatura (não enviar body sensível no webhook). O bot responde APENAS com dados persistidos (termos financeiros/endereço público do imóvel); nunca inventa preço/disponibilidade. `AiProvider` (extração de intenção) usa mock por padrão; LLM real exige chave e nunca recebe PII além do texto da mensagem. Resolução de org do webhook via `whatsapp_connections` (phone_number_id). Nota: `FakeWhatsAppMessenger` mantém store em memória por processo — em dev, API e worker não compartilham outbox (relevante só para o canal fake).

## Portais imobiliários

Criar `IListingChannelAdapter` com operações conceituais:

- validate
- publish
- update
- remove
- reconcile
- importLeads quando suportado

Cada canal pode usar REST, XML/feed, SFTP, webhook ou outra modalidade contratada. O agente DEVE pesquisar a documentação oficial/contratual vigente antes de implementar chamadas reais. Se não houver acesso, entregar adapter e fixtures sem inventar endpoint.

Implementação concreta (Fase 04): interface em `packages/integrations/src/channels/types.ts`, `FakeChannel` de referência (dev/test, determinístico, falhas injetáveis) em `channels/fake.ts`, registry em `channels/registry.ts` (canais reais — canalpro/vivareal/zap/olx/imovelweb — registrados SEM adapter: rotas respondem 404 "canal não configurado"). Jobs enfileirados em `channel_sync_jobs` (idempotency_key UNIQUE) e processados pelo worker com claim atômico no Postgres (ADR-010). Estado desejado por (listing, canal) em `listing_channel_publications`. Contrato de idempotência obrigatório: `channelListingId` determinístico por (channel, externalId); remove de item inexistente resolve com sucesso. Nota: o FakeChannel mantém store em memória por processo — em dev, API e worker não compartilham estado (relevante só para o canal fake).

## Crédito/identidade

`IScreeningProvider` e adapters Serasa/SPC/outros. Consentimento e finalidade registrados antes da consulta.

Implementação concreta (Fase 07): interface em `packages/integrations/src/screening/types.ts`, `FakeScreeningProvider` determinístico (CPF de alto risco injetável) em `screening/fake.ts`, registry em `screening/registry.ts`. Adapters reais Serasa/SPC registrados SEM adapter (sem credencial/doc validados — rotas respondem 400 "screening não configurado"; IMPLEMENTED_NOT_LIVE_VERIFIED). Consentimento LGPD obrigatório antes da consulta (`party_consents` + finalidade CREDIT_SCREENING); regras determinísticas em `packages/domain/src/screening/`.

## Assinatura

`ISignatureProvider`: baseline Clicksign, alternativa D4Sign. Webhook idempotente, hash do documento e trilha de eventos.

Implementação concreta (Fase 07): interface em `packages/integrations/src/signature/types.ts`, `FakeSignatureProvider` determinístico em `signature/fake.ts`, registry em `signature/registry.ts`. Clicksign/D4Sign registrados SEM adapter (IMPLEMENTED_NOT_LIVE_VERIFIED). Templates versionados + render com hash do documento (`contracts.contentHash`); webhook `POST /webhooks/signature` deduplica por `(provider, provider_event_id)` e enfileira em `webhook_inbox` (provider SIGNATURE); worker atualiza envelope/contrato.

## Pagamento

`IPaymentProvider`: baseline Asaas em sandbox. Suportar criação de cobrança, status, cancelamento/estorno quando disponível, split e payout/reconciliação.

Implementação concreta (Fase 08): interface em `packages/integrations/src/payments/types.ts`, `FakePaymentProvider` determinístico (chargeId por hash, QR Pix sintético) em `payments/fake.ts`, registry em `payments/registry.ts`. Asaas registrado SEM adapter (rotas 400 "pagamento não configurado"; IMPLEMENTED_NOT_LIVE_VERIFIED). Cobranças com multa/juros/desconto determinísticos, ledger dupla entrada balanceado, split AGENCY/LANDLORD e payout PENDING. Webhook `POST /webhooks/payments` (PAYMENT_CONFIRMED/REFUNDED/FAILED/OVERDUE) via `webhook_inbox`.

## Meta Marketing

Detalhado em `docs/META_MCP.md`.

Implementação concreta (Fase 09): `IMetaAdsProvider` em `packages/integrations/src/meta-ads/` com `FakeMetaAdsProvider` determinístico (dry_run) e Graph API real registrado SEM adapter (IMPLEMENTED_NOT_LIVE_VERIFIED). Token por conexão criptografado AES-256-GCM (ADR-028). Servidor MCP `apps/meta-mcp` (stdio) com 17 tools — ver `docs/META_MCP.md`.
