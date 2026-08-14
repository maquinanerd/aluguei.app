# DESIGN_GAP_AUDIT (gerado — Phase 01 Discovery)

Comparação entre a identidade exigida (PEG + Aluguei override) e o estado real do `apps/web`.

## Fundamentos

| Item | Exigido (design source) | Estado atual | Gap |
|---|---|---|---|
| Canvas | `#FCFCFC` (Aluguei) | `#f6f7f9` | P0 — cor errada |
| Surface | `#F0F0F0` / `#FFFFFF` | `#ffffff` | P1 — falta hierarchy |
| Border | famíla `#C7C7C7`/`#E5E5E7` | `#e2e6ec` | P1 |
| Ink/texto | `#2F332B` | `#1a2233` | P0 — identidade |
| Accent | `#41945D`/`#417D55` | `#0f5fd0` (azul) | P0 — accent errado |
| Semantic | success/warning/danger/info independentes | `#067647/#92400e/#b42318/#0f5fd0` | P1 |
| Tipografia | Inter, escala PEG (11–48px) | system-ui, sem escala | P0 |
| Spacing | escala 4/8/12/16/20/24/32/40/48/64 | ad-hoc | P0 |
| Radius | 4/6/8/12/16 | 10px único | P1 |
| Control height | 28/32/36/40 | padding fixo 10px | P1 |
| Sidebar | 232–248px full / 60–64 rail | inexistente | P0 |
| Topbar | 48–56px | ~45px ad-hoc | P1 |
| Tabela row | 48–56px | ~41px ad-hoc | P1 |
| Elevation | 0–3 discretas | sem | P1 |
| Dark mode | surfaces próprias | sem | P3 (não bloqueante) |

## Componentes (PEG → semantic → domain)

- Nenhum primitive PEG existe (Button, Input, Select, DataTable, Modal, Dropdown, Toast...). Precisam ser criados em `packages/ui` seguindo `02_COMPONENTS.md` e `04_COMPONENT_CATALOG.md`.
- Nenhum shell (Sidebar/Topbar/Breadcrumb/Tabs/SegmentedControl/InspectorPanel/Drawer).
- Nenhum domain component (LeadCell, PropertyCell, StatusBadge por domínio, etc.).

## Estados assíncronos

Nenhuma tela atual implementa loading/skeleton/empty/error/permission-denied/retry de forma sistemática. Gap total.

## Responsivo

Nenhum tratamento de breakpoints (360–479 / 480–767 / 768–1023 / 1024–1439 / 1440+). Gap total.

## Acessibilidade

- Login/register têm labels e `aria-busy` parcial.
- Sem foco gerenciado, overlays, aria-live, reduced motion, keyboard nav, tabelas acessíveis.
- Gap total para painel.

## Fontes de referência disponíveis

- `design-source/peg-product-design-system/references/*.webp` (20 screenshots).
- `design-tokens.css` / `design-tokens.json` (baseline PEG).
- `30_ALUGUEI_APP_COMPLETE_DESIGN.md` (produto).

## Conclusão

O painel deve ser construído do zero em `apps/web` sobre `packages/ui`, preservando os proxies de auth existentes, `api-server.ts` (server-side) e os portals/site público existentes (que devem ser recapeados com a identidade nova, sem quebrar contratos).
