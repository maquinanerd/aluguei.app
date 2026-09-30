# design-source/achouimovel

**Onde extrair:** dentro de `design-source\` do repositório. O resultado precisa ser `design-source\achouimovel\README.md`. Apague antes a pasta antiga `design-source\pacote\`.

```
design-source/achouimovel/
├── README.md
├── PROMPT_FRONTEND_ORQUESTRADO.md   prompt para o Claude Code
├── SCREENS.md                       índice: 59 telas → print → rota → origem
├── prints/                          PNG de cada tela (verdade visual)
│   ├── portal/   22 imagens
│   ├── conta/     9 imagens
│   ├── gestao/   21 imagens
│   └── cliente/   7 imagens
├── telas/                           fonte das telas (.dc.html, abre no navegador)
│   ├── portal/  conta/  gestao/
├── tokens/
│   ├── achouimovel-portal.css       tokens do portal
│   └── fonts/Guton-*.otf
└── docs/
    ├── HANDOFF.md                   componentes, rotas, dados, regras
    └── CONTEXTO_CLAUDE_DESIGN_AchouImovel.md
```

## Como usar
1. `prints/*.png` é o alvo visual. A tela implementada tem que ficar igual à imagem.
2. `telas/*.dc.html` tem os valores exatos. Dentro de cada arquivo, a parte entre `<x-dc>` e `</x-dc>` é HTML com estilos inline (px, cores, pesos, textos finais). Os dados de exemplo ficam na classe `Component` em `renderVals()`. Leia o trecho da âncora indicada no `SCREENS.md`.
3. Para abrir uma tela no navegador: sirva a pasta (`npx serve design-source/achouimovel/telas`) e abra `portal/01-home.dc.html`. Não abra com `file://`.
4. Os `.dc.html` são referência. Não importe no app.

## Duas linguagens visuais
- **Portal** (`apps/portal`): `tokens/achouimovel-portal.css`, fonte Guton, fundo branco, acento `#037A4B`, cores por tipo `--tipo-*`, blocos coloridos com grade.
- **Gestão e área do cliente** (`apps/web`): o visual que já está no ar (`packages/ui/src/styles/tokens.css`, Inter, `#41945D`). As telas mostram só o que muda ou é novo.

Números nas telas são fictícios. Textos de interface são finais.
