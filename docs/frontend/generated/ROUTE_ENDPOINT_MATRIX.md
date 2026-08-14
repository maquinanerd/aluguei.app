# ROUTE_ENDPOINT_MATRIX (gerado — Phase 01 Discovery)

Fonte: `apps/api/src/routes/*.ts`, `packages/contracts/src/*.ts`, `apps/web/src/app/**`.
Base da API: `http://localhost:4000` (env `API_BASE_URL`). Cookies: `aluguei_session`.

Convenção: todo acesso admin passa por proxy Next (`apps/web/src/lib/api-server.ts`) ou fetch server-side com cookie.

## Auth / Org

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /login | /auth/login | POST | loginRequest/ResponseSchema | público |
| /register | /auth/register | POST | registerRequest/ResponseSchema | público |
| /logout | /auth/logout | POST | logoutResponseSchema | público (cookie) |
| (layout) | /auth/me | GET | meResponseSchema | auth |
| (switcher) | /auth/switch-org | POST | switchOrgRequest/ResponseSchema | auth |
| (switcher) | /me/memberships | GET | listMyMembershipsResponseSchema | auth |
| /admin/members | /organizations/:orgId/members | GET/POST | listMembers/createMember | member:read/manage |
| /admin/members | /organizations/:orgId/members/:userId | PATCH/DELETE | updateMemberRole/removeMember | member:manage |

## CRM

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /crm/leads | /leads | GET/POST | listLeads/createLead | lead:read/write |
| /crm/leads/[id] | /leads/:id/status | PATCH | updateLeadStatus | lead:write |
| /crm/leads/[id] | /leads/:id/conversations | GET | listLeadConversations | conversation:read |
| /crm/contacts | /parties | GET/POST | listParties/createParty | party:read/write |
| /crm/contacts | /parties/dedupe | POST | dedupeParty | party:write |
| /crm/tasks | /tasks | GET/POST | listTasks/createTask | task:read/write |
| /crm/tasks | /tasks/:id/status | PATCH | updateTaskStatus | task:write |
| (timeline) | /timeline | GET/POST | listTimeline/createTimelineEvent | timeline:read/write |
| /crm/calendar | /visits | GET | listVisits | visit:read |
| /crm/calendar | /tasks | GET | listTasks | task:read |

## Imóveis

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /properties | /properties | GET/POST | listProperties/createProperty | property:read/write |
| /properties/[id] | /properties/:id | GET/PATCH | updateProperty | property:read/write |
| /properties/[id] | /properties/:id/address | PUT | upsertAddress | property:write |
| /properties/[id] | /properties/:id/financial-terms | PUT | upsertFinancialTerms | property:write |
| /properties/[id] | /properties/:id/owners | POST | addOwner | property:write |
| /properties/[id] | /properties/:id/owners/:partyId | DELETE | ok | property:write |
| /properties/[id] | /properties/:id/features | POST | addFeature | property:write |
| /properties/[id] | /properties/:id/features/:feature | DELETE | ok | property:write |
| /properties/[id] | /properties/:id/media/upload-url | POST | requestUploadUrl | property:write |
| /properties/[id] | /properties/:id/media/confirm | POST | confirmMedia | property:write |
| /properties/[id] | /properties/:id/media/:mediaId | DELETE | ok | property:write |
| /listings | /listings | GET/POST | listListings/createListing | listing:read/write |
| /listings/[id] | /listings/:id | GET/PATCH | updateListing | listing:read/write |
| /listings/[id] | /listings/:id/status | PATCH | updateListingStatus | listing:write |
| /channels | /channels/summary | GET | channelSummarySchema | listing:read |
| /channels | /listings/:id/channels | GET | listChannelsResponse | listing:read |
| /channels | /listings/:id/channels/:channel/publish | POST | channelPublishResponse | listing:write |
| /channels | /listings/:id/channels/:channel/update | POST | channelPublishResponse | listing:write |
| /channels | /listings/:id/channels/:channel/remove | POST | removeResponse | listing:write |
| /channels | /channels/:channel/reconcile | POST | reconcileResponse | listing:write |
| /channels | /channels/:channel/import-leads | POST | importLeadsResponse | listing:write |

