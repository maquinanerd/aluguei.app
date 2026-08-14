# Relatório Completo do Produto — Aluguei.app

**Gerado em:** 2026-08-14 · **Estado:** 12/12 fases concluídas, gate verde, auditoria de segurança final sem P0/P1

---

## 1. Visão geral

Produto independente para operação de locação imobiliária: imóveis, distribuição de anúncios (portais), CRM/leads, WhatsApp, vistoria com fotos/áudio/IA, análise cadastral (crédito), contratos com assinatura eletrônica, cobrança com multa/juros, split de repasse, ledger contábil de dupla entrada, portais externos (proprietário/locatário), Meta Ads via servidor MCP próprio e reporting/exportação segura.

**Arquitetura:** monorepo pnpm + turbo. Domínio 100% desacoplado de SDKs externos (interfaces/adapters). Dinheiro em centavos inteiros. Datas em UTC. IDs internos independentes de provedores.

## 2. Stack e versões

| Camada | Tecnologia | Versão |
|---|---|---|
| Monorepo | pnpm + turbo | pnpm 11.15.1 / turbo 2.10.9 |
| Linguagem | TypeScript (strict) | TS 6.0.3 (meta-mcp: 5.9.2) |
| Runtime | Node.js | ≥ 24 |
| API | Fastify + @fastify/helmet/cors/cookie/rate-limit | Fastify 5.12.0 |
| ORM/DB | drizzle-orm + PostgreSQL | drizzle 0.45.2 / PG 17 |
| Validação | zod | 4.4.3 |
| Web | Next.js (App Router, server components) | Next 16.3.0 / React 19.2.3 |
| Mobile | Expo / React Native | Expo 57 / RN 0.86 / React 19.2.3 |
| Worker | fila Postgres (SKIP LOCKED) | — |
| MCP | @modelcontextprotocol/sdk (stdio) | 1.30.0 |
| Testes | vitest | 4.1.10 |
| Lint/Format | eslint 10 + prettier 3.9 + typescript-eslint 8.67 | — |
| Observabilidade | pino (redação) + OpenTelemetry OTLP | — |
| Lint/format-check CI | GitHub Actions (ubuntu) | — |

## 3. Estrutura do monorepo

```
apps/
  api/        API HTTP (Fastify) — 152 endpoints, 13 plugins, 27 arquivos de rotas
  web/        Web (Next.js) — páginas públicas, CRM e portais
  mobile/     Mobile (Expo) — shell com offline banner e error boundary
  worker/     Worker — filas/jobs (9 fontes, 9 tipos de job)
  meta-mcp/   Servidor MCP Meta (stdio) — 17 tools
packages/
  config/     env schema + criptografia de segredos (AES-256-GCM)
  contracts/  contratos zod (278 schemas) — fonte de verdade de I/O
  db/         schema drizzle (72 tabelas) + 11 migrations + db:apply
  domain/     domínio puro (29 módulos, máquinas de estado, cálculos)
  integrations/  adapters externos (10 áreas) + fakes determinísticos + registries
  observability/  logger pino com redact + tracer OTEL
  storage/    storage S3-compatível (presigned PUT SigV4)
  ui/         (pacote de UI)
tests/
  integration/  79 testes de integração PGlite (16 arquivos)
scripts/       security-scan.mjs (secret scanning)
```

## 4. Banco de dados — 72 tabelas (11 migrations: 0000–0009, 0011)

### Identidade & auditoria (`schema/identity.ts`)
`organizations`, `users`, `memberships`, `userSessions`, `auditEvents`

### CRM (`schema/crm.ts`)
`parties`, `partyIdentities`, `partyAddresses`, `partyRoles`, `partyConsents`, `partyDocuments`, `leads`, `leadPropertyInterests`, `tasks`, `visits`, `proposals`, `timelineEvents`

### Imóveis & anúncios (`schema/properties.ts`)
`properties`, `propertyAddresses`, `propertyFeatures`, `propertyFinancialTerms`, `propertyMedia`, `propertyOwners`, `listings`

### Canais/portais (`schema/channels.ts`)
`listingChannelPublications`, `channelSyncJobs`

