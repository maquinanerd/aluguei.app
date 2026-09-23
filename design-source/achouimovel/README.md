# design-source/achouimovel

Pacote de design do AchouImóvel (portal + gestão + área do cliente). Extraia na raiz do repositório.

```
design-source/achouimovel/
├── README.md                 este arquivo
├── PROMPT_FRONTEND_ORQUESTRADO.md   prompt para o Claude Code
├── docs/
│   ├── HANDOFF.md            mapa tela → rota → componentes → dados; inventário de componentes
│   └── CONTEXTO_CLAUDE_DESIGN_AchouImovel.md   contexto atualizado (portal nacional, portais integrados, blocos coloridos)
├── tokens/
│   ├── achouimovel-portal.css   tokens do portal (--brand-*, --portal-*, --tipo-*)
│   └── fonts/Guton-*.otf
└── telas/                    referência visual; abre direto no navegador
    ├── portal/   00-identidade · 01-home · 02-busca · 03-anuncio · 04-outras · 05-para-imobiliarias · 06-complementos
    ├── conta/    01-conta
    └── gestao/   01-painel · 02-complementos · 03-ajustes · 04-cadastro-por-voz · 05-area-do-cliente · Painel Sidebar
```

## Nome dos arquivos no HANDOFF.md
O HANDOFF cita os nomes originais. Equivalência:
- AchouImovel Identidade → portal/00-identidade
- AchouImovel Portal → portal/01-home
- AchouImovel Portal - Busca → portal/02-busca
- AchouImovel Portal - Anuncio → portal/03-anuncio
- AchouImovel Portal - Outras → portal/04-outras
- AchouImovel Portal - Para imobiliarias → portal/05-para-imobiliarias
- AchouImovel Portal - Complementos → portal/06-complementos
- AchouImovel Conta → conta/01-conta
- AchouImovel Gestao → gestao/01-painel
- AchouImovel Gestao - Complementos → gestao/02-complementos
- AchouImovel Gestao - Ajustes → gestao/03-ajustes
- AchouImovel Gestao - Cadastro por voz → gestao/04-cadastro-por-voz
- AchouImovel Area do Cliente → gestao/05-area-do-cliente

As âncoras (`#visao`, `#busca-desktop` etc.) continuam as mesmas.

## Regras
- `.dc.html` é referência, não código de produção. Não importe esses arquivos no app.
- Números nas telas são fictícios. Textos de interface são finais.
- Gestão e área do cliente mantêm os tokens de `packages/ui/src/styles/tokens.css`.
- Portal usa `tokens/achouimovel-portal.css` e a fonte Guton.
