# Tarefa: implementar o front do AchouImóvel a partir do pacote de design

Contexto base: `AGENTS.md`, `docs/EXECUTION_STATE.md`, `PROMPT_apps-portal.md` e **`design-source/achouimovel/`** (leia `README.md`, `docs/HANDOFF.md` e `docs/CONTEXTO_CLAUDE_DESIGN_AchouImovel.md` antes de tudo). Não leia `docs/audits/**`.

As telas em `design-source/achouimovel/telas/**` são a fonte da verdade visual. Abra cada uma no navegador (Playwright) antes de implementar a tela correspondente e compare com screenshot ao final. Não invente campo, dado, texto ou funcionalidade que não esteja na tela ou no domínio.

## Decisões que valem sobre qualquer documento anterior
1. Portal **nacional**. Home usa cidade aproximada por IP (header do proxy/edge, sem cookie, sem permissão) só como camada client-side sobre HTML genérico em cache. Registrar como ADR.
2. **Portais parceiros integrados** (Canal Pro = ZAP + VivaReal, OLX, Imovelweb) em todos os planos, inclusive ANUNCIANTE. Na UI aparecem como "Conectado/Integrado". Asaas, Clicksign e Serasa/SPC seguem "em breve · modo de teste" enquanto `IMPLEMENTED_NOT_LIVE_VERIFIED`.
3. Portal pode usar **blocos coloridos com grade** (tokens `--tipo-*` e `.bloco-grade`). Sem caixa alta, sem gradiente, sem sombra pesada.
4. **Gestão mantém o visual atual** (`packages/ui/src/styles/tokens.css`, Inter, `#41945D`). Só entram: marca AchouImóvel Gestão, grupo Vendas, cadeado por plano, telas novas e ajustes listados no HANDOFF. Renomear `--aluguei-brand*` → `--brand-*` mantendo os valores (alias temporário para não quebrar).
5. Portal fala com o consumidor final. Nome e CRECI de quem anuncia só no anúncio e na vitrine.
6. Logotipo do portal: "Achou" `#111111` + "Imóvel" na cor da seção (acento na Home e páginas gerais; `--tipo-*` nas páginas de cada tipo; branco sobre bloco colorido). Gestão: selo "A" + "AchouImóvel Gestão" via `BRAND.b2bName`.
7. Preços dos planos: `monthly_price_cents` nulo → "Fale com a gente".
8. Telas marcadas **Novo** (venda, exclusividade, negociações, contrato de venda, painel de vendas, plano e uso, cadastro por voz com revisão) exigem backend: crie contracts, domínio, rotas e migrations junto, seguindo os padrões do repositório.

## Orquestração
Trabalhe em ondas. Cada onda é um PR com gate próprio (9 gates com exit 0 sem cache; test:pg e Playwright sem teste removido ou pulado). Ao final de cada onda: screenshots desktop 1440 e celular 390 de cada tela em `docs/audits/<data>/evidence/front/<onda>/`, comparação com a tela de referência, `docs/EXECUTION_STATE.md` atualizado e lista de pendências.

Use subagentes em paralelo por área quando não houver dependência (ex.: onda 2 portal e onda 5 gestão podem correr juntas depois da onda 1). Cada subagente recebe: a lista de telas da sua área (seção do HANDOFF), os arquivos de referência, os tokens e as regras acima. O agente orquestrador revisa, integra e roda os gates.

### Onda 0 · diagnóstico (somente leitura, pare e aguarde aprovação)
Mapeie cada linha do "Mapa de telas" do HANDOFF para: rota atual (se existir), componentes existentes em `packages/ui`, endpoints e DTOs disponíveis, e o que falta no backend. Entregue `docs/frontend/ACHOUIMOVEL_PLAN.md` com ondas, arquivos tocados, componentes novos (nome em PascalCase igual ao HANDOFF), dependências novas com justificativa e riscos.

### Onda 1 · fundação
- `apps/portal` (Next 16.3.4) conforme `PROMPT_apps-portal.md` Etapa 4, com `tokens/achouimovel-portal.css` e Guton em `apps/portal/public/fonts` (via `next/font/local`).
- Componentes base do portal: SiteHeader, SiteFooter, Logotipo (prop `cor`), ImovelCard (variantes), Breadcrumb, Botao, Campo, Checkbox LGPD, Chip, Segmentado, Gaveta, Acordeao/FAQ, BlocoGrade, EstadoVazio.
- Gestão: rebrand (`BRAND`), alias de tokens, `Painel Sidebar` com grupo Vendas e cadeado por módulo (prop de plano vinda do backend), tela de upgrade, AvisoModoTeste.
- Storybook ou página `/dev/componentes` com todos os estados.

### Onda 2 · portal público
Home, Busca (com anúncios, poucos, vazia, gaveta de filtros), Anúncio (aluguel, venda, ambos, barra fixa no celular, estados do FormContato), Indisponível, Vitrine, Alerta (criar, confirmar, cancelar), Mapa do site, 404. SEO, JSON-LD, cache por tag e limiares exatamente como `PROMPT_apps-portal.md`.

### Onda 3 · B2B e conta
`/para-imobiliarias/`, `/anunciar/`, `/gestao/`, `/planos/` (lê view pública de plans), e em `apps/web`: login, cadastro em 6 etapas com `?plano=`, convite, esqueci/redefinir senha, conta em análise e suspensa.

### Onda 4 · gestão: ajustes nas telas existentes
Visão Geral (Demanda por bairro), diálogo de publicação com 4 canais e bloqueios, Pipeline com funil Aluguel/Venda e origem, Integrações, Cobrança e split com modo de teste, limite de contratos (409), envelope de locação em modo de teste, análise cadastral com aviso, Fotos e legendas (caption, IA sugerida, EXIF), Plano e uso, fila de aprovação da plataforma com plano pedido.

### Onda 5 · gestão: telas novas
Cadastro com finalidade e valores de venda, exclusividade de venda, Negociações (board + gaveta com histórico, documentação e comissão), contrato de compra e venda com envelope, painel de vendas do mês, cadastro por áudio e fotos (captura no celular, processamento, revisão com transcrição ligada aos campos e estados do áudio/das fotos/confirmar/faltando/editado). IA sempre sugere; nada é salvo sem confirmação.

### Onda 6 · área do cliente e celular
Entrada por link de uso único (pedir, enviado, expirado), inquilino (início, Pix com modo de teste, contrato e vistoria), proprietário (extrato, histórico de repasses). Versões de celular da gestão (Visão Geral, negociação).

## Critérios de aceite de todas as ondas
1. Cada tela bate com a referência em desktop 1440 e celular 390 (diferença visual revisada e justificada no PR).
2. Estados vazio, carregando, erro e sem permissão implementados onde a tela tem dados.
3. Acessibilidade: contraste 4,5:1, foco visível, alvos de toque ≥ 44px no celular, ícones com rótulo, `prefers-reduced-motion`.
4. Portal: HTML sem rua, número, complemento, CEP, coordenadas, proprietário ou `storage_key` (teste Playwright).
5. Nenhum número inventado: estatística só com amostra ≥ 5; recursos em teste sempre com AvisoModoTeste.
6. Nenhum `force-dynamic` nas páginas públicas; nenhum teste removido ou pulado.

Ao terminar cada onda, abra o PR com resumo, screenshots e a lista do que depende do dono (logos dos portais parceiros, CNPJ do rodapé, preços dos planos).
