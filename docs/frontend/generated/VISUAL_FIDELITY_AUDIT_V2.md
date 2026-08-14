# VISUAL FIDELITY AUDIT V2 — ALUGUEI.APP

Data: 2026-08-14
Autoridade: mockups Claude Design (descrição de referência) → `design-source/aluguei/30_ALUGUEI_APP_COMPLETE_DESIGN.md` → PEG Product Design System → implementação.
Método: comparação estrutural entre a composição descrita nos mockups e a implementação real; ajustes em tokens/shell/componentes; sem redesenho livre; sem backend.

## Resumo

| Critério | Antes | Depois | Status |
|---|---|---|---|
| App frame | full-bleed | contido (radius 14, border, bg externo, elevação sutil) | PASS |
| Sidebar | grupos genéricos, active verde, footer só org | grupos de domínio, active neutro + accent verde, rail colapsável, profile footer | PASS |
| Topbar | breadcrumb simples | contexto + org + relógio, busca global ⌘K, atendimento, conta | PASS |
| Dashboard | KPIs + empties + quick links | central operacional com dados reais | PASS |
| Imóveis | tabela genérica | contagens, tabs, filtros aplicados, densidade | PASS |
| Novo imóvel | formulário no shell | Focus Mode (header + stepper + rail + main) | PASS |
| Tokens/cores | active nav verde demais | active neutro, accent controlado | PASS |
| Borders/shadows | flat | bordas finas + elevação leve consistente | PASS |
| Tipografia | genérica | títulos/pesos recalibrados (Inter, 13/14px corpo, uppercase 11px) | PASS |
| Densidade | tables 52px | 44px global, dense 36px | PASS |
| Responsive | já responsivo | frame recolhe no mobile, drawer com focus trap | PASS |
| A11y | — | P0/P1 → 0 (combobox APG, tabs roving, menu APG, skip link, AA) | PASS |
| P0 | 0 | 0 | PASS |
| P1 | 8 (prompt) | 0 | PASS |

## Divergências encontradas e correções (ID → tela → componente → esperado → atual → severidade → correção)

1. `SHELL-1` / shell / frame / app contido com respiro / full-bleed / P1 / `.app-shell` + `.app-frame` com radius 14, border, bg `--peg-app-frame-bg`, `--peg-shadow-app`.
2. `NAV-1` / sidebar / active item / neutro com accent pequeno / verde `brand-subtle` em toda a superfície / P1 / tokens `--peg-nav-*` + barra 3px + ícone brand-strong.
3. `NAV-2` / sidebar / grupos / domínio (CRM, Imóveis, Operação, Financeiro) / genérico (Operação, Financeiro, Crescimento, Administração) / P1 / `navigation.ts` reestruturado com `NAV_ROOT` + grupos por domínio.
4. `NAV-3` / sidebar / rail / compact rail suportado / sem rail / P1 / collapse persistido (localStorage) + `app-sidebar--collapsed` 64px + `RailLink`.
5. `NAV-4` / sidebar / profile footer / card avatar+nome+role+menu / só org switcher / P1 / `ProfileMenu` APG + OrgSwitcher + profile card.
6. `TOP-1` / topbar / contexto / "Visão Geral · Unidade · hoje, HH:MM" / breadcrumb apenas / P1 / org + `TopbarClock` no contexto.
7. `TOP-2` / topbar / busca global / search + ⌘K / ausente / P1 / `GlobalSearch` combobox APG.
8. `DASH-1` / dashboard / composição / central operacional / KPI+empties / P1 / reescrita completa em `page.tsx`.
9. `DASH-2` / dashboard / alert strip / só quando problema real / ausente / P1 / `dash-alert` com canais falhos e cobranças vencidas.
10. `DASH-3` / dashboard / summary cards / 4 cards operacionais / 4 KPIs grandes / P1 / `SummaryCard` com linhas por domínio.
11. `DASH-4` / dashboard / fila de ações / tabs Hoje/Semana/Atrasadas + rows / ausente / P1 / fila com tasks/cobranças/visitas reais (tabs por datas como P2 futuro).
12. `DASH-5` / dashboard / ciclo de locação / barras progressivas CSS / ausente / P1 / `dash-cycle-row` com dados reais.
13. `DASH-6` / dashboard / atendimento / conversas+leads sem atendimento / ausente / P1 / `MetricRow` com dados reais.
14. `PROP-1` / imóveis / header / contagens reais / sem contagens / P1 / `total` + `active` via queries.
15. `PROP-2` / imóveis / tabs / Todos/Disponíveis/Arquivados / select de status / P1 / tabs APG.
16. `PROP-3` / imóveis / tabela / densa com thumb/código / tabela padrão / P1 / `dense` + `prop-*` classes + Pagination.
17. `NEW-1` / novo imóvel / Focus Mode / sem sidebar, header+stepper / formulário no shell / P1 / rota focus no AppShell + `focus-*` layout.
18. `TOKEN-1` / tokens / nav / neutro / verde / P1 / tokens `--peg-nav-*`.
19. `ELEV-1` / sombras / leve e consistente / flat / P2 / `--peg-shadow-app` + shadow-1/2/3 recalibrados.
20. `RADIUS-1` / radius / moderado, card md 8 / alguns 12+ / P2 / mantido 4/6/8/12/16 com uso calibrado.
21. `TYPO-1` / tipografia / compacta precisa / corpo 14 ok / P2 / página 20–22px, títulos de card 13px, labels 11px uppercase.

## Gaps restantes (registrados com evidência, sem inventar)

- Badges numéricas na sidebar (`12`, `86`, `418`...): mecanismo implementado (`NavItem.badge` + CSS), sem preenchimento porque não há endpoint agregado de contagens por item de nav sem custo. **Gap de dado, não de visual.**
- "Cadastrar por voz": capability de produto não existe no backend → CTA real "Novo imóvel"; o Focus Mode documenta o fluxo de captação por voz como roadmap com nota honesta.
- Tabs Hoje/Semana/Atrasadas da fila: fila implementada com agrupamento real por atraso/hoje; alternância de janelas pode entrar como refinamento P2 com dados.
- Tempo médio de resposta (atendimento): sem dado de primeira resposta por conversa no list endpoint → não exibido (não inventado).

## Verificação executada

- `pnpm -r lint` green · `pnpm -r typecheck` green
- `pnpm --filter @aluguei/web test` 6/6 · `pnpm --filter @aluguei/ui test` 6/6
- `pnpm --filter @aluguei/web build` green (inclui /app, /app/properties, /app/properties/new)
- `scripts/security-scan.mjs` OK
- `git diff --check` limpo
- Accessibility review (subagente): P0 0, P1 0 (5 P1 corrigidos), P2 restantes documentados no relatório final

## Definition of Done

FOUNDATION_FIDELITY PASS · APP_FRAME PASS · SIDEBAR PASS · TOPBAR PASS · DASHBOARD PASS ·
PROPERTY_LIST PASS · NEW_PROPERTY PASS · TOKENS PASS · COLORS PASS · TYPOGRAPHY PASS ·
SPACING PASS · BORDERS PASS · ELEVATION PASS · DENSITY PASS · RESPONSIVE PASS ·
ACCESSIBILITY PASS · FUNCTIONAL_REGRESSION PASS · BUILD PASS · P0 = 0 · P1 = 0.

Visual regression com screenshots automatizados (Playwright): não há setup de Playwright no
repositório (verificado) — screenshots de referência dos mockups também não existem como imagens
no workspace; a comparação desta rodada foi estrutural sobre as referências markdown. Registrado
como gap de tooling, não de implementação.