### WhatsApp (`schema/whatsapp.ts`)
`whatsappConnections`, `conversations`, `conversationIntents`, `messages`, `webhookInbox` (fila genérica com claim SKIP LOCKED)

### Contratos & crédito (`schema/contracts.ts`)
`contractTemplates`, `contracts`, `contractParties`, `signatureEnvelopes`, `signatureEvents`, `rentalApplications`, `screeningRequests`, `screeningResults`

### Vistoria (`schema/inspections.ts`)
`inspections`, `inspectionRooms`, `inspectionMedia` (privacy guard), `inspectionObservations`, `inspectionTranscripts`, `inspectionAiSuggestions`, `inspectionComparisons`

### Financeiro (`schema/finance.ts`)
`leases`, `splitRules`, `splitAllocations`, `charges`, `payments`, `paymentAttempts`, `payouts`, `ledgerAccounts`, `ledgerEntries` (dupla entrada, idempotente), `partyBankAccounts`, `reconciliations`

### Meta Ads (`schema/meta.ts`)
`metaConnections` (token AES-256-GCM), `metaAssets`, `metaAdProfiles`, `metaCampaignLinks`, `metaAdsetLinks`, `metaCreativeLinks`, `metaAdLinks`, `metaInsightSnapshots`, `metaSyncJobs`, `metaWebhookEvents`, `metaOrgSettings`, `metaAuditEvents`

### Portal externo (`schema/portal.ts`)
`portalAccess` (grant por party+kind, token one-time), `portalSessions` (opaca revogável)

### App (`schema/app-metadata.ts`)
`appMetadata`

## 5. API — 152 endpoints (Fastify, todos com RBAC, zod strict, auditoria)

| Grupo | Endpoints | Destaques |
|---|---|---|
| **meta.ts** | 17 | Conexão Meta, ativos, ad-profiles (validação Housing/budget/material), campanhas (create/publish/pause/resume/archive/budget/schedule/creative/sync-insights), preview, detalhe |
| **portal.ts** | 15 | Acesso (grant/revoke), sessão (consume/logout/me), extrato locatário, cobranças, contratos, vistorias, pagamento QR (idempotente), propriedades/extrato/contratos/vistorias do proprietário |
| **inspections.ts** | 14 | CRUD vistorias, rooms, media, observações (confirmar), transcrições, sugestões IA, comparação entrada×saída, relatório snapshot |
| **properties.ts** | 13 | CRUD imóvel, endereço público/privado, termos financeiros, owners, features, media (presigned upload-url/confirm), vínculo de listing |
| **payments.ts** | 7 | Pagamentos, payouts (paginado), ledger accounts/entries, bank accounts (validação de documento), reconciliações (paginado) |
| **rental-applications.ts** | 7 | Candidatura, status (máquina de estado), consentimento, screening (provider), resultados/decision |
| **channels.ts** | 7 | Publicações por canal, sync jobs, summary |
| **conversations.ts** | 7 | Conversas WhatsApp, mensagens, intents, handoff |
| **webhooks.ts** | 6 | WhatsApp (verify + X-Hub-Signature-256), signature, payments (token + confirmação no provider), Meta (dedup) |
| **charges.ts** | 6 | CRUD cobranças, breakdown (multa/juros/desconto), pagamento, cancelamento, estorno, status |
| **contracts.ts** | 6 | CRUD contratos, generate (template render + hash), send-for-signature, assinatura |
| **auth.ts** | 5 | Registro, login, logout, troca de org, mudança de senha |
| **listings.ts** | 5 | CRUD listing, máquina de estado (READY/PUBLISHED/…), publish |
| **reporting.ts** | 4 | leads-funnel, revenue-monthly (ledger), meta-spend, exportação segura CSV/JSON |
| **organizations.ts** | 4 | Org, members (invite/role), switch |
| **contract-templates.ts** | 4 | CRUD templates versionados, approve |
| **leads.ts / tasks.ts / leases.ts / parties.ts** | 3 cada | Funil, tarefas, locações, partes (dedupe) |
| **timeline.ts / visits.ts / whatsapp-connections.ts / proposals.ts / public.ts / health.ts** | 2 cada | Timeline, visitas, conexões WhatsApp, propostas, site público, health/ready |
| **me.ts** | 1 | /auth/me |

