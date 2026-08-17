# Integration Status — Aluguei.app

> Gerado em 2026-08-17 após o ciclo de production readiness. Nenhum efeito externo real foi executado. `LIVE_VERIFIED` nunca é declarado sem prova.

## Matriz

| PROVIDER                     | ADAPTER                                                           | FAKE                   | UNIT   | INTEGRATION                                | SANDBOX | LIVE | WEBHOOK                                                             | SECURITY                                                                                                   | STATUS                                                                          | BLOCKER                                                                                       |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------- | ------ | ------------------------------------------ | ------- | ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Storage S3/R2                | ✅ S3StorageAdapter (presign PUT+GET, HEAD, limits)               | ✅ FakeStorageService  | ✅ 8   | ✅ via HTTP (fake)                         | ❌      | ❌   | —                                                                   | presign SigV4; path por org; bucket privado                                                                | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | bucket/credenciais (R2 ou MinIO)                                                              |
| Asaas (pagamentos)           | ✅ AsaasPaymentProvider (v3)                                      | ✅ FakePaymentProvider | ✅ 25  | ✅ PIX QR via HTTP (fake)                  | ❌      | ❌   | ✅ (asaas-access-token/asaas-webhook-token + confirma no provider)  | token opcional + confirmação anti-forjamento                                                               | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | API key sandbox (`$aact_hmlg_*`)                                                              |
| WhatsApp (Meta Cloud API)    | ✅ MetaWhatsAppAdapter (v25.0, templates, testConnection)         | ✅ Fake                | ✅ 17  | ✅ conversa/intent/handoff via HTTP        | ❌      | ❌   | ✅ verify token + X-Hub-Signature-256                               | HMAC obrigatório em prod (META_APP_SECRET)                                                                 | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | WABA + número + token permanente + templates                                                  |
| Assinatura (Clicksign)       | ✅ ClicksignSignatureProvider (v3 JSON:API)                       | ✅ Fake                | ✅ 14  | ✅ envelope→SIGNED via HTTP (fake)         | ❌      | ❌   | ✅ (Bearer SIGNATURE_WEBHOOK_TOKEN; HMAC Content-Hmac da Clicksign) | token obrigatório em prod                                                                                  | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | conta sandbox + token; requisito de autenticação por signatário na interface (gap)            |
| Crédito (Serasa/SPC)         | ⚠️ esqueleto Serasa (valida config; falha tipada)                 | ✅ Fake                | ✅ 7   | ✅ screening FAKE→APPROVED                 | ❌      | ❌   | —                                                                   | consentimento LGPD obrigatório; domínio decide                                                             | BLOCKED_PROVIDER_CONTRACT                                                       | contrato "Score e Atributos via API" + layout + credenciais IAM                               |
| Meta Ads (Graph API)         | ✅ MetaGraphAdsProvider (v25.0, HOUSING)                          | ✅ Fake                | ✅ 23  | ✅ pipeline intents/MCP via HTTP (fake)    | ❌      | ❌   | ✅ verify token + X-Hub-Signature-256                               | token criptografado AES-256-GCM; nunca ACTIVE direto; Housing obrigatório                                  | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | app + ad account + system user token (ads_management) + image_hash/page resolvers no pipeline |
| Google Maps (Geocoding)      | ✅ GoogleMapsGeocodingAdapter                                     | ✅ mock                | ✅ 6   | ✅ consumidor no PUT address (best-effort) | ❌      | ❌   | —                                                                   | —                                                                                                          | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | GOOGLE_MAPS_API_KEY                                                                           |
| Google Places (Autocomplete) | ✅ GooglePlacesAdapter                                            | ✅ mock                | ✅ 12  | ✅ rotas /places/* + UI AddressSearch      | ❌      | ❌   | —                                                                   | chave restrita; fallback manual obrigatório                                                                | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | chave + billing                                                                               |
| Portais imobiliários         | ❌ (só FakeChannel)                                               | ✅ FakeChannel         | ✅ 5+7 | ✅ publish→PUBLISHED (fake)                | ❌      | ❌   | —                                                                   | consentimento LEAD_IMPORT no import                                                                        | UNAVAILABLE_WITHOUT_CONTRACT (ZAP/Viva/ImovelWeb/CanalPro); API_AVAILABLE (OLX) | contrato/credencial por portal                                                                |
| IA runtime (OpenAI/Gemini)   | ✅ OpenAiAiProvider, GeminiAiProvider, OpenAiInspectionAiProvider | ✅ mock                | ✅ 38  | ✅ regras/fallback                         | ❌      | ❌   | —                                                                   | fallback determinístico em qualquer falha; PII fora do prompt quando possível                              | IMPLEMENTED_NOT_LIVE_VERIFIED                                                   | OPENAI_API_KEY / GEMINI_API_KEY                                                               |
| Webhooks (todos)             | —                                                                 | —                      | —      | ✅ 14 testes de segurança                  | —       | —    | —                                                                   | ✅ WhatsApp/Meta HMAC; Signature Bearer; Asaas token; todos constant-time; dedup UNIQUE; prod exige secret | MOCK_VERIFIED                                                                   | —                                                                                             |

## Legenda

- **IMPLEMENTED_NOT_LIVE_VERIFIED**: código real pronto, testado com mock/injeção; credencial externa pendente.
- **BLOCKED_PROVIDER_CONTRACT**: implementação depende de contrato comercial/layout não público (Serasa).
- **UNAVAILABLE_WITHOUT_CONTRACT**: sem API pública (ZAP/Viva Real/ImovelWeb/CanalPro); **API_AVAILABLE**: OLX Imóveis (REST pública) — adapter a criar quando houver conta/homologação.
- **MOCK_VERIFIED**: pipeline verificado com fakes (webhooks, canais, meta pipeline).

## Observabilidade

- Logs estruturados (pino) em API/worker; request-id do Fastify; job ids nas filas Postgres.
- Health: `/health` (liveness) e `/health/ready` (DB check).
- OTEL (`OTEL_EXPORTER_OTLP_ENDPOINT`) e Sentry (`SENTRY_DSN`) configuráveis no env schema; exportadores reais não habilitados (sem credenciais).
- Auditoria: `audit_events` para ações sensíveis (assinatura, screening, meta, pagamentos).

## O que falta por provider (credenciais/contas)

1. Storage: bucket R2/MinIO + credenciais.
2. Asaas: API key sandbox `$aact_hmlg_*` + webhook token.
3. WhatsApp: WABA + número verificado + token permanente + `META_APP_SECRET` + templates.
4. Clicksign: conta sandbox + access token (+ webhook HMAC secret).
5. Serasa/SPC: contrato comercial + layout + credenciais IAM.
6. Meta Ads: app + ad account (test) + system user token + page_id.
7. Google: API key (Maps+Places) com billing.
8. OLX Imóveis: conta anunciante + OAuth (publicação paga).
