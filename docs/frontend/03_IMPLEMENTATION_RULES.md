# 03 — Design Implementation Rules

## Foundation

Calibrar usando PEG references.

Baseline:
- spacing: 4/8/12/16/20/24/32/40/48/64;
- radius: 4/6/8/12/16;
- control heights: 28/32/36/40;
- sidebar: 232–248;
- rail: 60–64;
- topbar: 48–56;
- inspector: 300–360;
- table rows: 48–56.

## Typography

Use a fonte definida/implementada pelo PEG atual.
Se o repo já tiver a family compartilhada, preserve.
Não introduza outra família sem evidência do design source.

## Components

Preferir:
1. PEG primitives existentes;
2. shadcn/Radix ou primitives atuais do repo;
3. semantic wrappers;
4. domain composition.

## CSS

- tokens semânticos;
- CSS variables;
- Tailwind/theme se já adotado;
- sem hex repetido em componentes;
- sem inline style em massa;
- sem componentes duplicados por módulo.

## Density

Painel é operacional:
- tabelas densas e legíveis;
- cards apenas onde agregam;
- usar divisores;
- secondary text antes de reduzir fonte;
- metadata não abaixo do legível.

## Color

Green = brand accent.
Não confundir `brand` com `success`.

## Charts

Só quando ajudam decisão.
Dashboard não pode virar mosaico de KPIs.

## Dark mode

Se o repo já suporta ou design source exige, calibrar surface por surface.
Não bloquear a conclusão do painel claro caso dark ainda não seja capability normativa.