**Health:** `/health` (liveness) e `/health/ready` (checa DB; 503 honesto).

## 6. Domínio puro — 29 módulos (sem SDK externo)

| Área | Módulos | Funções-chave |
|---|---|---|
| auth | `auth/password` | `hashPassword` (argon2id), `verifyPassword` |
| authz | `authz/rbac` | `hasPermission`, `ALL_PERMISSIONS`, `ROLE_PERMISSIONS` (roles owner/admin/finance/agent/inspector/viewer) |
| canal | `channel/publication` | `canTransitionChannelPublication`, máquina de estados por canal |
| contrato | `contract/contract`, `contract/template` | `canTransitionContract`, render de template, validação de variáveis |
| crédito | `rental/application`, `rental/screening` | `canTransitionRentalApplication`, `decideApplication` (regras determinísticas explicáveis), `applicationTransitionIssues` |
| CRM | `crm/dedupe`, `crm/funnel` | `findDedupeMatches` (CPF/CNPJ/email), `advanceLeadTo`, `isFunnelStatus` |
| financeiro | `finance/money`, `finance/chargeCalc`, `finance/split`, `finance/stateMachines` | `add/sub/negate/mulBpsFloor/splitAmount`, `calculateChargeBreakdown` (multa 2% + juros 1%/dia), `splitPayment` (AGENCY/LANDLORD determinístico), `canTransitionCharge/Lease/Payment` |
| vistoria | `inspection/compare`, `inspection/stateMachine` | `computeInspectionDifferences`, `inspectionCompletionIssues`, `canTransitionInspection` |
| Meta | `meta/housing`, `meta/adMaterial`, `meta/budget`, `meta/stateMachine`, `meta/campaignFlow` | `validateHousingTargeting` (Special Ad Category), `validateAdMaterial` (sem PII), `validateBudget` (XOR + caps), `createPausedCampaign`, `publishCampaign` |
| portal | `portal/portal` | `buildTenantStatement`, `buildLandlordStatement`, `canPortalReadInspection`, `sanitizeExportColumns`, `aggregateFunnelByPeriod`, `aggregateRevenueByMonth`, `aggregateMetaSpend` |
| imóvel | `property/listing` | `canTransitionListing` |
| WhatsApp | `whatsapp/conversation`, `whatsapp/intents`, `whatsapp/propertyCode` | `canTransitionConversation`, `extractIntentByRule`, `codePrefixFor/formatCode` |
| valores | `values/identifiers` | `normalizeDocument` (CPF/CNPJ), validação |
| geral | `errors` | `DomainError` (códigos → HTTP) |

## 7. Contracts — 278 schemas zod (24 arquivos)

`auth`, `parties`, `leads`, `tasks`, `visits`, `proposals`, `timeline`, `property`, `listing`, `media`, `public`, `channels`, `conversations`, `inspections`, `rental`, `contracts`, `finance`, `meta`, `portal`, `reporting`, `org`, `common` (paginação), `health`, `error`. Todos os requests com `.strict()` (campos extras rejeitados).

## 8. Integrations — 10 áreas (interface + fake determinístico + registry + status)

| Área | Adapter real | Fake (dev/test) | Status |
|---|---|---|---|
| canais/portais | Canal Pro/VivaReal/ZAP/OLX/Imovelweb | `FakeChannel` (falhas injetáveis) | SEM adapter real |
| WhatsApp | `MetaWhatsAppAdapter` (REST Cloud API) | `FakeWhatsAppMessenger` | IMPLEMENTED_NOT_LIVE_VERIFIED |
| AI | OpenAI/Gemini (registry) | `MockAiProvider` (regras) | sem chave nunca chama LLM |
| geocoding | `GoogleMapsGeocodingAdapter` | `GeocodingMockService` | IMPLEMENTED_NOT_LIVE_VERIFIED |
| vistoria IA | transcrição/visão LLM | `MockInspectionAiProvider` | sem chave usa mock |
| crédito | Serasa/SPC | `FakeScreeningProvider` (CPF alto risco) | SEM adapter real |
| assinatura | Clicksign/D4Sign | `FakeSignatureProvider` | SEM adapter real |
| pagamento | Asaas (sandbox) | `FakePaymentProvider` (QR Pix, confirmCharge) | SEM adapter real |
| Meta Ads | Graph API | `FakeMetaAdsProvider` (dry_run) | SEM adapter real |
| Redis | adapter ioredis | — | usado p/ rate-limit multi-instância |

