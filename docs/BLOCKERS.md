# Blockers externos

Nenhum no bootstrap.

O agente deve registrar aqui apenas dependências externas reais: credenciais, App Review, conta de teste, homologação, contrato de portal, sandbox indisponível etc. Não registrar dúvidas de arquitetura que ele próprio possa resolver.

## Fase 03 — IMPLEMENTED_NOT_LIVE_VERIFIED

- `GoogleMapsGeocodingAdapter` (REST) implementado com contrato zod, timeout e mock determinístico (`GeocodingMockService` em dev/test; `null` em produção sem chave). Sem credencial real de homologação → não validado contra a API Google live.
- `S3StorageAdapter.getPresignedPutUrl` (presigned PUT SigV4 via `@aws-sdk/s3-request-presigner`) implementado e testado com assinatura local; upload real contra Cloudflare R2 não verificado (sem credenciais/bucket de homologação).
