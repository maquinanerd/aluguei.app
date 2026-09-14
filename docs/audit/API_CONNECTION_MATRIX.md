# API Connection Matrix — Aluguei.app

> Gerado em 2026-08-17. Contagem mecânica dos endpoints (152) + consumidores + evidência de teste.
> Status: ✅ WORKING_TESTED · ◐ IMPLEMENTED_NOT_TESTED · 🚫 UNUSED · 🧪 MOCK_DEPENDENT · ⛔ BROKEN

## Totais

- **Endpoints**: 152 (GET 66 · POST 68 · PATCH 11 · PUT 2 · DELETE 5)
- Com teste de integração cobrindo o fluxo: auth (7), crm (5), properties (7), channels (7), whatsapp (6), inspections (5), screening/contracts (4), meta (7), finance (3), portal (4), reporting (5), rbac (3), cross-org (3), dedupe (3), hardening (9), e2e-critical (1) = 79 testes
- Consumidores frontend: todas as telas do painel (via BFF `/api/backend/*`); site público (2); portais (11)
- Sem consumidor: GET /health (monitoramento), POST /parties/dedupe (usado por gateway? ver nota), GET /me/memberships (usado por /app/settings), PUT /properties/:id/address (frontend? verificável em property-detail), webhooks (externos), /organizations members (admin)

## Tabela principal

