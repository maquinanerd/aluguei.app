# Aluguei.app — Functional Status Audit

> Auditoria funcional completa executada em 2026-08-17 por auditor independente.
> Metodologia: leitura de código, contagem mecânica, execução real (PostgreSQL 17 local, migrations do zero, API Fastify + worker + Next.js rodando de verdade, chamadas HTTP reais) e gates frescos.
> Nenhum código foi alterado. Nenhum efeito externo real foi produzido (tudo fake/dry-run/local).

## 1. Resumo executivo

O Aluguei.app está **funcionalmente completo no núcleo operacional** (CRM, imóveis, listagens, screening, contratos, vistorias, locações, financeiro, portais, Meta Ads dry-run, WhatsApp fake) e **verificável localmente sem credenciais externas** usando providers fake/mock injetáveis. Nenhuma integração externa está LIVE_VERIFIED — todas são IMPLEMENTED_NOT_LIVE_VERIFIED (adapter real existe: WhatsApp, Google Geocoding, Storage S3) ou MOCK_ONLY (Meta Ads, Crédito, Assinatura, Pagamentos, Portais — sem adapter real).

Achados novos desta auditoria (não constavam em relatórios anteriores):

1. **BUG REAL reproduzido**: `POST /properties/:id/owners` retorna 400 `createdAt: Invalid input: expected string, received Date` quando o imóvel possui mídia, contra PostgreSQL real (drizzle retorna `Date`, zod espera string; PGlite mascara o problema e por isso os testes passam). Reproduzido 2x via HTTP.
2. **GATE VERMELHO**: `pnpm format:check` falha com 142 arquivos fora do padrão (contradiz `docs/EXECUTION_STATE.md` que registrava "format green").
3. **GATE AMARELO**: `pnpm security:audit` (audit --prod) sai com código 1: 2 vulnerabilidades high (`image-size` DoS — cadeia dev do Expo/mobile).
4. **Contrato estrito**: `POST /meta/ad-profiles/:id/create-campaign` exige `idempotencyKey` no corpo (documentado no contrato, mas fácil de errar; frontend não chama essa rota — o caminho do produto é via MCP).
5. **Resiliência de ordem**: webhooks de assinatura fora de ordem (COMPLETED antes de SIGNER_SIGNED) deixam o contrato em PARTIALLY_SIGNED; recuperável reenviando COMPLETED. Comportamento idempotente, mas ordem-dependente.
6. **Ponta a ponta do pagamento**: o crédito "PAID" exige provider com estado compartilhado. Com fake por-processo (API e worker separados), o worker recusa creditar (prova do anti-forjamento funcionando — "Pagamento não confirmado no provider (status PENDING)"). O fluxo completo só é verificável in-process (testes de integração) ou com provider real (Asaas). Isso é esperado, não é defeito.
7. Migração `0010` ausente na sequência de 11 migrations (pula de 0009 para 0011) — cosmético.
8. `SCREENING_PROVIDER`/`PAYMENT_PROVIDER` são lidos via `process.env` no worker e estão fora do schema zod de env.
9. Geocoding do Google está implementado (adapter + mock + testes) mas **não tem consumidor** — nenhuma rota chama `app.geocoding`.
10. Contratos de portais imobiliários: 5 tipos nomeados (canalpro, vivareal, zap, olx, imovelweb) sem adapter; só o canal `fake` funciona.

## 2. O que funciona hoje

Provado por execução local real (PostgreSQL 17, migrations do zero, HTTP):

