# FINAL FRONTEND REPORT — Aluguei.app

Status: **COMPLETE**
Data: 2026-08-14
Escopo: painel administrativo web (`apps/web`) sobre PEG Product Design System + identidade Aluguei.

## Resumo

O painel foi construído do zero sobre o backend existente (autoridade funcional) e os contracts
Zod de `packages/contracts`. Todas as telas usam o design system `packages/ui` (PEG + Aluguei
override), cliente HTTP único via proxy BFF, RBAC espelho (servidor autoridade) e estados
completos (loading/empty/error/permission-denied/processing/retry/success).

## Gates finais

| Gate | Resultado |
|---|---|
| lint | green (ui + web) |
| typecheck | green (ui + web) |
| tests unit/component | green (ui 6, web 6) |
| testes de integração backend (journeys E2E) | green (16 files, 79 tests) |
| build (next build, Turbopack) | green |
| rotas do painel runtime | 29/29 → 200 |
| rotas públicas runtime | / /login /register /imoveis → 200 |
| secret scan (scripts/security-scan.mjs) | OK, nenhum segredo |
| security review (BFF/RBAC/PII/Meta) | sem P0; P1/P2 corrigidos |
| accessibility review | P0/P1 corrigidos (inbox mobile, sort teclado, drawer focus, contraste AA) |
| visual review | identidade OK; P1/P2 corrigidos (badges semânticos, grids responsive) |
| responsive | 1440/1280/1024/768/390/360 validados via CSS audit + runtime |
| P0 | 0 |
| P1 | 0 |

## Rotas implementadas (IMPLEMENTED) — 34

Visão Geral `/app`, Inbox `/app/inbox`, Leads `/app/crm/leads` + `/app/crm/leads/[id]`,
Pipeline `/app/crm/pipeline`, Contatos `/app/crm/contacts`, Tarefas `/app/crm/tasks`,
Agenda `/app/crm/calendar`, Imóveis `/app/properties` + `[id]` + `/new`, Listings
`/app/listings`, Canais `/app/channels`, Visitas `/app/visits`, Propostas `/app/proposals`,
Crédito `/app/screening` + `[id]`, Contratos `/app/contracts` + `[id]`, Templates
`/app/contract-templates`, Vistorias `/app/inspections` + `[id]`, Locações `/app/leases` + `[id]`,
Financeiro `/app/finance`, Cobranças `/app/charges`, Pagamentos `/app/payments`, Repasses
`/app/payouts`, Conciliação `/app/reconciliation`, Ledger `/app/ledger`, Marketing
`/app/marketing`, Relatórios `/app/reporting`, Usuários `/app/admin/members`, Integrações
`/app/admin/integrations`, Configurações `/app/settings`.

Públicas recapeadas com identidade: `/` (marketing), `/login`, `/register`, `/imoveis`,
`/imoveis/[slug]`, `/inquilino` (portal locatário), `/proprietario` (portal proprietário).

## NOT_APPLICABLE_BACKEND_GAP (registradas com evidência)

| Rota planejada | Evidência da lacuna |
|---|---|
| `/app/admin/audit` (Auditoria) | Backend só escreve audit (`plugins/audit.ts`); sem endpoint de leitura/listagem. Timeline cobre LEAD/PARTY/PROPOSAL/VISIT/TASK. |
| `/app/documents` (Documentos genéricos) | Sem endpoint de documentos além de mídia de imóvel e contrato content. |
| `/app/admin/permissions` (Permissões dedicadas) | RBAC estático role→permissions em `packages/domain/src/authz/rbac.ts`; sem tabela/endpoint de permissões. |
| `/app/crm/companies` (Empresas separadas) | parties com `type: COMPANY` cobrem; sem módulo separado. |
| `/app/automation` (Workflows) | Sem capability de automação no backend. |
| `/app/occurrences` (Ocorrências de locação) | Sem endpoint; timeline parcial cobre eventos. |
| `/app/properties/owners` (Proprietários separados) | `/parties` não filtra por role; owners vivem no Property 360. |
| Timeline de imóveis no Property 360 | `timelineEntityTypeSchema` limita a LEAD/PARTY/PROPOSAL/VISIT/TASK. |

## Integrações externas

Meta Ads, WhatsApp, Google Maps, crédito (Serasa/SPC), assinatura (Clicksign/D4Sign) e
pagamentos (Asaas) usam adapters com mock/dry-run quando sem credencial:
**IMPLEMENTED_NOT_LIVE_VERIFIED** (registrado em `docs/BLOCKERS.md` e nas telas de Integrações).

## Documentação de apoio

- `docs/frontend/generated/ROUTE_ENDPOINT_MATRIX.md`
- `docs/frontend/generated/CURRENT_UI_INVENTORY.md`
- `docs/frontend/generated/DESIGN_GAP_AUDIT.md`
- `docs/frontend/10_FRONTEND_STATE.md` (status COMPLETE)

## Nota

Nenhum efeito externo real (dinheiro, assinatura, WhatsApp, Meta Ads) foi executado em
desenvolvimento; tudo passou por mocks/dry-run/sandbox.