## Atendimento

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /visits | /visits | GET/POST | listVisits/createVisit | visit:read/write |
| /proposals | /proposals | GET/POST | listProposals/createProposal | proposal:read/write |
| /inbox | /conversations | GET | listConversations | conversation:read |
| /inbox/[id] | /conversations/:id | GET | conversationSchema | conversation:read |
| /inbox/[id] | /conversations/:id/messages | GET/POST | listMessages/sendMessage | conversation:read/write |
| /inbox/[id] | /conversations/:id/intents | GET | listIntentsResponse | conversation:read |
| /inbox/[id] | /conversations/:id/handoff | POST | handoffResponse | conversation:write |
| /settings/whatsapp | /whatsapp/connections | GET/POST | listWhatsAppConnections/createWhatsAppConnection | conversation:read/write |

## Crédito / Contratos / Assinatura

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /screening | /rental-applications | GET/POST | listRentalApplications/createRentalApplication | screening:read/write |
| /screening/[id] | /rental-applications/:id | GET | rentalApplicationAggregate | screening:read |
| /screening/[id] | /rental-applications/:id/status | PATCH | updateRentalApplicationStatus | screening:write |
| /screening/[id] | /rental-applications/:id/screening | POST | requestScreeningResponse | screening:write |
| /screening/[id] | /parties/:partyId/consents | GET/POST | listPartyConsents/createPartyConsent | screening:read/write |
| /contracts | /contracts | GET/POST | listContracts/createContract | contract:read/write |
| /contracts/[id] | /contracts/:id | GET | contractAggregate | contract:read |
| /contracts/[id] | /contracts/:id/generate | POST | generateContractResponse | contract:write |
| /contracts/[id] | /contracts/:id/send-for-signature | POST | sendForSignatureResponse | contract:write |
| /contracts/[id] | /contracts/:id/status | PATCH | updateContractStatus | contract:write |
| /contract-templates | /contract-templates | GET/POST | listContractTemplates/createContractTemplate | contract:read/write |
| /contract-templates/[id] | /contract-templates/:id/approve | PATCH | approveContractTemplateResponse | contract:write |
| /contract-templates/[id] | /contract-templates/:id/versions | POST | createContractTemplateVersion | contract:write |

## Vistorias

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /inspections | /inspections | GET/POST | listInspections/createInspection | inspection:read/write |
| /inspections/[id] | /inspections/:id | GET | inspectionAggregate | inspection:read |
| /inspections/[id] | /inspections/:id/rooms | POST | createRoomResponse | inspection:write |
| /inspections/[id] | /inspections/:id/media/upload-url | POST | inspectionUploadUrlResponse | inspection:write |
| /inspections/[id] | /inspections/:id/media/confirm | POST | confirmInspectionMedia | inspection:write |
| /inspections/[id] | /inspections/:id/media/:mediaId | DELETE | ok | inspection:write |
| /inspections/[id] | /inspections/:id/process | POST | inspectionAggregate | inspection:write |
| /inspections/[id] | /inspections/:id/observations | POST | createObservationResponse | inspection:write |
| /inspections/[id] | /inspections/:id/ai-suggestions/:suggestionId | PATCH | resolveSuggestionResponse | inspection:write |
| /inspections/[id] | /inspections/:id/review | GET | listReviewResponse | inspection:read |
| /inspections/[id] | /inspections/:id/status | PATCH | updateInspectionStatus | inspection:write |
| /inspections/[id] | /inspections/:id/compare | POST | createComparisonResponse | inspection:write |
| /inspections/[id] | /inspections/:id/report | GET | inspectionReport | inspection:read |

## Locações / Financeiro

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /leases | /leases | GET/POST | listLeases/createLease | finance:read/write |
| /leases/[id] | /leases/:id | GET | leaseAggregate | finance:read |
| /charges | /charges | GET/POST | listCharges/createCharge | finance:read/write |
| /charges/[id] | /charges/:id | GET | chargeSchema | finance:read |
| /charges/[id] | /charges/:id/payment | POST | paymentInitiationResponse | finance:write |
| /charges/[id] | /charges/:id/cancel | POST | chargeSchema | finance:write |
| /charges/[id] | /charges/:id/refund | POST | refundResponse | finance:write |
| /payments | /payments | GET | listPaymentsResponse | finance:read |
| /payouts | /payouts | GET | listPayoutsResponse | finance:read |
| /ledger | /ledger/accounts | GET | listLedgerAccountsResponse | finance:read |
| /ledger | /ledger/entries | GET | listLedgerEntriesResponse | finance:read |
| /settings/bank | /bank-accounts | POST | createBankAccountResponse | finance:write |
| /reconciliation | /reconciliations | GET/POST | listReconciliations/createReconciliation | finance:read/write |