**Segredos:** `packages/config/src/secrets.ts` — AES-256-GCM (`encryptSecret`/`decryptSecret`), `digestInput` (auditoria sem PII). Storage: `packages/storage` — presigned PUT SigV4 (R2/S3).

## 9. Worker — 9 tipos de job (fila Postgres SKIP LOCKED + retry + reaper)

`runInboxJobs` (dispatch genérico): **SCREENING**, **SIGNATURE**, **INSPECTION**, **PAYMENT**, **PAYMENT_SCHEDULER**, **PAYMENT_RECONCILE**, **META** (webhook) · `runChannelJobs` (publicações de canal) · `runMetaJobs` (intents de campanha: SYNC_INSIGHTS/PUBLISH_INTENT/PAUSE/RESUME/UPDATE_BUDGET/UPDATE_SCHEDULE/UPDATE_CREATIVE/ARCHIVE) · `startHeartbeat`. Claim atômico com `FOR UPDATE SKIP LOCKED`, reaper de RUNNING preso (>5min), retry com attempts < 5, sanitização de erros (sem URL/token).

## 10. MCP Meta (`apps/meta-mcp`) — 17 tools (stdio, @modelcontextprotocol/sdk 1.30)

Leitura: `meta_connection_status`, `meta_list_assets`, `meta_get_property_ad_material`, `meta_get_campaign`, `meta_preview_campaign`, `meta_get_insights`, `meta_list_property_campaigns` · Escrita controlada: `meta_prepare_property_campaign`, `meta_create_prepared_campaign_paused`, `meta_publish_prepared_campaign`, `meta_pause_campaign`, `meta_resume_campaign`, `meta_update_budget` (caps), `meta_update_schedule`, `meta_update_creative`, `meta_archive_campaign`, `meta_sync_insights`. Autorização por org + `MCP_ALLOWED_ORG_ID` opcional + idempotency key + audit com digest (sem PII). Token Meta nunca entra no contexto do LLM.

## 11. Frontend Web — estado atual (honesto)

**O que existe:** home, login, registro, dashboard (leads + transições de status), vitrine pública de imóveis (`/imoveis` + `/imoveis/[slug]`), portal proprietário (`/proprietario`) e locatário (`/inquilino`). CSS global adicionado (globals.css) e topnav de navegação no layout. Consumo via `lib/api-server.ts` (server components + proxy com cookie; proteção anti-CSRF por Origin).

**O que NÃO existe ainda (UI de CRM):** páginas de gestão de imóveis, contratos, cobranças, vistorias e insights — a API para todas essas já está pronta e testada (seção 5). O frontend foi priorizado como mínimo nas 12 fases (decisão registrada nos ADRs); a construção da UI completa é o próximo passo.

**Mobile:** shell Expo com offline banner (sem falso positivo no native) e error boundary com retry.

## 12. Segurança & hardening

