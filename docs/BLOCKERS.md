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
