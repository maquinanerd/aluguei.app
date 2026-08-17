# Integration Readiness Matrix — Aluguei.app

> Gerado em 2026-08-17. Base: leitura de código + execução local + BLOCKERS.md. Nenhuma credencial existe no ambiente (sem `.env`; apenas `.env.example` na raiz).
> Status: LIVE_VERIFIED · SANDBOX_VERIFIED · MOCK_VERIFIED · IMPLEMENTED_NOT_LIVE_VERIFIED · PARTIAL · BLOCKED · NOT_IMPLEMENTED

## Resumo executivo

| INTEGRAÇÃO                                        | CÓDIGO        | FRONTEND                  | ADAPTER            | MOCK TESTADO                                                        | SANDBOX | LIVE | CREDENCIAL | WEBHOOK                                    | STATUS                        | O QUE FALTA                                                                  |
| ------------------------------------------------- | ------------- | ------------------------- | ------------------ | ------------------------------------------------------------------- | ------- | ---- | ---------- | ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------- |
| WhatsApp (Meta Cloud API)                         | ✅            | ✅ inbox/integrations     | ✅ Meta REST real  | ✅ (conversa+intent+handoff via HTTP)                               | ❌      | ❌   | ❌         | ✅ com assinatura condicional              | IMPLEMENTED_NOT_LIVE_VERIFIED | credencial sandbox; exigir secret em prod; status de conexão real; templates |
| Google Maps (Geocoding)                           | ✅            | ❌ sem uso                | ✅ google + mock   | ✅ (3+3 unit)                                                       | ❌      | ❌   | ❌         | —                                          | IMPLEMENTED_NOT_LIVE_VERIFIED | consumidor no cadastro; Places Autocomplete; credencial                      |
| Meta Ads                                          | ✅            | ✅ marketing/integrations | ❌ (só fake)       | ✅ (profile PREPARED+Housing via HTTP; campanha/intents in-process) | ❌      | ❌   | ❌         | ✅ (sem HMAC — gap)                        | MOCK_ONLY                     | adapter Graph API real; HMAC no webhook; homologação                         |
| Serasa                                            | ❌ adapter    | ✅ screening UI           | ❌                 | ✅ (screening FAKE → APPROVED via HTTP)                             | ❌      | ❌   | ❌         | —                                          | MOCK_ONLY                     | adapter real + credencial + homologação                                      |
| SPC                                               | ❌ adapter    | ✅                        | ❌                 | ✅                                                                  | ❌      | ❌   | ❌         | —                                          | MOCK_ONLY                     | idem                                                                         |
| Clicksign                                         | ❌ adapter    | ✅ contracts UI           | ❌ (só fake)       | ✅ (envelope → SIGNED via HTTP)                                     | ❌      | ❌   | ❌         | ✅ (sem token/HMAC — gap)                  | MOCK_ONLY                     | adapter real; validação webhook; cancel/void                                 |
| D4Sign                                            | ❌ adapter    | ✅                        | ❌                 | ✅                                                                  | ❌      | ❌   | ❌         | —                                          | MOCK_ONLY                     | idem                                                                         |
| Asaas                                             | ❌ adapter    | ✅ charges/payments UI    | ❌ (só fake)       | ✅ (PIX QR via HTTP; PAID in-process)                               | ❌      | ❌   | ❌         | ✅ (token opcional + confirma no provider) | MOCK_ONLY                     | adapter real; cancel/refund no provider; homologação                         |
| Portais (canalpro, vivareal, zap, olx, imovelweb) | ❌ adapters   | ✅ channels UI            | ❌ (só canal fake) | ✅ (publish→PUBLISHED no banco via HTTP)                            | ❌      | ❌   | ❌         | —                                          | MOCK_ONLY                     | adapters/feeds reais; consentimento LGPD em import de leads                  |
| IA do produto                                     | ✅ interfaces | ✅ (indireto)             | ❌ (só mock)       | ✅ (intent, transcrição, sugestões — via HTTP)                      | ❌      | ❌   | ❌         | —                                          | MOCK_ONLY                     | adapter real (OpenAI/Gemini) se desejado; política de PII                    |
| Storage (S3/R2)                                   | ✅            | ✅ (upload mídia)         | ✅ AWS SDK v3      | ✅ (fake via HTTP; S3 unit 5)                                       | ❌      | ❌   | ❌         | —                                          | IMPLEMENTED_NOT_LIVE_VERIFIED | bucket/credenciais; upload real                                              |

## Detalhe por integração

### WhatsApp