- Registro/login/logout/sessão cookie, `/auth/me`, troca de organização, RBAC por permissão, isolamento cross-org (404/403) — via HTTP.
- CRUD completo: parties (com dedupe), propriedades (endereço, termos financeiros, owners*, características, mídia via presigned+fake storage), listings (máquina DRAFT→READY→PUBLISHED com guarda de termos+endereço), leads, tarefas, visitas, propostas, timeline.
- Site público `/imoveis` renderizando anúncio publicado real (título, cidade, preço) via API.
- Canal fake: publish → fila Postgres → worker → `PUBLISHED` no banco.
- Screening: consentimento LGPD → candidatura → screening FAKE → worker → APPROVED (regras determinísticas, auditoria).
- Contratos: template versionado + aprovação → contrato → generate (variáveis preenchidas, hash) → envelope FAKE → webhooks de assinatura → worker → SIGNED.
- Locações (criada ACTIVE a partir de contrato SIGNED), cobrança com aluguel (R$3000), pagamento PIX com QR code (provider fake), webhook de pagamento aceito, reconciliação → MATCHED.
- Portais: grant TENANT → token one-time → sessão opaca → `/portal/me`, extrato (billed/paid/open), cobranças, contratos com content.
- WhatsApp: conexão, webhook (verify token), mensagem → conversa criada pelo worker, resposta do bot, intenção extraída (IA mock/RULE), handoff.
- Meta Ads dry-run: conexão FAKE, assets, ad profile PREPARED com `specialAdCategories=["HOUSING"]`, intents (publish/pause) via fila, insights snapshot (spend em centavos). (Criação de campanha exige `idempotencyKey` no corpo; ciclo completo provado in-process por `tests/integration/meta.test.ts`.)
- Vistorias: ambientes, foto/áudio, CAPTURING→PROCESSING→REVIEW (worker gera transcrição + sugestões mock), confirmação humana ACCEPT, COMPLETED, relatório snapshot, comparação entrada×saída (201 COMPLETED, `differences[]`).
- Reporting: leads-funnel, revenue-monthly, meta-spend (HTTP 200).
- Health: `/health` e `/health/ready` 200.
- Rate limits (login 10/min → 429; observado em execução), body limit 1MB, security headers.

*Ressalva: `POST /properties/:id/owners` tem o bug do item 1 (400 com mídia no Postgres real).

## 3. O que funciona parcialmente

- **Pagamento ponta a ponta (PAID)** — funciona in-process (testes); em processo real separado (API+worker) o fake não compartilha estado → não credita (correto, mas só homologável com Asaas).
- **Webhooks signature e Meta POST** — processam e têm idempotência, mas **não validam assinatura/token HMAC** (gap de segurança declarado).
- **Assinatura** — provider FAKE só quando injetado (dev/test). O processo `index.ts` padrão não injeta FAKE automaticamente → `send-for-signature` retorna 400 "assinatura não configurada" sem credencial (comportamento seguro e correto, mas impede journey local sem launcher custom).
- **Google Geocoding** — adapter pronto e testado, sem consumidor.
- **`/imoveis`** — exige `PUBLIC_ORG_SLUG` para exibir anúncios (sem env → página vazia, sem erro).

## 4. O que funciona apenas com mock

- WhatsApp (FakeWhatsAppMessenger) — MOCK_VERIFIED.
- Meta Ads (FakeMetaAdsProvider) — MOCK_VERIFIED (pipeline API/MCP/worker/intents/Housing).
- Crédito Serasa/SPC (FakeScreeningProvider + regras determinísticas) — MOCK_VERIFIED.
- Assinatura (FakeSignatureProvider) — MOCK_VERIFIED.
- Pagamentos (FakePaymentProvider) — MOCK_VERIFIED (in-process).
- Portais imobiliários (FakeChannel) — MOCK_VERIFIED.
- IA do produto (MockAiProvider, MockInspectionAiProvider) — MOCK_VERIFIED (transcrição e sugestões de vistoria determinísticas; extração de intenção por regras).
- Storage presign — verificado com fake em HTTP e com S3 adapter em testes unitários (IMPLEMENTED_NOT_LIVE_VERIFIED).

## 5. O que depende de credencial

