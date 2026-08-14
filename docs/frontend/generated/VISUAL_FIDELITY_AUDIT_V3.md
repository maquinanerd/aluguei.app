# VISUAL FIDELITY AUDIT V3 — ALUGUEI.APP

Data: 2026-08-14
Método: captura real via Chrome headless + CDP (cookie de sessão de teste criado via
`POST /auth/register`), medição geométrica por `getBoundingClientRect`/computed styles,
comparação com o screenshot do Claude Design. **Sem pixel-perfect** (mockup não existe como
imagem no repo); comparação geométrica/estrutural quantificada.

## BEFORE — diagnóstico real (prova da divergência)

Causa raiz: `.app-page { max-width: var(--peg-content-max) /* 1280px */; margin: 0 auto; }`
centralizava o conteúdo dentro do workspace em telas largas. O gap lateral crescia com a
viewport (medido em `/app`, conta de teste real):

| Viewport | Workspace | Page | Folga por lado | Causa |
|---|---|---|---|---|
| 1440 | 1178px | 1130px | — (max-width inativo) | — |
| 1600 | 1338px | **1280px** | ~29px | max-width 1280 |
| 1792 | 1530px | **1280px** | **~101px** | `margin: 0 101px` |
| 1920 | 1658px | **1280px** | **~165px** | `margin: 0 165px` |

Telas de detalhe 360 (Lead/Property/Contract/Screening/Lease/Inspection) usavam
`maxWidth: 1400 + margin: 0 auto`; inbox usava `maxWidth: 1600` — mesma causa compartilhada.

## Correções (V3)

1. **Workspace fluido (P1)** — `globals.css`: `.app-page` perdeu `max-width`/`margin: 0 auto`;
   padding horizontal fica no `.app-content` via novo token `--peg-page-padding: 24px`.
   Removidos `maxWidth: 1400` (6 telas 360 com inspector) e `maxWidth: 1600` (inbox) —
   shell B do PEG usa a largura útil toda; o inspector já consome largura própria.
2. **Dashboard geometry (P1)** — com o container liberado, os 4 `OperationalSummaryCard`
   crescem uniformemente e `dash-main` (queue + right rail) usa a proporção 1.6fr/1fr da
   largura real. Nenhuma alteração nos cards (já convergiam).
3. **Empty queue (P1)** — `.dash-queue .peg-empty { min-height: 240px }`: a fila vazia
   mantém geometria operacional (~305px de card) em vez de colapsar (~60px) e destruir a
   composição. Nenhum dado fictício.
4. **Topbar search (P2→P1)** — `.app-topbar__search` 280→340px; placeholder do
   `GlobalSearch` → "Buscar imóvel, lead, contato, cobrança"; ⌘K preservado.
5. **Microcalibration (P2)** — verificado, sem alteração: sidebar 240px (#fbfbfa),
   active #edece8 neutro + accent, profile footer presente, topbar 52px, page padding 24px,
   radius 6px no active. Token órfão `--peg-content-max` removido (substituído por
   `--peg-page-padding`).

## AFTER — medição real (mesmos viewports, mesma sessão)

| Viewport | Workspace | Page | Folga por lado | max-width | Summary cols | Search |
|---|---|---|---|---|---|---|
| 1440 | 1178px | 1130px | 24px (padding) | none | 270.5×4 | 340px |
| 1600 | 1338px | 1290px | 24px (padding) | none | 310.5×4 | 340px |
| 1792 | 1530px | 1482px | 24px (padding) | none | 358.5×4 | 340px |
| 1920 | 1658px | 1610px | 24px (padding) | none | 390.5×4 | 340px |

- Fila vazia: `emptyH 240px`, card 305px — geometria estável.
- `/app/properties` AFTER: page 1290px, sem max-width (era 1280) — sem regressão.
- `/app/properties/new` AFTER: Focus Mode puro — `focus-page` presente, sem `.app-page`,
  rail 340px, main 760px, 5 passos, sem login — não herda o container do dashboard.

## Microcalibration (AFTER, 1600)

```
sidebarW 240 · sidebarBg #fbfbfa · activeBg #edece8 · activeColor #2f332b
activeRadius 6px · profilePresent true · topbarH 52 · pagePadding 24px
groupTitles: CRM / Imóveis / Operação / Financeiro / Crescimento / Administração
```

## GATE — Visual Fidelity V3

| Critério | Status |
|---|---|
| WORKSPACE_FLUIDITY | PASS (prova: 1440/1600/1792/1920) |
| DASHBOARD_GEOMETRY | PASS (summary 4 colunas uniformes, proporção queue/rail mantida) |
| SIDEBAR | PASS (inalterada — já convergente) |
| TOPBAR | PASS (search 340px + placeholder específico) |
| EMPTY_STATE_GEOMETRY | PASS (min-height 240px) |
| PROPERTIES_REGRESSION | PASS (page 1290px fluido, sem quebra) |
| NEW_PROPERTY_REGRESSION | PASS (Focus Mode intacto, sem container herdado) |
| 1440 / 1600 / 1792 / 1920 | PASS (medição real em cada) |
| P0 | 0 |
| P1 | 0 |

## Verificação executada

- lint web green · typecheck web green
- testes web 6/6 · ui 6/6
- testes integração backend 79/79 (16 files)
- `next build` green
- `scripts/security-scan.mjs` OK
- `git diff --check` limpo

## Evidências (QA local, não vão para produção)

Screenshots e métricas em `%TEMP%\opencode\qa\`: `before|after-{1440,1600,1792,1920}`,
`prop-1600`, `newprop-1600` (+ JSON de métricas).