- Interface `WhatsAppMessenger`; adapters: `MetaWhatsAppAdapter` (REST Graph v25.0 — default atualizado na auditoria de 17/08/2026 —, timeout 10s, `sendTemplateMessage`, `testConnection`, erro tipado `WhatsAppProviderError`) e `FakeWhatsAppMessenger`.
- Registry: live+creds → Meta; live sem creds → null (nunca fake em prod); dry_run → fake.
- Webhook: GET verify token; POST X-Hub-Signature-256 (exigido **somente** com `META_APP_SECRET` — gap para prod).
- HTTP provado: verify 403 inválido; POST 200 → worker → conversa (2 msgs), intenção, handoff.
- Faltam: credenciais/WABA/número, templates aprovados, validação real do status de conexão (ver `docs/integrations/WHATSAPP_HOMOLOGATION.md`).

### Google Maps

- `GeocodingService`: `GoogleMapsGeocodingAdapter` + `GeocodingMockService` (testes 3+3).
- Plugin `app.geocoding` registrado; **nenhuma rota consome**.
- Autocomplete/Places: não implementado.
- Faltam: consumidor + credencial.

### Meta Ads

- `IMetaAdsProvider` + `FakeMetaAdsProvider`; adapter Graph real **não existe** (registrado sem implementação até doc oficial).
- Token criptografado AES-256-GCM em repouso (`META_TOKEN_ENCRYPTION_KEY`); MCP nunca vê token.
- Housing: `specialAdCategories=['HOUSING']`, validação de geos/budget/material no domínio.
- Pipeline HTTP provado: conexão FAKE, assets (4), ad profile PREPARED (Housing) — exige listing READY/PUBLISHED; campanha/intents/insights provados in-process (meta.test.ts 7).
- Webhook POST sem validação de assinatura (gap).
- MCP: 17 tools stdio (7 read, 10 write; escritas = intents idempotentes + auditoria; `MCP_ALLOWED_ORG_ID`).
- Faltam: adapter real, HMAC webhook, credenciais, smoke stdio com Meta real.

### Crédito (Serasa/SPC)

- `IScreeningProvider` + `FakeScreeningProvider` (score determinístico por CPF; red flags configuráveis).
- Adapters reais **não existem** (registry retorna null para SERASA/SPC → job falha "provider não configurado").
- LGPD: consentimento `CREDIT_SCREENING` obrigatório (rota rejeita sem).
- Regras determinísticas no worker com threshold (`SCREENING_APPROVE_SCORE_MIN`), decisão APPROVE/REJECT/MANUAL_REVIEW + auditoria + lead LOST.
- HTTP provado: consent → submit → screening → APPROVED.
- Faltam: adapters + credenciais + homologação + `SCREENING_PROVIDER` no zod env.

### Assinatura (Clicksign/D4Sign)

- `ISignatureProvider` + `FakeSignatureProvider` (envelope determinístico; status em memória).
- Adapters reais **não existem**.
- HTTP provado: envelope FAKE → SIGNER_SIGNED×2 → COMPLETED → contrato SIGNED (ordem importa; out-of-order deixa PARTIALLY_SIGNED, recuperável).
- Webhook: dedup por evento; **sem validação HMAC/token** (`SIGNATURE_WEBHOOK_TOKEN` no schema mas não usado).
- Faltam: adapters, validação webhook, cancel/void, polling de status.

### Pagamentos (Asaas)

- `IPaymentProvider` + `FakePaymentProvider` (PIX QR sintético, status transicionável).
- Adapter Asaas **não existe** (registry: ASAAS+key → null → 400 "não configurado").
- HTTP provado: charge R$3000 → payment PIX (QR BR Code) → webhook aceito.
- **Anti-forjamento provado**: worker SEMPRE confirma `getChargeStatus` antes de creditar; com fake por-processo, webhook forjado NÃO credita ("Pagamento não confirmado no provider (status PENDING)"). Crédito completo (PAID→ledger balanceado→split→payout) provado in-process (finance.test.ts).
- Faltam: adapter real, cancel/refund no provider, `PAYMENT_PROVIDER` no zod env.

### Portais imobiliários

- `IListingChannelAdapter` + `FakeChannel`; tipos registrados sem adapter: `canalpro`, `vivareal`, `zap`, `olx`, `imovelweb`.
- Fila Postgres + worker (retry 5x, reaper) — HTTP provado: publish fake → `PUBLISHED` no banco.
- Import leads: cria party+identity; **sem consentimento LGPD** (gap declarado).
- Faltam: contratos/docs oficiais, adapters, consentimento.

### IA runtime do produto

