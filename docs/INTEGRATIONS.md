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

## Assinatura

`ISignatureProvider`: baseline Clicksign, alternativa D4Sign. Webhook idempotente, hash do documento e trilha de eventos.

## Pagamento

`IPaymentProvider`: baseline Asaas em sandbox. Suportar criação de cobrança, status, cancelamento/estorno quando disponível, split e payout/reconciliação.

## Meta Marketing

Detalhado em `docs/META_MCP.md`.
