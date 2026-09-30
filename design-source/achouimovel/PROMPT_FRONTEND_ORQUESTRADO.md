# Tarefa: implementar todo o front do AchouImóvel igual às telas de referência

Leia primeiro, nesta ordem: `design-source/achouimovel/README.md`, `SCREENS.md`, `docs/HANDOFF.md`, `docs/CONTEXTO_CLAUDE_DESIGN_AchouImovel.md`. Depois `AGENTS.md`, `docs/EXECUTION_STATE.md` e `PROMPT_apps-portal.md`. Não leia `docs/audits/**`.

## Regra principal: fidelidade visual
A tentativa anterior não ficou parecida com as telas. Desta vez:
1. **Cada tela do `SCREENS.md` é um item de trabalho.** Não agrupe, não "interprete", não troque layout, texto, cor, espaçamento ou fonte.
2. Antes de codar uma tela: abra `prints/<área>/<tela>.png` (leia a imagem) **e** leia o trecho do `.dc.html` indicado na coluna Origem. Copie os valores de lá: largura, altura, padding, gap, raio, cor hex, tamanho e peso da fonte, texto.
3. Depois de codar: rode Playwright na rota com os mesmos dados de exemplo (seed ou fixture), tire screenshot na mesma largura do print (1440, 1040 ou 390) e compare lado a lado com o PNG. Corrija até a diferença ser só de dados. Salve `docs/frontend/achouimovel-evidence/<área>/<tela>__impl.png`.
4. Mantenha um checklist em `docs/frontend/ACHOUIMOVEL_CHECKLIST.md` com as 59 linhas do `SCREENS.md` e o estado de cada uma: pendente, implementada, conferida com print. Só marque "conferida" com a screenshot salva.
5. Texto de interface é copiado exatamente do `.dc.html`, com acentos. Dados (nomes, valores) vêm da API; nas fixtures, use os mesmos valores das telas.

## Decisões fixas
- Portal **nacional**. Cidade aproximada por IP só no cliente, sobre HTML genérico em cache (ADR).
- **Portais parceiros integrados** (Canal Pro = ZAP + VivaReal, OLX, Imovelweb) em **todos** os planos, inclusive Anunciante. Asaas, Clicksign e Serasa/SPC aparecem como "em breve · modo de teste" enquanto não estiverem no ar.
- Portal: `tokens/achouimovel-portal.css` + Guton (`next/font/local`, arquivos em `tokens/fonts`). Blocos coloridos com grade permitidos. Sem caixa alta, gradiente ou sombra pesada.
- **Gestão e área do cliente mantêm o visual atual** (`packages/ui/src/styles/tokens.css`, Inter, `#41945D`, `peg-card`, `peg-btn`, `peg-badge`, app-frame de 14px, sidebar de 240px). Só entram as mudanças e telas novas mostradas. Renomeie `--aluguei-brand*` → `--brand-*` mantendo valores e deixando alias.
- Sidebar da gestão: exatamente `telas/gestao/Painel Sidebar.dc.html` (grupos, ordem, ícones, contadores, "Novo" em Negociações, cadeado por plano).
- Marca: portal "Achou" `#111111` + "Imóvel" na cor da seção; gestão selo "A" + "AchouImóvel Gestão" via `BRAND.b2bName`.
- Preço de plano nulo → "Fale com a gente". Preços serão definidos depois.
- Telas marcadas **Novo** exigem backend: crie contracts, domínio, rotas e migrations junto, nos padrões do repositório.
- IA sempre sugere; nada é salvo sem confirmação da pessoa.

## Orquestração
Um PR por onda, cada um com os gates do repositório (9 gates com exit 0 sem cache; test:pg e Playwright sem teste removido ou pulado). Use subagentes em paralelo por área quando não houver dependência. Cada subagente recebe só as linhas do `SCREENS.md` da sua área, os prints, os `.dc.html` correspondentes e estas regras. O orquestrador revisa cada tela contra o print antes de aceitar.

- **Onda 0 · diagnóstico (só leitura, pare para aprovação):** para cada uma das 59 linhas do `SCREENS.md`, diga a rota atual (se existe), componentes existentes, endpoints e DTOs disponíveis e o que falta no backend. Entregue `docs/frontend/ACHOUIMOVEL_PLAN.md` e o checklist vazio.
- **Onda 1 · fundação:** `apps/portal` (Next 16.3.4) conforme `PROMPT_apps-portal.md`, tokens e fontes do portal, componentes base do portal (SiteHeader, SiteFooter, Logotipo, ImovelCard, Breadcrumb, Botao, Campo, Checkbox LGPD, Chip, Segmentado, Gaveta, FAQ, BlocoGrade, EstadoVazio). Gestão: rebrand, alias de tokens, sidebar nova, cadeado e tela de upgrade, AvisoModoTeste. Página `/dev/componentes` com todos os estados. Telas: `portal/00-identidade` (componentes) e `gestao/01`, `gestao/02`.
- **Onda 2 · portal público:** `portal/01` a `portal/08` e `portal/13`, `portal/14`.
- **Onda 3 · B2B e conta:** `portal/09` a `portal/12` e `conta/01` a `conta/09`.
- **Onda 4 · gestão, ajustes:** `gestao/03`, `04`, `07`, `08`, `12` a `18`.
- **Onda 5 · gestão, telas novas:** `gestao/05`, `06`, `09`, `10`, `11`, `19`, `20`, `21`.
- **Onda 6 · área do cliente:** `cliente/01` a `cliente/07`.

## Aceite de cada onda
1. Todas as telas da onda "conferidas com print" no checklist, com a screenshot salva.
2. Estados vazio, carregando, erro e sem permissão onde a tela tem dados.
3. Contraste 4,5:1, foco visível, alvos de toque ≥ 44px no celular, `prefers-reduced-motion`.
4. Portal: HTML sem rua, número, complemento, CEP, coordenadas, proprietário ou `storage_key` (teste Playwright).
5. Estatística só com amostra ≥ 5. Recursos em teste sempre com AvisoModoTeste.
6. Nenhum `force-dynamic` nas páginas públicas.

No fim de cada onda: PR com resumo, as screenshots `__impl` ao lado dos prints e a lista do que depende do dono (logos dos portais parceiros, CNPJ do rodapé, preços dos planos).