- `AiProvider` (extractIntent) → só `MockAiProvider` (regras pt-BR, extractedBy=RULE).
- `InspectionAiProvider` → só `MockInspectionAiProvider` (transcrição por hash; sugestões fixas por ambiente).
- Sem adapters reais (OpenAI/Gemini registrados como gancho futuro; nunca chamados).
- HTTP provado: intenção na conversa WhatsApp; sugestão PENDING → ACCEPT na vistoria.

### Storage

- `StorageService` + `S3StorageAdapter` (AWS SDK v3, presign SigV4) — unit tests 5.
- HTTP: sem credenciais → 400 "Storage não configurado"; com fake injetado → upload-url/confirm 200/201.
- Faltam: bucket real, credenciais, upload real.

## Env vars (todas NÃO preenchidas; nenhum `.env` real existe)

| PROVIDER        | ENV VARS                                                                                                                                                                                        | PREENCHIDAS       | FORMATO | NECESSÁRIA DEV                 | NECESSÁRIA HOMOLOGAÇÃO | STATUS                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- | ------------------------------ | ---------------------- | --------------------------------------- |
| Runtime         | NODE_ENV, LOG_LEVEL, API_HOST, API_PORT, APP_BASE_URL, API_BASE_URL, CORS_ORIGINS, SESSION_TTL_SECONDS, COOKIE_SECURE                                                                           | NÃO (defaults ok) | válido  | NÃO                            | SIM (COOKIE_SECURE)    | OK p/ dev                               |
| DB              | DATABASE_URL, REDIS_URL                                                                                                                                                                         | NÃO               | válido  | SIM (para rodar fora de teste) | SIM                    | OK p/ dev local                         |
| Google          | GOOGLE_MAPS_API_KEY                                                                                                                                                                             | NÃO               | válido  | NÃO                            | SIM                    | FALTA + consumidor                      |
| Meta            | META_APP_ID/SECRET, META_GRAPH_API_VERSION, META_OAUTH_REDIRECT_URI, META_WEBHOOK_VERIFY_TOKEN, META_MODE, META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_TOKEN_ENCRYPTION_KEY, MCP_ALLOWED_ORG_ID | NÃO               | válido  | NÃO (dry_run)                  | SIM                    | FALTA (e adapter real)                  |
| WhatsApp        | WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_ACCESS_TOKEN, META_APP_SECRET                                                                                                  | NÃO               | válido  | NÃO (fake)                     | SIM                    | FALTA                                   |
| Crédito         | SERASA_CLIENT_ID/SECRET, SPC_CLIENT_ID/SECRET, SCREENING_APPROVE_SCORE_MIN, SCREENING_PROVIDER*                                                                                                 | NÃO               | válido  | NÃO (FAKE)                     | SIM                    | FALTA (+adapters; *fora do zod)         |
| Assinatura      | CLICKSIGN_API_TOKEN, D4SIGN_API_TOKEN, SIGNATURE_WEBHOOK_TOKEN*                                                                                                                                 | NÃO               | válido  | NÃO (FAKE injetado)            | SIM                    | FALTA (+adapters; *não usado no código) |
| Pagamentos      | ASAAS_API_KEY, ASAAS_ENV, ASAAS_WEBHOOK_TOKEN, PAYMENT_PROVIDER*                                                                                                                                | NÃO               | válido  | NÃO (FAKE)                     | SIM                    | FALTA (+adapter; *fora do zod)          |
| IA              | AI_PROVIDER, OPENAI_API_KEY, GEMINI_API_KEY                                                                                                                                                     | NÃO               | válido  | NÃO (mock)                     | NÃO obrigatório        | MOCK_ONLY                               |
| Storage         | STORAGE_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY                                                                                                                                  | NÃO               | válido  | NÃO (fake injetado)            | SIM                    | FALTA                                   |
| Observabilidade | OTEL_EXPORTER_OTLP_ENDPOINT, SENTRY_DSN                                                                                                                                                         | NÃO               | válido  | NÃO                            | SIM                    | FALTA                                   |

## Classificação final

- Nenhuma integração LIVE_VERIFIED ou SANDBOX_VERIFIED.
- IMPLEMENTED_NOT_LIVE_VERIFIED (código real pronto, sem homologação): WhatsApp, Google Geocoding, Storage S3.
- MOCK_ONLY (sem adapter real): Meta Ads, Serasa, SPC, Clicksign, D4Sign, Asaas, Portais, IA do produto.
- BLOCKED: nada está tecnicamente bloqueado — a ordem de desbloqueio recomendada: Storage → Asaas → WhatsApp → Clicksign/D4Sign → Serasa/SPC → Meta Ads → Portais → Google.
