# AchouImóvel · entrega de design para o Claude Code

Data: 22/09/2026. Números nas telas são fictícios. Textos de interface são finais (pt-BR).

## Como abrir

Cada `*.dc.html` abre direto no navegador (precisa do `support.js`, da pasta `fonts/` e do `Painel Sidebar.dc.html` ao lado). São referência visual e de comportamento, não código de produção.

## Regras que mudaram em relação ao contexto original

1. Portal **nacional**. A Home usa a cidade aproximada do visitante (IP, sem cookie, sem permissão) no H1 e no campo Cidade; o HTML em cache e o que o Google lê fica genérico: "Ache onde morar, em qualquer cidade do Brasil."
2. **Portais parceiros integrados** (Canal Pro = ZAP + VivaReal, OLX, Imovelweb) em todos os planos, inclusive Anunciante. Asaas, Clicksign e Serasa/SPC continuam "em breve".
3. **Blocos coloridos com grade** são permitidos no portal (ver tokens). Sem caixa alta.
4. **Gestão mantém o visual do painel no ar** (`packages/ui/src/styles/tokens.css`, Inter, #41945D). Só muda: marca, grupo Vendas, cadeado por plano, telas novas.
5. Portal fala com o consumidor final. Nome e CRECI de quem anuncia aparecem só no anúncio e na vitrine.
6. Logotipo: "Achou" em #111111 + "Imóvel" na cor da seção (acento na Home e páginas gerais; cor do tipo nas páginas de cada tipo; tudo branco sobre bloco colorido). Na gestão: selo "A" verde + "AchouImóvel Gestão".
7. Preços dos planos: "Fale com a gente" até a definição (`monthly_price_cents` nulo).

## Arquivos

- `tokens/achouimovel-portal.css` — tokens do portal prontos para `apps/portal`.
- `CONTEXTO_CLAUDE_DESIGN_AchouImovel.md` — contexto atualizado com as regras acima.
- Telas (na raiz do projeto): ver mapa abaixo.

## Mapa de telas

### Portal (`apps/portal`, fonte Guton)

| Tela               | Rota                                             | Arquivo · âncora                                                                             | Componentes                                                                                                                                                                                                                          | Dados                                                                             |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Home               | `/`                                              | AchouImovel Portal · home-desktop, home-mobile                                               | SiteHeader, SearchHero (Alugar/Comprar), MosaicoTipos, ImovelCard, CidadesComMaisImoveis, FaixaAlerta, BuscasPopulares, SiteFooter                                                                                                   | page_stats por cidade, listings recentes, cidade por IP                           |
| Busca              | `/alugar/[...seg]`, `/comprar/[...seg]`          | AchouImovel Portal - Busca · busca-desktop, busca-poucos, busca-vazia, busca-mobile          | FaixaTipo, Breadcrumb, FiltrosLaterais / GavetaFiltros, ChipsFiltro, Ordenacao, ResumoPreco, ImovelCard, Paginacao, BairrosProximos, LinksModificadores, FaqCalculado, AlertaImovel                                                  | page_stats (≥5 para estatística; ≥3 para index; ≥5 com modificador), geo.vizinhos |
| Anúncio            | `/imovel/[slug]`                                 | AchouImovel Portal - Anuncio · anuncio-aluguel, anuncio-venda, anuncio-ambos, anuncio-mobile | GaleriaImovel, CabecalhoAnuncio, AtributosImovel, DescricaoImovel, Caracteristicas, LocalBairro, ComparacaoMediana, AnuncianteInfo, BlocoValor (aluguel/venda/ambos), FormContato, BotaoWhatsApp, OutrosNoBairro, BarraContatoMobile | portal.listings, listing_images, page_stats do bairro                             |
| Estados do contato | —                                                | AchouImovel Portal - Complementos · contato-estados                                          | FormContato: erro, enviando, enviado, falha/429                                                                                                                                                                                      | POST /public/listings/:id/leads                                                   |
| Indisponível       | `/imovel/[slug]` (410/301)                       | AchouImovel Portal - Outras · indisponivel; Complementos · celular-secundarias               | AvisoIndisponivel, ImovelCard                                                                                                                                                                                                        | portal.removed                                                                    |
| Vitrine            | `/imobiliaria/[orgSlug]`                         | Outras · vitrine                                                                             | CabecalhoVitrine, FiltroFinalidade, ImovelCard                                                                                                                                                                                       | listings por org                                                                  |
| Alerta             | modal + `/alerta/confirmado`, `/alerta/cancelar` | Outras · alerta                                                                              | AlertaForm, AlertaConfirmar, AlertaCancelar                                                                                                                                                                                          | portal.search_alerts                                                              |
| Mapa do site / 404 | `/mapa-do-site`, 404                             | Outras · mapa, erro404                                                                       | SeletorUF, ListaLinks                                                                                                                                                                                                                | só páginas indexáveis                                                             |
| Para imobiliárias  | `/para-imobiliarias/`                            | AchouImovel Portal - Para imobiliarias · b2b-home                                            | HeroB2B, CanaisIntegrados, FluxoSistema, DoisCaminhos                                                                                                                                                                                | —                                                                                 |
| Planos             | `/planos/`                                       | Para imobiliarias · planos                                                                   | TabelaPlanos, FaqPlanos (FAQPage)                                                                                                                                                                                                    | view pública de plans                                                             |
| Anunciar           | `/para-imobiliarias/anunciar/`                   | Complementos · anunciar                                                                      | HeroPlano, ListaBeneficios, CardPlano                                                                                                                                                                                                | —                                                                                 |
| Gestão por módulo  | `/para-imobiliarias/gestao/`                     | Complementos · gestao                                                                        | HeroPlano, ListaModulos (No ar / Em breve)                                                                                                                                                                                           | —                                                                                 |

### Entrada e conta (`apps/web`, visual do portal)

| Tela                        | Rota                                 | Âncora em AchouImovel Conta |
| --------------------------- | ------------------------------------ | --------------------------- |
| Login com erro              | `/login`                             | login                       |
| Cadastro 6 etapas           | `/register?plano=`                   | cad1, cad5, cad-mobile      |
| Convite                     | `/convite`                           | convite                     |
| Esqueci / redefinir senha   | `/esqueci-senha`, `/redefinir-senha` | esqueci, redefinir          |
| Conta em análise / suspensa | `/situacao-da-conta`                 | analise, suspensa           |

### Gestão (`apps/web`, tokens atuais)

| Tela                       | Rota                                           | Arquivo · âncora                                                      | O que muda                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar                    | shell                                          | Painel Sidebar                                                        | Marca AchouImóvel Gestão; grupo Vendas › Negociações (Novo); cadeado nos itens fora do plano (`plano=anunciante`)                                                                                                                                                                                        |
| Visão Geral                | `/app`                                         | AchouImovel Gestao · visao                                            | Card "Demanda por bairro" (Novo), linha de falha de canal na fila                                                                                                                                                                                                                                        |
| Módulo bloqueado           | qualquer rota fora do plano                    | Gestao · upgrade                                                      | Tela "Fora do seu plano" + CTA; 403 PLAN_MODULE_NOT_INCLUDED                                                                                                                                                                                                                                             |
| Diálogo de publicação      | `/app/listings`                                | Gestao · publicar, publicar-bloq                                      | 4 canais pré-marcados; motivos de bloqueio (fotos < 5, bairro, CRECI)                                                                                                                                                                                                                                    |
| Cadastro · Valores         | `/app/properties/new`                          | Gestao · valores                                                      | Finalidade, venda (Novo), exclusividade (Novo), sugestão de IA aceitar/editar/descartar                                                                                                                                                                                                                  |
| Negociações                | `/app/vendas/negociacoes` (Novo)               | Gestao · negociacoes                                                  | Board + gaveta com histórico, documentação, comissão captador/vendedor                                                                                                                                                                                                                                   |
| Pipeline                   | `/app/crm/pipeline`                            | Gestao - Complementos · pipeline                                      | Alternância Aluguel / Venda (Novo); etiqueta de origem por lead                                                                                                                                                                                                                                          |
| Integrações                | `/app/admin/integrations`                      | Complementos · integracoes                                            | Portais conectados; Asaas/Clicksign/Serasa "em breve"                                                                                                                                                                                                                                                    |
| Contrato de venda          | `/app/vendas/negociacoes/[id]/contrato` (Novo) | Complementos · contrato-venda                                         | Modelo versionado + envelope com linha do tempo                                                                                                                                                                                                                                                          |
| Painel de vendas           | `/app/vendas` (Novo)                           | Complementos · painel-vendas                                          | KPIs do mês, fechamentos, comissão por corretor                                                                                                                                                                                                                                                          |
| Celular                    | —                                              | Complementos · gestao-mobile                                          | Visão Geral e negociação com barra de ação fixa                                                                                                                                                                                                                                                          |
| Cobrança e split           | `/app/charges/[id]`                            | AchouImovel Gestao - Ajustes · financeiro                             | Faixa "Modo de teste" do Asaas, split por coproprietário e taxa, "Emitir cobrança real" desativado                                                                                                                                                                                                       |
| Limite de contratos        | ativar locação                                 | Ajustes · limite                                                      | Diálogo 409 com uso 100 de 100 e "Pedir plano maior"                                                                                                                                                                                                                                                     |
| Envelope da locação        | `/app/contracts/[id]`                          | Ajustes · contrato-locacao                                            | Selo "Modo de teste" do Clicksign; status "Assinou (teste)"                                                                                                                                                                                                                                              |
| Análise cadastral          | `/app/screening/[id]`                          | Ajustes · analise                                                     | Aviso Serasa/SPC em breve; regra de crédito marcada "em breve"                                                                                                                                                                                                                                           |
| Fotos e legendas           | `/app/properties/new` (etapa 5)                | Ajustes · fotos                                                       | Campo caption, sugestão de IA, pública no portal, contagem mínima de 5, aviso de EXIF removido                                                                                                                                                                                                           |
| Plano e uso                | `/app/settings/plano` (novo)                   | Ajustes · plano-uso                                                   | Plano atual, uso contra limites (activeLeases), módulos incluídos, pedir troca                                                                                                                                                                                                                           |
| Cadastro por áudio e fotos | `/app/properties/new?modo=audio` + app         | AchouImovel Gestao - Cadastro por voz · captura, processando, revisao | Captura no celular (áudio + fotos), processamento em etapas, revisão com transcrição ligada aos campos; estados de campo: do áudio, das fotos, confirmar, faltando, editado; legenda e descrição sugeridas com aceitar/editar/descartar; endereço marcado como privado; foto com placa de rua sinalizada |
| Aprovação de imobiliárias  | `/plataforma/imobiliarias`                     | Ajustes · plataforma                                                  | Coluna "Plano pedido" e plano pré-selecionado na aprovação                                                                                                                                                                                                                                               |

### Área do cliente (`apps/web`, tokens atuais)

| Tela                    | Rota                        | Âncora em AchouImovel Area do Cliente |
| ----------------------- | --------------------------- | ------------------------------------- |
| Pedir link              | `/portal/entrar`            | entrar                                |
| Link enviado / expirado | `/portal/entrar`            | link-enviado                          |
| Inquilino início        | `/inquilino`                | inquilino                             |
| Pagar com Pix           | `/inquilino/cobrancas/[id]` | pix                                   |
| Contrato e vistoria     | `/inquilino`                | inq-docs                              |
| Proprietário            | `/proprietario`             | proprietario, prop-desktop            |

## Inventário de componentes do portal

- **SiteHeader** — 64px desktop / 56px celular (grade 44px · 1fr · 44px). Logotipo, Alugar, Comprar, Cidades, "Anunciar imóvel". Variante B2B com Entrar + Começar.
- **SearchHero** — abas Alugar/Comprar (filete 2px #111), campos Cidade (pré-preenchida pelo IP), Bairro, Tipo, Valor total até; botão em acento. Borda 1px #111, raio 4.
- **MosaicoTipos** — 7 blocos quadrados na cor do tipo com grade 34px; contagem + nome. ≥1180px numa linha; abaixo, carrossel com scroll-snap (128px).
- **ImovelCard** — foto 4:3 cover raio 4 + contador; quadrado 10px do tipo + tipo · bairro, cidade · UF; valor em acento (aluguel: total/mês; venda: preço; ambos: aluguel "ou" venda); linha de valores separados; atributos. Card inteiro é o link. Variantes: listagem, compacto, parecido.
- **FaixaTipo** — faixa cheia na cor do tipo com grade 56px, trilha + H1 com contagem em branco.
- **FiltrosLaterais / GavetaFiltros** — finalidade (segmentado), tipo com quadrado de cor e contagem, quartos (1·2·3·4+), valor total até (slider), características. No celular: gaveta cheia com "Ver N imóveis" fixo.
- **ResumoPreco** — mediana do total, faixa, mediana por quartos. Some com amostra < 5.
- **BairrosProximos / LinksModificadores / FaqCalculado** — listas com filete; FAQ com um aberto por vez e FAQPage só com todos os dados.
- **AlertaImovel** — chips da busca, e-mail ou WhatsApp, consentimento obrigatório, erro inline. Estados: criado (confirmar e-mail), ativo, cancelar.
- **BlocoValor** — aluguel (total 48px + aluguel/cond./IPTU), venda (preço + m² + cond./IPTU + mediana m²), ambos (duas colunas + "Você tem interesse em").
- **FormContato** — nome, telefone, mensagem pré-preenchida, consentimento LGPD. Estados: erro de campo, enviando, enviado, falha/429.
- **BarraContatoMobile** — fixa no rodapé: valor + WhatsApp + Mensagem, alvos ≥44px.
- **LocalBairro** — mapa aproximado por bairro, sem endereço.
- **SiteFooter** — fundo #F4F4F2, 3 colunas de links, bloco da marca em verde com grade, links legais sublinhados, razão social e versão. Celular: bloco da marca + acordeão.

## Pendências do dono

- Preços e limites dos planos.
- CNPJ real no rodapé.
- Logos dos portais parceiros e ícones das redes sociais.
- Registrar a detecção de cidade por IP no prompt do PR A.