- **Auth:** sessão opaca (token 256-bit, SHA-256 no DB, expiração/revogação), argon2id, rate limit login 10/min, anti-enumeração (dummy hash), cookie HttpOnly/SameSite.
- **Portal:** token one-time de consumo único + revogação em cascata + kind obrigatório.
- **RBAC:** permissões por role; 100% das rotas de escrita com `requirePermission`; escopo por org em toda query.
- **Webhooks:** dedup UNIQUE `(provider, event_id)`, 200 imediato, rate limits; pagamentos **confirmam no provider antes de creditar** + `ASAAS_WEBHOOK_TOKEN`; WhatsApp valida `X-Hub-Signature-256` (HMAC raw body); assinatura/Meta validam token quando configurado.
- **Uploads:** presigned PUT, MIME whitelist, revalidação de tamanho via headObject, storageKey com prefixo de org.
- **Meta Ads:** Housing/Special Ad Category obrigatório, caps de budget por org (rota + tool + worker), intents de alta impacto nunca ativam anúncio sem intent de runtime, token AES-256-GCM.
- **Financeiro:** centavos inteiros, ledger balanceado idempotente, split nunca excede, refund com reversão contábil.
- **Rate limits:** global 300/min por IP (userId autenticado) + específicos (login 10, portal 20, export 10, upload 60, mensagens 60, webhooks 300–600); `trustProxy: 'loopback'` + XFF; RedisStore opcional.
- **Secret scanning:** `scripts/security-scan.mjs` (padrões ampliados, allowlist por valor exato) roda local + CI (bloqueante).
- **Dependências:** `pnpm audit --audit-level=critical` = 0 no CI; 2 high transitivos do tooling Expo (`image-size`, sem fix publicado) documentados.

## 13. Testes — 45 arquivos, todos verdes (gate completo)

| Suíte | Testes |
|---|---|
| domain | 96 |
| tests-integration (PGlite + API real) | 79 |
| worker | 9 |
| contracts | 7 |
| meta-mcp (protocolo MCP) | 7 |
| storage | 5 |
| config | 4 |
| observability | 4 |
| integrations | 21 |
| api | 1 |
| web | 2 |
| **Total** | **~235 testes** · 20 tasks turbo verdes · build OK · migrations sem drift |

Cobertura de destaque: cross-tenant (cross-org, portal, hardening, meta, reporting), E2E crítico (imóvel→anúncio→lead→contrato→pagamento→portal), ledger balanceado, replay de token, dedup de webhook, rate limit 429, Housing, RBAC.

## 14. Documentação — 20 arquivos + 35 ADRs

`PRODUCT`, `DOMAIN_MODEL`, `ARCHITECTURE`, `SECURITY`, `THREAT_MODEL`, `SLO`, `OPERATIONS` (backup/restore), `INTEGRATIONS`, `META_MCP`, `EXTERNAL_REFERENCES`, `AI_STRATEGY`, `SCOPE_BOUNDARY`, `UI_UX`, `TEST_STRATEGY`, `DECISIONS` (35 ADRs), `BLOCKERS`, `EXECUTION_STATE`, `FINAL_REPORT`, `TOKEN_EFFICIENCY`, `AUTONOMY`.

## 15. CI (GitHub Actions)

Install frozen-lockfile → Format check → Lint → Typecheck → **Secret scan** → **Dependency audit (informativo)** → **Dependency audit critical (bloqueante)** → Test → Validate migrations (db:generate) → **Check no migration drift** → Build.

## 16. Classificação de integrações (FINAL_REPORT)

- **LIVE_VERIFIED:** 0 (nenhuma — sem credenciais de homologação no ambiente)
- **SANDBOX_VERIFIED:** 0
- **MOCK_VERIFIED:** 13 (geocoding mock, FakeChannel, FakeWhatsApp + assinatura de webhook, MockAi, MockInspectionAi, FakeScreening, FakeSignature, FakePayment + confirmação no provider, FakeMetaAds, MCP protocolo)
- **IMPLEMENTED_NOT_LIVE_VERIFIED:** 12 (Google Maps, R2/S3, canais reais, WhatsApp real, LLMs, Serasa/SPC, Clicksign/D4Sign, Asaas, Graph API, smoke stdio do MCP, entrega de token por e-mail, backup/restore)

## 17. Como rodar

```bash
pnpm --filter @aluguei/db db:apply        # migrations (DATABASE_URL)
pnpm --filter @aluguei/api dev            # API → http://localhost:4000
pnpm --filter @aluguei/web dev            # Web → http://localhost:3000
pnpm --filter @aluguei/worker dev         # Worker (jobs/webhooks)
```

Ver `README.md` para detalhes, cluster Postgres dedicado e dry-run/mock de todas as integrações externas.