| Provider                  | O que falta                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| WhatsApp (Meta Cloud API) | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET` (obrigatório em prod p/ assinatura do webhook) |
| Google Maps               | `GOOGLE_MAPS_API_KEY` + consumidor na rota de imóvel + Places Autocomplete (não implementado)                         |
| Meta Ads                  | adapter Graph API real (versão + scopes + Special Ad Category) — **código não existe ainda**                          |
| Serasa/SPC                | adapters reais — **código não existe**                                                                                |
| Clicksign/D4Sign          | adapters reais — **código não existe**                                                                                |
| Asaas                     | adapter real — **código não existe**                                                                                  |
| Storage S3/R2             | `STORAGE_*` (bucket/credenciais)                                                                                      |
| IA real (OpenAI/Gemini)   | adapters reais — **código não existe** (registry sempre retorna mock)                                                 |

## 6. O que depende de homologação

Tudo que está IMPLEMENTED_NOT_LIVE_VERIFIED: WhatsApp real, Google Geocoding, Storage S3 (assinatura local testada), Meta Ads, Crédito, Assinatura, Pagamentos, Portais. Nenhuma integração foi exercitada contra ambiente sandbox/live de provider.

## 7. O que não está implementado

- Adapter real: Meta Ads, Serasa, SPC, Clicksign, D4Sign, Asaas, portais imobiliários (5 tipos nomeados), IA real (OpenAI/Gemini/DeepSeek).
- Places Autocomplete do Google.
- Templates de WhatsApp (envio de mensagens estruturadas).
- Cancel/void de envelope de assinatura; chamadas de cancel/refund no provider de pagamento (só transição local).
- Validação HMAC/token nos webhooks signature e Meta POST.
- Testes E2E (Playwright) e testes de contrato — diretórios são placeholders.
- Mobile: só shell (Home + offline banner + error boundary); zero consumo de API.
- Consumidor do geocoding no cadastro de imóvel.

## 8. Cadastros

| MÓDULO                          | CRIAR                        | LISTAR            | DETALHE          | EDITAR                                           | EXCLUIR/CANCELAR                           | FRONTEND                       | API                                                 | BANCO                                      | TESTE               | STATUS                                             |
| ------------------------------- | ---------------------------- | ----------------- | ---------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------ | --------------------------------------------------- | ------------------------------------------ | ------------------- | -------------------------------------------------- |
| Usuários                        | WORKING                      | —                 | —                | —                                                | —                                          | /register                      | POST /auth/register                                 | users                                      | PASS                | WORKING                                            |
| Organizações                    | WORKING (via register)       | —                 | via /auth/me     | —                                                | —                                          | —                              | —                                                   | organizations                              | PASS                | WORKING                                            |
| Membros                         | WORKING                      | WORKING           | —                | WORKING (role)                                   | WORKING                                    | /app/admin/members             | POST/GET/PATCH/DELETE /organizations/:orgId/members | memberships                                | PASS                | WORKING                                            |
| Proprietários (parties)         | WORKING                      | WORKING           | via lista        | WORKING (identities/dedupe)                      | — (domínio: partes são históricas)         | /app/crm/contacts              | POST/GET /parties                                   | parties                                    | PASS                | WORKING                                            |
| Locatários (parties)            | WORKING                      | WORKING           | via lista        | WORKING                                          | —                                          | /app/crm/contacts              | POST/GET /parties                                   | parties                                    | PASS                | WORKING                                            |
| Contatos (dedupe)               | WORKING                      | WORKING           | WORKING          | WORKING                                          | —                                          | /app/crm/contacts              | POST /parties/dedupe                                | parties+identities                         | PASS                | WORKING                                            |
| Leads                           | WORKING                      | WORKING           | WORKING          | WORKING (funnel)                                 | — (LOST exige motivo)                      | /app/crm/leads[/id]            | POST/GET/PATCH /leads                               | leads                                      | PASS                | WORKING                                            |
| Imóveis                         | WORKING                      | WORKING           | WORKING          | WORKING                                          | WORKING (DELETE /properties/:id via front) | /app/properties[/new           | id]                                                 | POST/GET/PATCH/DELETE /properties          | properties+6        | PASS                                               | WORKING |
| Características                 | WORKING                      | via detalhe       | via detalhe      | —                                                | WORKING                                    | /app/properties/[id]           | POST/DELETE /properties/:id/features                | propertyFeatures                           | PASS                | WORKING                                            |
| Fotos/Mídia                     | WORKING (presign+confirm)    | via detalhe       | via detalhe      | —                                                | WORKING                                    | /app/properties/[id]           | POST upload-url/confirm, DELETE media               | propertyMedia                              | PASS (fake storage) | WORKING*                                           |
| Anúncios (listings)             | WORKING                      | WORKING           | WORKING          | WORKING (status)                                 | WORKING (máquina)                          | /app/listings                  | POST/GET/PATCH /listings                            | listings                                   | PASS                | WORKING                                            |
| Canais                          | WORKING (fake)               | WORKING (summary) | WORKING          | —                                                | WORKING (remove job)                       | /app/channels                  | POST publish/update/remove, GET summary             | listingChannelPublications+channelSyncJobs | PASS                | MOCK_ONLY (fake) / NOT_IMPLEMENTED (portais reais) |
| Visitas                         | WORKING                      | WORKING           | via lista        | —                                                | —                                          | /app/visits, /app/crm/calendar | POST/GET /visits                                    | visits                                     | PASS                | WORKING                                            |
| Propostas                       | WORKING                      | WORKING           | via lista        | —                                                | —                                          | /app/proposals                 | POST/GET /proposals                                 | proposals                                  | PASS                | WORKING                                            |
| Candidaturas                    | WORKING                      | WORKING           | WORKING          | WORKING (status)                                 | —                                          | /app/screening[/id]            | POST/GET/PATCH /rental-applications                 | rentalApplications                         | PASS                | WORKING                                            |
| Screening                       | WORKING (FAKE)               | via candidatura   | via candidatura  | —                                                | —                                          | /app/screening/[id]            | POST /rental-applications/:id/screening             | screeningRequests+Results                  | PASS                | MOCK_ONLY                                          |
| Contratos                       | WORKING                      | WORKING           | WORKING          | WORKING (status)                                 | — (VOID pós GENERATED)                     | /app/contracts[/id]            | POST/GET/PATCH /contracts                           | contracts                                  | PASS                | WORKING                                            |
| Templates de contrato           | WORKING                      | WORKING           | via lista        | WORKING (versões)                                | —                                          | /app/contract-templates        | POST/GET/PATCH approve                              | contractTemplates                          | PASS                | WORKING                                            |
| Assinantes (partes do contrato) | WORKING (via contrato)       | via contrato      | via contrato     | —                                                | —                                          | /app/contracts/[id]            | —                                                   | contractParties                            | PASS                | WORKING                                            |
| Vistorias                       | WORKING                      | WORKING           | WORKING          | WORKING (status)                                 | —                                          | /app/inspections[/id]          | POST/GET/PATCH /inspections                         | inspections                                | PASS                | WORKING                                            |
| Ambientes                       | WORKING                      | via detalhe       | via detalhe      | —                                                | —                                          | /app/inspections/[id]          | POST /inspections/:id/rooms                         | inspectionRooms                            | PASS                | WORKING                                            |
| Ocorrências                     | WORKING                      | via review        | via review       | WORKING (status sugestão)                        | —                                          | /app/inspections/[id]          | POST observations, PATCH ai-suggestions             | inspectionObservations+AiSuggestions       | PASS                | WORKING                                            |
| Locações                        | WORKING                      | WORKING           | WORKING          | WORKING (máquina)                                | —                                          | /app/leases[/id]               | POST/GET /leases                                    | leases                                     | PASS                | WORKING                                            |
| Cobranças                       | WORKING                      | WORKING           | WORKING          | WORKING (cancel/refund local)                    | WORKING (cancel)                           | /app/charges                   | POST/GET /charges                                   | charges                                    | PASS                | WORKING                                            |
| Pagamentos                      | WORKING (fake)               | WORKING           | via cobrança     | —                                                | —                                          | /app/payments                  | POST /charges/:id/payment, GET /payments            | payments                                   | PASS (in-process)   | MOCK_ONLY                                          |
| Splits                          | WORKING (determinístico)     | via ledger        | via ledger       | —                                                | —                                          | /app/ledger                    | —                                                   | splitRules+splitAllocations                | PASS                | WORKING                                            |
| Repasses (payouts)              | WORKING (PENDING gerado)     | WORKING           | via lista        | —                                                | —                                          | /app/payouts                   | GET /payouts                                        | payouts                                    | PASS (in-process)   | WORKING                                            |
| Contas financeiras              | WORKING                      | via ledger        | via ledger       | —                                                | —                                          | /app/ledger                    | GET /ledger/accounts                                | ledgerAccounts                             | PASS                | WORKING                                            |
| Conciliações                    | WORKING                      | WORKING           | via lista        | —                                                | —                                          | /app/reconciliation            | POST/GET /reconciliations                           | reconciliations                            | PASS                | WORKING                                            |
| Meta Connections                | WORKING (FAKE/dry_run)       | WORKING           | WORKING (assets) | —                                                | —                                          | /app/admin/integrations        | POST/GET /meta/connections                          | metaConnections                            | PASS                | MOCK_ONLY                                          |
| Meta Campaigns                  | WORKING (fake+intents)       | WORKING           | WORKING          | WORKING (publish/pause/budget/schedule/creative) | WORKING (archive)                          | /app/marketing                 | POST/GET /meta/campaigns                            | metaCampaigns+Links                        | PASS (in-process)   | MOCK_ONLY                                          |
| Integrações (admin)             | WORKING (conexões fake)      | WORKING           | —                | —                                                | —                                          | /app/admin/integrations        | GET /whatsapp/connections, /meta/connections        | whatsappConnections                        | PASS                | MOCK_ONLY                                          |
| Configurações                   | PARTIAL (perfil/memberships) | WORKING           | —                | —                                                | —                                          | /app/settings                  | GET /me/memberships                                 | —                                          | PASS                | PARTIAL                                            |

*Mídia de imóvel: exige storage configurado (400 sem credenciais; fake via injeção funciona).

## 9. CRUD matrix

Ver `docs/audit/CRUD_MATRIX.md`.

## 10. Frontend

Ver `docs/audit/CRUD_MATRIX.md` (tabela de rotas) e resumo aqui:

- **43 rotas reais** em `apps/web` (38 auditadas + landing, /dashboard, /imoveis, /imoveis/[slug], /dev/calibration). Todas as 38 rotas pedidas existem.
- Públicas respondem 200: `/`, `/login`, `/register`, `/imoveis` (com `PUBLIC_ORG_SLUG`), `/dev/calibration`.
- Protegidas respondem 307→/login sem sessão: `/app`, `/app/*`, `/dashboard`, `/proprietario`, `/inquilino`.
- Com sessão real, `/app`, `/app/properties`, `/app/crm/leads`, `/app/finance`, `/app/marketing`, `/dashboard` renderizam 200 (Next.js 16.3, HTML servido).
- **Nenhuma página de produto usa dados estáticos** — todas consultam a API via BFF `/api/backend/*` (proxy) ou `apiFetch` server-side. Única exceção: `/dev/calibration` (catálogo de componentes, dev-only).
- Estados de loading/erro/permissionDenied presentes em todas as telas (useQuery + ErrorState + PermissionDenied + toast).
- Mobile (Expo): 1 tela (Home), offline banner, error boundary; **zero consumo de API**.

## 11. Backend/API

- **152 endpoints** (GET 66 · POST 68 · PATCH 11 · PUT 2 · DELETE 5) em `apps/api/src/routes/*` (27 arquivos).
- Auth: 13 públicos · 8 só sessão · 11 portal (2 RBAC + 9 sessão portal) · 120 RBAC.
- 267 schemas Zod exportados em `packages/contracts`.
- 14 módulos de domínio, 12 máquinas de estado (Charge, Lease, Payment, AdProfile, Campaign, Inspection, RentalApplication, Contract, Lead funnel, Listing, ChannelPublication, Conversation).
- 72 tabelas, 11 migrations aplicadas do zero em PostgreSQL 17 real (gap: numeração pula 0010).
- Matriz completa de endpoints ↔ consumidores: ver `docs/audit/API_CONNECTION_MATRIX.md`.

## 12. Frontend ↔ API

Todas as telas auditadas estão **CONNECTED** (dados reais via BFF). Tabela completa tela → função → endpoint em `docs/audit/API_CONNECTION_MATRIX.md`. Nenhuma tela com FAKE_DATA (exceto /dev/calibration). Providers fake vivem no servidor (injeção), nunca hardcoded no frontend.

## 13. Banco

PostgreSQL via drizzle. 72 tabelas confirmadas no banco real. Migrations idempotentes (`db:apply` re-executado sem erro). Filas de jobs em tabelas (SKIP LOCKED), sessões opacas (hash), token Meta criptografado AES-256-GCM em repouso.

## 14. Login/Auth/RBAC — WORKING

Provado via HTTP: register (201 + cookie), login (200), logout (200 + sessão 401 depois), /auth/me (200), troca de org, cross-org bloqueado (404/403), rate limit login 10/min (429). RBAC por permissão (`requirePermission`) em 120 endpoints; portal com sessão própria (`aluguei_portal`). Status: **WORKING**.

## 15. CRM — WORKING

Lead → QUALIFYING → tarefa → visita → proposta → timeline: tudo via HTTP (201/200) + funnel testado (domain 6 testes) + crm.flow.test.ts (5) frescos. Visitas/calendário consomem API real.

## 16. Imóveis — WORKING (com 1 bug)

Criar, editar, endereço, termos financeiros, características, mídia (presign+confirm), listing READY→PUBLISHED (guarda: exige termos+endereço), site público renderizando anúncio real — tudo via HTTP.
**Bug**: vincular proprietário (`POST /properties/:id/owners`) → 400 no Postgres real quando o imóvel tem mídia (Date vs string no DTO). Geocoding não é chamado (sem consumidor).

## 17. Portais — MOCK_ONLY (fake)

Canal `fake` publica/atualiza/remove/reconcilia/importa leads via fila+worker (PUBLISHED no banco real). `canalpro`, `vivareal`, `zap`, `olx`, `imovelweb` registrados **sem adapter** (nenhum feed/API). Import de leads sem consentimento LGPD — gap declarado.

## 18. WhatsApp — MOCK_VERIFIED

Webhook com verify token (403 inválido) e X-Hub-Signature-256 (obrigatório apenas com `META_APP_SECRET`), dedup por provider_event_id, conexão, conversa criada pelo worker, resposta do bot, intenção (RULE/mock), handoff — tudo via HTTP. Adapter Meta real existe (não homologado). Templates: não implementado. Conexão: status não validado contra a Meta.

## 19. Google Maps — IMPLEMENTED_NOT_LIVE_VERIFIED, sem consumidor

Adapters (google + mock) com testes (3+3). Plugin registrado. **Nenhuma rota chama geocoding**. Autocomplete não implementado. Credencial ausente.

## 20. Crédito Serasa/SPC — MOCK_ONLY

Interface + FakeScreeningProvider (score determinístico) + regras determinísticas + consentimento LGPD obrigatório + auditoria. Adapters reais não existem. Credenciais ausentes. Sem sandbox/live.

## 21. Contratos — WORKING

Template versionado → aprovação (imutável) → contrato → generate (variáveis preenchidas, hash sha256) → envelope FAKE → webhooks de assinatura → SIGNED. Validação estrita do template (todas as variáveis devem ser usadas — erro claro). Via HTTP completo.

## 22. Assinaturas — MOCK_VERIFIED (FAKE injetado)

Envelope, signer order, PARTIALLY_SIGNED, SIGNED, webhook com dedup. Sem HMAC/token no webhook; sem cancel/void; sem polling de status do provider. Adapters Clicksign/D4Sign não existem.

## 23. Vistorias + IA — WORKING (IA = mock)

Via HTTP: ambientes, foto+áudio (presign+confirm), CAPTURING→PROCESSING→REVIEW (worker: transcrição mock + sugestões mock), confirmação humana ACCEPT (guarda exige), COMPLETED, relatório snapshot (rooms/observations/aiSuggestions/transcripts/mediaCounts), comparação entrada×saída (201, `differences[]`). IA real: não existe adapter.

## 24. Locações — WORKING

Contrato SIGNED → lease criada ACTIVE → cobranças derivadas dos termos (R$3000). Máquinas de estado guardadas (transições inválidas retornam 409 INVALID_TRANSITION com detalhes).

## 25. Pagamentos/Asaas — MOCK_VERIFIED (fake)

PIX QR (payload BR Code), webhook aceito, worker confirma no provider antes de creditar (anti-forjamento provado), cancel/refund só transição local (não chamam provider). Adapter Asaas não existe.

## 26. Split/Ledger/Repasse — WORKING (in-process)

Prova fresca: `tests/integration/finance.test.ts` — "fluxo R$1000 com comissão 10%: lease→charge→payment→webhook→ledger balanceado→payout" PASS (DÉBITO=CRÉDITO, payout PENDING). Em HTTP com processos separados o fake não compartilha estado (limitação do fake, não defeito). Conciliação MATCHED via HTTP.

## 27. Meta Ads — MOCK_VERIFIED

Conexão (token criptografado em repouso, nunca no contexto de IA), assets, ad profile com HOUSING, campanhas criadas PAUSADAS (nunca ACTIVE direto), intents de alta prioridade via fila (worker → ACTIVE/PAUSED), insights em snapshots (spend em centavos), RBAC meta:read/meta:write, auditoria de tool calls. Adapter Graph real não existe.

## 28. MCP — 17 tools (stdio)

7 leitura (connection_status, list_assets, get_property_ad_material, get_campaign, preview_campaign, get_insights, list_property_campaigns) + 10 escrita (prepare_property_campaign direto; create_prepared_campaign_paused; publish/pause/resume/update_budget/update_schedule/update_creative/archive/sync_insights = intents). Escritas idempotentes e auditadas; restrição `MCP_ALLOWED_ORG_ID`; stdio test (7) PASS fresco. Dry-run verificado nos testes.

## 29. Workers — RODA LOCALMENTE

`apps/worker` roda de verdade (poll 5s): channelJobs (PUBLISH/UPDATE/REMOVE/RECONCILE/IMPORT_LEADS), inboxJobs (WHATSAPP, SIGNATURE, PAYMENT, PAYMENT_SCHEDULER, PAYMENT_RECONCILE, META, INSPECTION, SCREENING), metaJobs (intents). Retry com backoff (3–5x), reaper de RUNNING, claim SKIP LOCKED, heartbeat. Evidência: jobs processados para todos os providers no banco real.

## 30. Webhooks

| Path                        | Provider   | Assinatura                                                            | Idempotência                        | STATUS                                  |
| --------------------------- | ---------- | --------------------------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| GET/POST /webhooks/whatsapp | Meta       | verify token; X-Hub-Signature-256 (se META_APP_SECRET)                | UNIQUE(provider, provider_event_id) | MOCK_VERIFIED (gap: secret condicional) |
| POST /webhooks/signature    | Assinatura | **nenhuma** (gap)                                                     | UNIQUE                              | MOCK_VERIFIED                           |
| POST /webhooks/payments     | Asaas      | header asaas-webhook-token (se configurado) + confirmação no provider | UNIQUE                              | MOCK_VERIFIED (anti-forjamento provado) |
| GET/POST /webhooks/meta     | Meta Ads   | verify token GET; **POST sem assinatura** (gap)                       | UNIQUE                              | MOCK_VERIFIED                           |

## 31. Integrações

Ver `docs/audit/INTEGRATION_READINESS_MATRIX.md`.

## 32. Credenciais necessárias

Nenhuma credencial está preenchida (não existe `.env`; só `.env.example` na raiz com todas as variáveis). Tabela por provider em `docs/audit/INTEGRATION_READINESS_MATRIX.md`.

## 33. Jornada completa

Ver `docs/audit/END_TO_END_JOURNEY.md` — 46 passos HTTP executados (35 PASS diretos; restantes por payload/limitações documentadas) + E2E crítico in-process PASS fresco.

## 34. Testes/gates

| Gate                                      | Resultado                                                                                                               | Exit |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- |
| `pnpm format:check`                       | **FAIL** — 142 arquivos                                                                                                 | 1    |
| `pnpm lint`                               | PASS — 26 tasks                                                                                                         | 0    |
| `pnpm typecheck`                          | PASS — 26 tasks                                                                                                         | 0    |
| `pnpm test` (turbo)                       | PASS — 22 tasks                                                                                                         | 0    |
| Suíte de integração (fresca, 16 arquivos) | PASS — 79/79 (117s)                                                                                                     | 0    |
| Suítes frescas por app/pkg                | domain 96, contracts 7, integrations 21, storage 5, config 4, observability 4, ui 6, web 6, api 1, worker 9, meta-mcp 7 | 0    |
| `pnpm build`                              | PASS — 12 tasks                                                                                                         | 0    |
| `pnpm security:scan`                      | PASS — nenhum segredo                                                                                                   | 0    |
| `pnpm security:audit`                     | **FAIL** — 2 high (image-size)                                                                                          | 1    |
| E2E (Playwright)                          | não existe (placeholder)                                                                                                | —    |
| Contract tests                            | não existe (placeholder)                                                                                                | —    |

## 35. O que pode ser usado hoje

- Todo o núcleo operacional localmente (CRM, imóveis, listings, screening, contratos, vistorias, locações, cobranças, ledger, portais) com fakes injetados ou via suíte de integração.
- Painel web completo com dados reais (sem credenciais externas).
- MCP Meta (17 tools) em dry-run/fake.
- Não usar em produção com dinheiro real / contratos reais / anúncios reais: nenhum provider real homologado.

## 36. O que precisa ser configurado

- `.env` local com DATABASE_URL (para rodar fora de teste) e PUBLIC_ORG_SLUG (site público).
- Para homologação: credenciais sandbox de WhatsApp, Asaas, Clicksign/D4Sign, Serasa/SPC, Meta Ads, Google Maps, S3/R2.
- Corrigir gates vermelhos (format + audit) e o bug do owners.

## 37. O que precisa ser homologado

Toda integração externa (nenhuma teve contato com sandbox/live): WhatsApp, Meta Ads, Asaas, Clicksign/D4Sign, Serasa/SPC, portais, Google Maps, Storage.

## 38. O que ainda precisa ser desenvolvido

- Adapters reais (Meta Graph, Asaas, Clicksign/D4Sign, Serasa/SPC, portais, IA).
- Consumidor do geocoding + Places Autocomplete.
- Templates de WhatsApp; validação de status de conexão com a Meta.
- HMAC/token nos webhooks signature/Meta; cancel/void de assinatura; cancel/refund no provider.
- Testes E2E e de contrato (placeholders).
- Mobile (só shell).
- Env vars do worker (PAYMENT_PROVIDER/SCREENING_PROVIDER) no zod schema.

## 39. Prioridade recomendada

1. **Fix**: bug `POST /properties/:id/owners` (Date→string) — quebra cadastro com mídia no Postgres real.
2. **Gates**: `format:check` (142 arquivos) e `pnpm audit --prod` (2 high).
3. **Segurança**: HMAC/token nos webhooks signature e Meta POST (P1 declarados).
4. **Config**: PAYMENT_PROVIDER/SCREENING_PROVIDER no schema env.
5. **Homologação**: credenciais sandbox (WhatsApp/Asaas/Meta) + adapters reais na ordem: Asaas → WhatsApp → Clicksign/D4Sign → Serasa/SPC → portais → Google.
6. **Tooling**: Playwright para E2E + contract tests.

## 40. Veredito

**FUNCTIONALLY_COMPLETE_WITH_EXTERNAL_BLOCKERS**

O produto está funcionalmente completo no núcleo (prova por execução real e 79 testes de integração frescos), mas: (a) toda integração externa depende de credencial/homologação/adapters inexistentes; (b) há 1 bug real reproduzido (owners com mídia) e 2 gates vermelhos. Não está PRODUCTION_READY nem HOMOLOGATION_READY até os itens 1–3 da seção 39 serem resolvidos.
