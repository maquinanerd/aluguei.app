# 00 — Design Authority

## Fonte de verdade

Ordem de precedência obrigatória:

1. screenshots/artefatos específicos do Aluguei.app encontrados no repositório;
2. screenshots PEG em `design-source/peg-product-design-system/references/`;
3. PEG Product Design System já implementado no repo;
4. `design-source/aluguei/30_ALUGUEI_APP_COMPLETE_DESIGN.md`;
5. PEG docs/tokens empacotados;
6. UI atual do repo apenas se alinhada.

Se houver conflito entre preferência do agente e evidência visual, a referência vence.

## PEG UI

O PEG Product Design System define:
- foundation;
- component library;
- application shells;
- patterns;
- calibration;
- visual QA.

Aluguei.app é uma variação de produto, não um design system novo.

## Product override Aluguei.app

Neutros compartilhados:
- `neutral.canvas = #FCFCFC`
- `neutral.surface = #F0F0F0`
- `neutral.mid = #C7C7C7`
- `neutral.ink = #2F332B`

Accent:
- `aluguei.brand.primary = #41945D`
- `aluguei.brand.strong = #417D55`

## Regras proibidas

- glassmorphism;
- gradient decorativo;
- shadow pesado;
- radius excessivo;
- excesso de pills;
- cards gigantes;
- dashboard genérico;
- gráficos sem decisão;
- ilustração vazia;
- neon;
- verde ocupando grandes superfícies;
- CSS local arbitrário quando token/component resolve.

## Calibration gate

Antes de expandir telas:
- comparar foundation;
- sidebar;
- topbar;
- controls;
- table;
- overlays;
- density;
- responsive.

P0/P1 devem ser zerados antes da expansão em massa.