| METHOD | PATH                                          | AUTH               | TESTE                                                            | CONSUMIDOR                                    | STATUS |
| ------ | --------------------------------------------- | ------------------ | ---------------------------------------------------------------- | --------------------------------------------- | ------ |
| POST   | /auth/register                                | pub                | ✅ auth.flow                                                     | /register                                     | ✅     |
| POST   | /auth/login                                   | pub                | ✅ auth.flow (rate limit 429)                                    | /login                                        | ✅     |
| POST   | /auth/logout                                  | sess               | ✅                                                               | app-shell                                     | ✅     |
| GET    | /auth/me                                      | sess               | ✅                                                               | layout /app + dashboard                       | ✅     |
| POST   | /auth/switch-org                              | sess               | ✅ auth.flow                                                     | org-switcher                                  | ✅     |
| GET    | /me/memberships                               | sess               | ◐                                                                | /app/settings                                 | ◐      |
| GET    | /organizations/:orgId/members                 | member:read        | ✅ rbac                                                          | /app/admin/members                            | ✅     |
| POST   | /organizations/:orgId/members                 | member:manage      | ✅ rbac                                                          | /app/admin/members                            | ✅     |
| PATCH  | /organizations/:orgId/members/:userId         | member:manage      | ✅ rbac                                                          | /app/admin/members                            | ✅     |
| DELETE | /organizations/:orgId/members/:userId         | member:manage      | ✅ rbac                                                          | /app/admin/members                            | ✅     |
| GET    | /health                                       | pub                | ✅ api app.test                                                  | monitoramento                                 | ✅     |
| GET    | /health/ready                                 | pub                | ✅                                                               | readiness                                     | ✅     |
| POST   | /leads                                        | lead:write         | ✅ crm.flow (HTTP 201)                                           | /app/crm/leads                                | ✅     |
| GET    | /leads                                        | lead:read          | ✅                                                               | leads/pipeline/dashboard                      | ✅     |
| PATCH  | /leads/:id/status                             | lead:write         | ✅ (HTTP QUALIFYING)                                             | leads/pipeline/detail                         | ✅     |
| POST   | /parties                                      | party:write        | ✅ (HTTP 201)                                                    | contacts/leads                                | ✅     |
| GET    | /parties                                      | party:read         | ✅                                                               | contacts e demais                             | ✅     |
| POST   | /parties/dedupe                               | party:write        | ✅ dedupe (HTTP 200)                                             | gateway WhatsApp?                             | ✅     |
| POST   | /tasks                                        | task:write         | ✅ (HTTP 201)                                                    | /app/crm/tasks                                | ✅     |
| GET    | /tasks                                        | task:read          | ✅                                                               | tasks/calendar/dashboard                      | ✅     |
| PATCH  | /tasks/:id/status                             | task:write         | ✅ (HTTP DONE)                                                   | tasks                                         | ✅     |
| POST   | /visits                                       | visit:write        | ✅ (HTTP 201)                                                    | visits/calendar                               | ✅     |
| GET    | /visits                                       | visit:read         | ✅                                                               | visits/calendar/dashboard                     | ✅     |
| POST   | /proposals                                    | proposal:write     | ✅ (HTTP 201)                                                    | proposals                                     | ✅     |
| GET    | /proposals                                    | proposal:read      | ✅                                                               | proposals/dashboard                           | ✅     |
| POST   | /timeline                                     | timeline:write     | ◐                                                                | (nenhum cliente frontend encontrado; interno) | ◐      |
| GET    | /timeline                                     | timeline:read      | ✅ (HTTP 200 events)                                             | lead detail                                   | ✅     |
| POST   | /properties                                   | property:write     | ✅ (HTTP 201)                                                    | /app/properties/new                           | ✅     |
| GET    | /properties                                   | property:read      | ✅                                                               | properties/dashboard/calendar                 | ✅     |
| GET    | /properties/:id                               | property:read      | ✅                                                               | property detail                               | ✅     |
| PATCH  | /properties/:id                               | property:write     | ✅ (HTTP 200)                                                    | property detail                               | ✅     |
| PUT    | /properties/:id/address                       | property:write     | ✅ (HTTP 200)                                                    | property detail                               | ✅     |
| PUT    | /properties/:id/financial-terms               | property:write     | ✅ (HTTP 200)                                                    | property detail                               | ✅     |
| POST   | /properties/:id/owners                        | property:write     | ⛔ **400 no PG real quando o imóvel tem mídia (Date vs string)** | property detail                               | ⛔ BUG |
| DELETE | /properties/:id/owners/:partyId               | property:write     | ◐                                                                | property detail                               | ◐      |
| POST   | /properties/:id/features                      | property:write     | ✅ (HTTP 201)                                                    | property detail                               | ✅     |
| DELETE | /properties/:id/features/:feature             | property:write     | ✅ (HTTP 200)                                                    | property detail                               | ✅     |
| POST   | /properties/:id/media/upload-url              | property:write     | ✅ (fake storage HTTP 200/201)                                   | property detail                               | ✅🧪   |
| POST   | /properties/:id/media/confirm                 | property:write     | ✅                                                               | property detail                               | ✅🧪   |
| DELETE | /properties/:id/media/:mediaId                | property:write     | ◐                                                                | property detail                               | ◐      |
| POST   | /listings                                     | listing:write      | ✅ (HTTP 201)                                                    | /app/listings                                 | ✅     |
| GET    | /listings                                     | listing:read       | ✅                                                               | listings/dashboard/marketing                  | ✅     |
| GET    | /listings/:id                                 | listing:read       | ✅                                                               | —                                             | ✅     |
| PATCH  | /listings/:id                                 | listing:write      | ◐                                                                | —                                             | ◐      |
| PATCH  | /listings/:id/status                          | listing:write      | ✅ (HTTP READY/PUBLISHED)                                        | listings                                      | ✅     |
| POST   | /listings/:id/channels/:channel/publish       | listing:write      | ✅ (HTTP 201 → PUBLISHED no banco)                               | /app/channels                                 | ✅🧪   |
| POST   | /listings/:id/channels/:channel/update        | listing:write      | ✅ channels                                                      | /app/channels                                 | ✅🧪   |
| POST   | /listings/:id/channels/:channel/remove        | listing:write      | ✅ channels                                                      | /app/channels                                 | ✅🧪   |
| POST   | /channels/:channel/reconcile                  | listing:write      | ✅ channels                                                      | /app/channels                                 | ✅🧪   |
| POST   | /channels/:channel/import-leads               | listing:write      | ✅ channels                                                      | /app/channels                                 | ✅🧪   |
| GET    | /listings/:id/channels                        | listing:read       | ✅ (HTTP 200)                                                    | channels                                      | ✅     |
| GET    | /channels/summary                             | listing:read       | ✅                                                               | channels/dashboard                            | ✅     |
| GET    | /public/organizations/:orgSlug/listings       | pub                | ✅ (HTTP 200)                                                    | /imoveis                                      | ✅     |
| GET    | /public/organizations/:orgSlug/listings/:slug | pub                | ✅                                                               | /imoveis/[slug]                               | ✅     |
| GET    | /conversations                                | conversation:read  | ✅ (HTTP n=1)                                                    | /app/inbox                                    | ✅     |
| GET    | /conversations/:id                            | conversation:read  | ✅ whatsapp                                                      | inbox                                         | ✅     |
| GET    | /conversations/:id/messages                   | conversation:read  | ✅ (HTTP n=2)                                                    | inbox                                         | ✅     |
| GET    | /conversations/:id/intents                    | conversation:read  | ✅ (HTTP n=1)                                                    | inbox                                         | ✅     |
| POST   | /conversations/:id/messages                   | conversation:write | ✅ whatsapp                                                      | inbox                                         | ✅     |
| POST   | /conversations/:id/handoff                    | conversation:write | ✅ (HTTP 200)                                                    | inbox                                         | ✅     |
| GET    | /leads/:id/conversations                      | conversation:read  | ◐                                                                | lead detail                                   | ◐      |
| GET    | /whatsapp/connections                         | org:manage         | ✅ (HTTP n=1)                                                    | /app/admin/integrations                       | ✅     |
| POST   | /whatsapp/connections                         | org:manage         | ✅ (HTTP 201)                                                    | integrations                                  | ✅     |
| POST   | /inspections                                  | inspection:write   | ✅ (HTTP 201)                                                    | /app/inspections                              | ✅     |
| GET    | /inspections                                  | inspection:read    | ✅                                                               | inspections                                   | ✅     |
| GET    | /inspections/:id                              | inspection:read    | ✅                                                               | inspection detail                             | ✅     |
| POST   | /inspections/:id/rooms                        | inspection:write   | ✅ (HTTP 201)                                                    | inspection detail                             | ✅     |
| POST   | /inspections/:id/media/upload-url             | inspection:write   | ✅                                                               | inspection detail                             | ✅🧪   |
| POST   | /inspections/:id/media/confirm                | inspection:write   | ✅                                                               | inspection detail                             | ✅🧪   |
| DELETE | /inspections/:id/media/:mediaId               | inspection:write   | ◐                                                                | inspection detail                             | ◐      |
| POST   | /inspections/:id/process                      | inspection:write   | ✅ (HTTP 202 → REVIEW)                                           | inspection detail                             | ✅     |
| POST   | /inspections/:id/observations                 | inspection:write   | ✅ (HTTP 201 com roomId/category/severity)                       | inspection detail                             | ✅     |
| PATCH  | /inspections/:id/ai-suggestions/:suggestionId | inspection:write   | ✅ (HTTP 200 action ACCEPT)                                      | inspection detail                             | ✅     |
| GET    | /inspections/:id/review                       | inspection:read    | ✅ (HTTP 200: observations+aiSuggestions)                        | inspection detail                             | ✅     |
| PATCH  | /inspections/:id/status                       | inspection:write   | ✅ (HTTP 200 CAPTURING/COMPLETED; 409 guard)                     | inspection detail                             | ✅     |
| POST   | /inspections/:id/compare                      | inspection:write   | ✅ (HTTP 201 body={checkoutInspectionId})                        | inspection detail                             | ✅     |
| GET    | /inspections/:id/report                       | inspection:read    | ✅ (HTTP 200 snapshot)                                           | inspection detail                             | ✅     |
| POST   | /rental-applications                          | screening:write    | ✅ (HTTP 201)                                                    | /app/screening                                | ✅     |
| GET    | /rental-applications                          | screening:read     | ✅                                                               | screening/dashboard                           | ✅     |
| GET    | /rental-applications/:id                      | screening:read     | ✅                                                               | screening detail                              | ✅     |
| PATCH  | /rental-applications/:id/status               | screening:write    | ✅ (HTTP SUBMITTED)                                              | screening detail                              | ✅     |
| POST   | /rental-applications/:id/screening            | screening:write    | ✅ (HTTP 202 → APPROVED)                                         | screening detail                              | ✅🧪   |
| POST   | /parties/:partyId/consents                    | party:write        | ✅ (HTTP 201)                                                    | screening detail                              | ✅     |
| GET    | /parties/:partyId/consents                    | party:read         | ◐                                                                | —                                             | ◐      |
| POST   | /contract-templates                           | contract:write     | ✅ (HTTP 201)                                                    | /app/contract-templates                       | ✅     |
| GET    | /contract-templates                           | contract:read      | ✅                                                               | templates/contracts                           | ✅     |
| PATCH  | /contract-templates/:id/approve               | contract:write     | ✅ (HTTP 200)                                                    | templates                                     | ✅     |
| POST   | /contract-templates/:id/versions              | contract:write     | ◐                                                                | templates                                     | ◐      |
| POST   | /contracts                                    | contract:write     | ✅ (HTTP 201)                                                    | /app/contracts                                | ✅     |
| GET    | /contracts                                    | contract:read      | ✅                                                               | contracts/dashboard                           | ✅     |
| GET    | /contracts/:id                                | contract:read      | ✅                                                               | contract detail                               | ✅     |
| POST   | /contracts/:id/generate                       | contract:write     | ✅ (HTTP 200; exige todas as variáveis usadas)                   | contract detail                               | ✅     |
| POST   | /contracts/:id/send-for-signature             | contract:write     | ✅ (HTTP 201 FAKE injetado; 400 sem provider)                    | contract detail                               | ✅🧪   |
| PATCH  | /contracts/:id/status                         | contract:write     | ✅                                                               | contract detail                               | ✅     |
| POST   | /leases                                       | finance:write      | ✅ (HTTP 201 → ACTIVE)                                           | /app/leases                                   | ✅     |
| GET    | /leases                                       | finance:read       | ✅                                                               | leases/dashboard/finance                      | ✅     |
| GET    | /leases/:id                                   | finance:read       | ✅                                                               | lease detail                                  | ✅     |
| POST   | /charges                                      | finance:write      | ✅ (HTTP 201; multa/juros determinísticos)                       | /app/charges                                  | ✅     |
| GET    | /charges                                      | finance:read       | ✅                                                               | charges/finance                               | ✅     |
| GET    | /charges/:id                                  | finance:read       | ✅                                                               | charge detail                                 | ✅     |
| POST   | /charges/:id/payment                          | finance:write      | ✅ (HTTP 201 PIX QR fake; 400 sem provider)                      | charges/portal                                | ✅🧪   |
| POST   | /charges/:id/cancel                           | finance:write      | ✅                                                               | charges                                       | ✅     |
| POST   | /charges/:id/refund                           | finance:write      | ◐ (transição local; não chama provider)                          | charges                                       | ◐      |
| GET    | /payments                                     | finance:read       | ✅                                                               | /app/payments                                 | ✅     |
| GET    | /payouts                                      | finance:read       | ✅ (payout PENDING in-process)                                   | /app/payouts                                  | ✅     |
| GET    | /ledger/accounts                              | finance:read       | ✅                                                               | /app/ledger                                   | ✅     |
| GET    | /ledger/entries                               | finance:read       | ✅ (D=C in-process)                                              | /app/ledger                                   | ✅     |
| POST   | /bank-accounts                                | finance:write      | ✅ (HTTP 201)                                                    | finance                                       | ✅     |
| POST   | /reconciliations                              | finance:write      | ✅ (HTTP 202 → MATCHED)                                          | /app/reconciliation                           | ✅     |
| GET    | /reconciliations                              | finance:read       | ✅                                                               | reconciliation                                | ✅     |
| GET    | /meta/connections                             | meta:read          | ✅ (HTTP n=1)                                                    | marketing/integrations                        | ✅🧪   |
| POST   | /meta/connections                             | meta:write         | ✅ (HTTP 201 provider FAKE)                                      | marketing/integrations                        | ✅🧪   |
| GET    | /meta/connections/:id/assets                  | meta:read          | ✅ (HTTP n=4)                                                    | marketing                                     | ✅🧪   |
| GET    | /meta/ad-profiles                             | meta:read          | ✅                                                               | marketing                                     | ✅🧪   |
| POST   | /meta/ad-profiles                             | meta:write         | ✅ (HTTP 201 PREPARED+Housing; exige listing READY/PUBLISHED)    | MCP (prepare)                                 | ✅🧪   |
| GET    | /meta/campaigns                               | meta:read          | ✅                                                               | marketing                                     | ✅🧪   |
| GET    | /meta/campaigns/:id                           | meta:read          | ✅                                                               | marketing                                     | ✅🧪   |
| GET    | /meta/campaigns/:id/preview                   | meta:read          | ◐                                                                | —                                             | ◐🧪    |
| POST   | /meta/ad-profiles/:id/create-campaign         | meta:write         | ◐ **exige body {idempotencyKey}** (in-process: ✅)               | MCP                                           | ◐🧪    |
| POST   | /meta/campaigns/:id/publish                   | meta:write         | ✅ (intent → ACTIVE in-process)                                  | marketing (com idempotencyKey)                | ✅🧪   |
| POST   | /meta/campaigns/:id/pause                     | meta:write         | ✅ (intent → PAUSED in-process)                                  | marketing                                     | ✅🧪   |
| POST   | /meta/campaigns/:id/resume                    | meta:write         | ✅                                                               | marketing                                     | ✅🧪   |
| POST   | /meta/campaigns/:id/archive                   | meta:write         | ✅                                                               | marketing                                     | ✅🧪   |
| POST   | /meta/campaigns/:id/budget                    | meta:write         | ✅ (caps da org)                                                 | MCP                                           | ✅🧪   |
| POST   | /meta/campaigns/:id/schedule                  | meta:write         | ✅                                                               | MCP                                           | ✅🧪   |
| POST   | /meta/campaigns/:id/creative                  | meta:write         | ✅                                                               | MCP                                           | ✅🧪   |
| POST   | /meta/campaigns/:id/sync-insights             | meta:write         | ✅ (snapshot spend)                                              | marketing/MCP                                 | ✅🧪   |
| POST   | /portal/access                                | portal:manage      | ✅ (HTTP 201 oneTimeToken)                                       | (painel — fluxo futuro)                       | ✅     |
| POST   | /portal/access/:id/revoke                     | portal:manage      | ◐                                                                | —                                             | ◐      |
| POST   | /portal/auth/consume                          | pub(token)         | ✅ (HTTP 200 + cookie aluguei_portal)                            | /proprietario, /inquilino                     | ✅     |
| POST   | /portal/auth/logout                           | portal             | ◐                                                                | portais                                       | ◐      |
| GET    | /portal/me                                    | portal             | ✅ (HTTP 200)                                                    | portais                                       | ✅     |
| GET    | /portal/tenant/statement                      | portal             | ✅ (HTTP 200 billed/paid/open)                                   | /inquilino                                    | ✅     |
| GET    | /portal/tenant/charges                        | portal             | ✅ (HTTP 200)                                                    | /inquilino                                    | ✅     |
| GET    | /portal/tenant/contracts                      | portal             | ✅ (content só SIGNED)                                           | /inquilino                                    | ✅     |
| GET    | /portal/tenant/contracts/:id                  | portal             | ◐                                                                | /inquilino                                    | ◐      |
| GET    | /portal/tenant/inspections                    | portal             | ✅                                                               | /inquilino                                    | ✅     |
| POST   | /portal/tenant/charges/:id/payment            | portal             | ✅ (QR idempotente, in-process)                                  | /inquilino                                    | ✅🧪   |
| GET    | /portal/landlord/properties                   | portal             | ✅                                                               | /proprietario                                 | ✅     |
| GET    | /portal/landlord/statement                    | portal             | ✅                                                               | /proprietario                                 | ✅     |
| GET    | /portal/landlord/contracts                    | portal             | ◐                                                                | /proprietario                                 | ◐      |
| GET    | /portal/landlord/inspections                  | portal             | ◐                                                                | /proprietario                                 | ◐      |
| GET    | /webhooks/whatsapp                            | pub                | ✅ (403 verify token inválido)                                   | Meta                                          | ✅🧪   |
| POST   | /webhooks/whatsapp                            | pub                | ✅ (HTTP 200; assinatura se META_APP_SECRET)                     | Meta                                          | ✅🧪   |
| POST   | /webhooks/signature                           | pub                | ✅ (dedup; sem HMAC — gap)                                       | assinatura                                    | ✅🧪   |
| POST   | /webhooks/payments                            | pub                | ✅ (token se configurado; confirma no provider)                  | Asaas                                         | ✅🧪   |
| GET    | /webhooks/meta                                | pub                | ✅ verify token                                                  | Meta                                          | ✅🧪   |
| POST   | /webhooks/meta                                | pub                | ✅ (sem assinatura — gap)                                        | Meta                                          | ✅🧪   |
| GET    | /reporting/leads-funnel                       | report:read        | ✅ (HTTP 200)                                                    | /app/reporting                                | ✅     |
| GET    | /reporting/revenue-monthly                    | report:read        | ✅ (HTTP 200)                                                    | /app/reporting                                | ✅     |
| GET    | /reporting/meta-spend                         | report:read        | ✅ (HTTP 200)                                                    | /app/reporting                                | ✅     |
| GET    | /reporting/export/:kind                       | report:export      | ✅ reporting                                                     | /app/reporting (download)                     | ✅     |

## Observações

1. **Bug confirmado por execução**: `POST /properties/:id/owners` → 400 `createdAt: Invalid input: expected string, received Date` com Postgres real + imóvel com mídia. Mascarado em PGlite.
2. **Contratos estritos descobertos na execução** (comportamento correto, mas fácil de errar): create-campaign exige `{idempotencyKey}`; compare exige `{checkoutInspectionId}`; observação exige `roomId/category/severity`; ad-profile exige listing READY/PUBLISHED + `mediaSelection` ≥1 + `objective` OUTCOME_*; generate de contrato exige todas as variáveis do template usadas; template render valida.
3. **Sem consumidor de API**: `app.geocoding` (Google) não é chamado por nenhuma rota.
4. **Dependência de mock**: webhooks (4 providers), Meta Ads, canais (fake), screening (FAKE), assinatura (FAKE), pagamentos (FAKE), storage (fake/S3 não homologado).
5. `GET /webhooks/*` (verify) existem para os 2 providers Meta.