## Marketing / Meta

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /meta | /meta/connections | GET/POST | metaConnection/createMetaConnection | meta:read/write |
| /meta | /meta/connections/:id/assets | GET | metaAsset list | meta:read |
| /meta/ad-profiles | /meta/ad-profiles | GET/POST | listAdProfiles/prepareCampaign | meta:read/write |
| /meta/ad-profiles/[id] | /meta/ad-profiles/:id/create-campaign | POST | metaCampaignLink | meta:write |
| /meta/campaigns | /meta/campaigns | GET | listCampaigns | meta:read |
| /meta/campaigns/[id] | /meta/campaigns/:id | GET | metaCampaignDetail | meta:read |
| /meta/campaigns/[id] | /meta/campaigns/:id/preview | GET | metaPreview | meta:read |
| /meta/campaigns/[id] | /meta/campaigns/:id/publish | POST | campaignAction | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/pause | POST | campaignAction | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/resume | POST | campaignAction | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/archive | POST | campaignAction | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/budget | POST | updateBudget | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/schedule | POST | updateSchedule | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/creative | POST | updateCreative | meta:write |
| /meta/campaigns/[id] | /meta/campaigns/:id/sync-insights | POST | syncInsights | meta:write |

## Reporting

| Rota web | Endpoint API | Método | Contract | Permissão |
|---|---|---|---|---|
| /reporting | /reporting/leads-funnel | GET | funnelReportResponse | report:read |
| /reporting | /reporting/revenue-monthly | GET | revenueMonthlyResponse | report:read |
| /reporting | /reporting/meta-spend | GET | metaSpendResponse | report:read |
| /reporting | /reporting/export/:kind | GET | exportQuery → csv/json | report:export |

## Portal (proprietário/locatário — público autenticado via `aluguei_portal`)

| Rota web | Endpoint API | Método | Contract |
|---|---|---|---|
| /portal/access | /portal/access | POST | createPortalAccessResponse |
| /portal/access/:id/revoke | /portal/access/:id/revoke | POST | ok |
| /portal/auth/consume | /portal/auth/consume | POST | consumePortalToken |
| /portal/auth/logout | /portal/auth/logout | POST | ok |
| /portal/me | /portal/me | GET | portalSessionResponse |
| /portal/tenant/statement | /portal/tenant/statement | GET | tenantStatement |
| /portal/tenant/charges | /portal/tenant/charges | GET | listPortalCharges |
| /portal/tenant/contracts | /portal/tenant/contracts | GET | portalContract list |
| /portal/tenant/contracts/:id | /portal/tenant/contracts/:id | GET | portalContract |
| /portal/tenant/inspections | /portal/tenant/inspections | GET | portalInspectionReport list |
| /portal/tenant/charges/:id/payment | /portal/tenant/charges/:id/payment | POST | portalPaymentInitiationResponse |
| /portal/landlord/properties | /portal/landlord/properties | GET | portalProperty list |
| /portal/landlord/statement | /portal/landlord/statement | GET | landlordStatement |
| /portal/landlord/contracts | /portal/landlord/contracts | GET | portalContract list |
| /portal/landlord/inspections | /portal/landlord/inspections | GET | portalInspectionReport list |

## Público (site)

| Rota web | Endpoint API | Método | Contract |
|---|---|---|---|
| /imoveis | /public/organizations/:orgSlug/listings | GET | listPublicListingsResponse |
| /imoveis/[slug] | /public/organizations/:orgSlug/listings/:slug | GET | publicListingSchema |

## Webhooks (fora do escopo UI; existem para auditoria)

`/webhooks/whatsapp` (GET verify/POST), `/webhooks/signature` (POST), `/webhooks/payments` (POST), `/webhooks/meta` (GET verify/POST).

## Notas

- Não existe endpoint de "audit log" próprio no painel; auditoria é exposta via timeline e integrações (gap a confirmar na Phase 11).
- Não existe endpoint de "documentos" genérico além de mídia de imóvel e contrato `content`.
- Não existe endpoint de "empresas" separado: parties com `type: COMPANY` cobrem.
- Não existe módulo de automação/workflows no backend → NOT_APPLICABLE_BACKEND_GAP.
- Não existe endpoint de "ocorrências" (lease occurrences) → NOT_APPLICABLE_BACKEND_GAP (timeline cobre parcialmente).
- Sem endpoint de usuários criados manualmente além de memberships (registro via /auth/register).
