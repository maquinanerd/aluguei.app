# 08 — Visual QA

## Severidade
P0 — identidade errada ou uso quebrado.
P1 — divergência visual/UX perceptível.
P2 — refinamento.
P3 — oportunidade futura.

## Por tela

### Typography
family, weight, size, line-height, hierarchy.

### Geometry
sidebar, topbar, inspector, controls, rows, modal, radius.

### Spacing
page padding, sections, component padding, labels.

### Surfaces
canvas, hierarchy, borders, secondary/tertiary text, semantic colors.

### Density
tabela, list, metadata, toolbar.

### Overlay
anchor, width, offset, shadow, backdrop, keyboard.

### Responsive
1440 / 1280 / 1024 / 768 / 390.

## Método
1. capturar implementação;
2. comparar com Aluguei/PEG sources;
3. registrar P0/P1/P2;
4. corrigir P0;
5. corrigir P1;
6. rerun screenshot;
7. só então avançar.

## Identity test
Remova mentalmente logo e verde.
A tela ainda precisa parecer da mesma família PEG.
