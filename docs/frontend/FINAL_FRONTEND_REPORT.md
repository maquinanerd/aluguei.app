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

## Visual Fidelity V2

Rodada de convergência com os mockups do Claude Design e o PEG Product Design System
(autoridade: screenshots/design Aluguei → PEG → `30_ALUGUEI_APP_COMPLETE_DESIGN.md`).
Nenhuma mudança de backend; nenhuma regressão de domínio.

### Divergências corrigidas (P0 → 0, P1 → 0)

| Área | Antes | Depois |
|---|---|---|
| Tokens | active nav verde (`brand-subtle` em todo o item) | active neutro (`--peg-nav-active-bg #edece8`) + barra/accent verde de 3px + ícone verde controlado |
| App frame | shell full-bleed, sidebar colada ao viewport | aplicação contida: background externo neutro, frame com radius 14, border sutil, elevação leve (`--peg-shadow-app`) |
| Sidebar | grupos Operação/Financeiro/Crescimento/Admin; footer só org switcher | grupos de domínio (CRM/Imóveis/Operação/Financeiro/Crescimento/Administração), Visão Geral no topo, rail colapsável (64px), profile card no rodapé (avatar/nome/role/menu), badges suportadas |
| Topbar | breadcrumb simples + org + avatar | breadcrumb + contexto (org + relógio ao vivo), busca global com ⌘K, atalho de atendimento (bell → inbox), account menu |
| Dashboard | 4 KPIs + 4 empty states + 6 quick links | central operacional: header "Bom dia, {nome}" com resumo + ações, alert strip com dados reais (canais falhos/cobranças vencidas), 4 operation summary cards (CRM/Imóveis/Operação/Financeiro), fila de ações, ciclo de locação com barras CSS, card de atendimento — tudo com 0 semântico quando vazio |
| Imóveis | tabela genérica | contagens reais no header, tabs de status, chip de filtro aplicado, tabela densa (row 44px) com thumbnail/código/título, paginação |
| Novo imóvel | formulário full-width no shell | Focus Mode: sem sidebar/topbar, header com stepper (Áudio→…→Publicação, etapa real destacada), left rail com fluxo de captação + nota honesta de capability, main column com formulário real |
| Densidade | tables 52px | token global 44px (dense 36px), fila/summary cards compactos |
| Borders/shadow | flat puro | bordas finas + `--peg-shadow-app` sutil; sem sombras pesadas |

### Acessibilidade (review com subagente — P0:0, P1:0, P2 restantes documentados)

- Focus trap real no drawer mobile (Tab/Shift+Tab) + id único `mobile-nav`
- Busca global como combobox APG (setas, Enter, Escape, `aria-expanded/controls/activedescendant`)
- Tabs de status com roving tabindex + setas/Home/End
- ProfileMenu com teclado APG (setas + Escape)
- Skip link "Pular para o conteúdo", `aria-current` no breadcrumb, `aria-hidden` nos separadores
- Contraste AA: stepper do Focus Mode, rail note e kbd passam a usar text-secondary; chevron da fila corrigido
- Targets de toque ≥24px nos links do dashboard; h1 no Focus Mode; `aria-label` em rail links e busca

P2 restantes (não bloqueiam): texto branco sobre brand `#41945d` (~3.7:1, decisão de identidade),
dark-mode badge danger latente (tema dark não ativado hoje), foco `--aluguei-brand-focus` 0.35 alpha.

### Verificação

- lint monorepo green, typecheck monorepo green
- tests ui (6) + web (6) green
- `next build` green (rotas `/app`, `/app/properties`, `/app/properties/new` incluídas)
- secret scan OK
- `git diff --check` limpo

### Nota de dados

Nenhum número fictício dos screenshots (418, 86, 31, R$ 18,4k etc.) foi inserido. Todos os
valores vêm dos endpoints reais; estados vazios preservam a composição do mockup com zeros.

## Nota

Nenhum efeito externo real (dinheiro, assinatura, WhatsApp, Meta Ads) foi executado em
desenvolvimento; tudo passou por mocks/dry-run/sandbox.
