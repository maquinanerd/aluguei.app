# SCREENS · índice de todas as telas

Cada linha = 1 imagem em `prints/` (verdade visual) + o trecho de origem em `telas/` (valores exatos: px, cores, textos, estão escritos inline no HTML do template). Implemente olhando os dois.

| # | Área | Print | Rota | Origem (arquivo#âncora) | O que é |
|---|---|---|---|---|---|
| 01 | portal | `prints/portal/00-identidade.png` | `—` | `telas/portal/00-identidade.dc.html` | Referência de marca, tokens, cores por tipo, status, componentes base |
| 02 | portal | `prints/portal/01-home__desktop.png` | `/` | `telas/portal/01-home.dc.html#home-desktop` | Home nacional, busca, mosaico de tipos em blocos com grade, cidades |
| 03 | portal | `prints/portal/01-home__mobile.png` | `/` | `telas/portal/01-home.dc.html#home-mobile` | Home 390 |
| 04 | portal | `prints/portal/02-busca__desktop.png` | `/alugar/{uf}/{cidade}/{bairro}/{tipo}/` | `telas/portal/02-busca.dc.html#busca-desktop` | Listagem com filtros laterais, ordenação, paginação, texto SEO, FAQ |
| 05 | portal | `prints/portal/02-busca__poucos.png` | `idem · < 6 anúncios` | `telas/portal/02-busca.dc.html#busca-poucos` | Estado com poucos resultados + sugestão de bairros vizinhos |
| 06 | portal | `prints/portal/02-busca__vazia.png` | `idem · 0 anúncios` | `telas/portal/02-busca.dc.html#busca-vazia` | Estado vazio + criar alerta (noindex) |
| 07 | portal | `prints/portal/02-busca__mobile.png` | `idem` | `telas/portal/02-busca.dc.html#busca-mobile` | Busca 390 com gaveta de filtros |
| 08 | portal | `prints/portal/03-anuncio__aluguel-desktop.png` | `/imovel/{slug}-{id}` | `telas/portal/03-anuncio.dc.html#anuncio-aluguel` | Anúncio de aluguel completo |
| 09 | portal | `prints/portal/03-anuncio__bloco-venda.png` | `idem · venda` | `telas/portal/03-anuncio.dc.html#anuncio-venda` | BlocoValor variante venda |
| 10 | portal | `prints/portal/03-anuncio__bloco-ambos.png` | `idem · aluguel e venda` | `telas/portal/03-anuncio.dc.html#anuncio-ambos` | BlocoValor variante ambos |
| 11 | portal | `prints/portal/03-anuncio__mobile.png` | `idem` | `telas/portal/03-anuncio.dc.html#anuncio-mobile` | Anúncio 390 com barra fixa |
| 12 | portal | `prints/portal/04-indisponivel.png` | `/imovel/{slug} · 410` | `telas/portal/04-outras.dc.html#indisponivel` | Anúncio removido + semelhantes |
| 13 | portal | `prints/portal/05-vitrine.png` | `/anunciante/{slug}` | `telas/portal/04-outras.dc.html#vitrine` | Vitrine do anunciante |
| 14 | portal | `prints/portal/06-alerta.png` | `/alerta/*` | `telas/portal/04-outras.dc.html#alerta` | Criar, confirmar, cancelar alerta |
| 15 | portal | `prints/portal/07-mapa-do-site.png` | `/mapa-do-site` | `telas/portal/04-outras.dc.html#mapa` | Índice UF → cidade → bairro |
| 16 | portal | `prints/portal/08-erro404.png` | `404` | `telas/portal/04-outras.dc.html#erro404` | Página não encontrada |
| 17 | portal | `prints/portal/09-para-imobiliarias.png` | `/para-imobiliarias/` | `telas/portal/05-para-imobiliarias.dc.html#b2b-home` | Landing B2B com portais integrados |
| 18 | portal | `prints/portal/10-planos.png` | `/planos/` | `telas/portal/05-para-imobiliarias.dc.html#planos` | Tabela de planos (preço nulo → Fale com a gente) |
| 19 | portal | `prints/portal/11-anunciar.png` | `/para-imobiliarias/anunciar/` | `telas/portal/06-complementos.dc.html#anunciar` | Plano Anunciante |
| 20 | portal | `prints/portal/12-gestao-b2b.png` | `/para-imobiliarias/gestao/` | `telas/portal/06-complementos.dc.html#gestao` | Gestão por módulo |
| 21 | portal | `prints/portal/13-contato-estados.png` | `componente FormContato` | `telas/portal/06-complementos.dc.html#contato-estados` | Enviando, enviado, erro |
| 22 | portal | `prints/portal/14-celular-secundarias.png` | `várias` | `telas/portal/06-complementos.dc.html#celular-secundarias` | 390 das telas secundárias |
| 23 | conta | `prints/conta/01-login.png` | `app./login` | `telas/conta/01-conta.dc.html#login` | Login |
| 24 | conta | `prints/conta/02-cadastro-etapa1.png` | `app./register?plano=` | `telas/conta/01-conta.dc.html#cad1` | Cadastro etapa 1 de 6 |
| 25 | conta | `prints/conta/03-cadastro-etapa5.png` | `app./register` | `telas/conta/01-conta.dc.html#cad5` | Cadastro etapa 5 de 6 |
| 26 | conta | `prints/conta/04-convite.png` | `app./convite/{token}` | `telas/conta/01-conta.dc.html#convite` | Aceitar convite |
| 27 | conta | `prints/conta/05-esqueci-senha.png` | `app./esqueci-senha` | `telas/conta/01-conta.dc.html#esqueci` | Pedir redefinição |
| 28 | conta | `prints/conta/06-redefinir-senha.png` | `app./redefinir-senha` | `telas/conta/01-conta.dc.html#redefinir` | Nova senha |
| 29 | conta | `prints/conta/07-conta-em-analise.png` | `app./conta/em-analise` | `telas/conta/01-conta.dc.html#analise` | Conta aguardando aprovação |
| 30 | conta | `prints/conta/08-conta-suspensa.png` | `app./conta/suspensa` | `telas/conta/01-conta.dc.html#suspensa` | Conta suspensa |
| 31 | conta | `prints/conta/09-cadastro-mobile.png` | `app./register` | `telas/conta/01-conta.dc.html#cad-mobile` | Cadastro 390 |
| 32 | gestao | `prints/gestao/01-visao-geral.png` | `/app` | `telas/gestao/01-painel.dc.html#visao` | Visão Geral + card Demanda por bairro (Novo) + marca AchouImóvel Gestão + grupo Vendas na sidebar |
| 33 | gestao | `prints/gestao/02-upgrade-plano.png` | `/app/* fora do plano` | `telas/gestao/01-painel.dc.html#upgrade` | Cadeado na sidebar + tela de upgrade |
| 34 | gestao | `prints/gestao/03-publicar.png` | `/app/listings · diálogo` | `telas/gestao/01-painel.dc.html#publicar` | Publicar em AchouImóvel, Canal Pro, OLX, Imovelweb |
| 35 | gestao | `prints/gestao/04-publicar-bloqueado.png` | `idem` | `telas/gestao/01-painel.dc.html#publicar-bloq` | Bloqueios de publicação |
| 36 | gestao | `prints/gestao/05-valores-venda-exclusividade.png` | `/app/properties/new · Valores` | `telas/gestao/01-painel.dc.html#valores` | Finalidade, valores de venda, exclusividade (Novo) |
| 37 | gestao | `prints/gestao/06-negociacoes.png` | `/app/vendas/negociacoes` | `telas/gestao/01-painel.dc.html#negociacoes` | Board + gaveta com histórico, documentos, comissão (Novo) |
| 38 | gestao | `prints/gestao/07-pipeline-funis.png` | `/app/crm/pipeline` | `telas/gestao/02-complementos.dc.html#pipeline` | Troca Aluguel/Venda + origem do lead |
| 39 | gestao | `prints/gestao/08-integracoes.png` | `/app/settings/integrations` | `telas/gestao/02-complementos.dc.html#integracoes` | Portais conectados + Asaas/Clicksign/Serasa em breve |
| 40 | gestao | `prints/gestao/09-contrato-venda.png` | `/app/vendas/negociacoes/{id}/contrato` | `telas/gestao/02-complementos.dc.html#contrato-venda` | Contrato de compra e venda + envelope (Novo) |
| 41 | gestao | `prints/gestao/10-painel-vendas.png` | `/app/vendas` | `telas/gestao/02-complementos.dc.html#painel-vendas` | Painel de vendas do mês (Novo) |
| 42 | gestao | `prints/gestao/11-gestao-mobile.png` | `/app (390)` | `telas/gestao/02-complementos.dc.html#gestao-mobile` | Visão Geral e negociação no celular |
| 43 | gestao | `prints/gestao/12-financeiro-split.png` | `/app/finance/charges` | `telas/gestao/03-ajustes.dc.html#financeiro` | Cobrança + split com modo de teste |
| 44 | gestao | `prints/gestao/13-limite-contratos.png` | `erro 409` | `telas/gestao/03-ajustes.dc.html#limite` | Limite de contratos do plano |
| 45 | gestao | `prints/gestao/14-contrato-locacao-assinatura.png` | `/app/contracts/{id}` | `telas/gestao/03-ajustes.dc.html#contrato-locacao` | Envelope de locação em modo de teste |
| 46 | gestao | `prints/gestao/15-analise-cadastral.png` | `/app/credit` | `telas/gestao/03-ajustes.dc.html#analise` | Análise cadastral com aviso |
| 47 | gestao | `prints/gestao/16-fotos-legendas.png` | `/app/properties/{id}/fotos` | `telas/gestao/03-ajustes.dc.html#fotos` | Legenda, sugestão IA, EXIF |
| 48 | gestao | `prints/gestao/17-plano-e-uso.png` | `/app/settings/plano` | `telas/gestao/03-ajustes.dc.html#plano-uso` | Plano e uso (Novo) |
| 49 | gestao | `prints/gestao/18-plataforma-aprovacao.png` | `/platform/tenants` | `telas/gestao/03-ajustes.dc.html#plataforma` | Fila de aprovação com plano pedido |
| 50 | gestao | `prints/gestao/19-voz-captura-mobile.png` | `/app/properties/new?modo=audio` | `telas/gestao/04-cadastro-por-voz.dc.html#captura` | Gravação + fotos (Novo) |
| 51 | gestao | `prints/gestao/20-voz-processando-mobile.png` | `idem` | `telas/gestao/04-cadastro-por-voz.dc.html#processando` | Processamento em etapas |
| 52 | gestao | `prints/gestao/21-voz-revisao-desktop.png` | `idem · revisão` | `telas/gestao/04-cadastro-por-voz.dc.html#revisao` | Transcrição ligada aos campos, estados, fotos, descrição |
| 53 | cliente | `prints/cliente/01-entrar.png` | `app./portal/entrar` | `telas/gestao/05-area-do-cliente.dc.html#entrar` | Pedir link de acesso |
| 54 | cliente | `prints/cliente/02-link-enviado-expirado.png` | `idem` | `telas/gestao/05-area-do-cliente.dc.html#link-enviado` | Link enviado e expirado |
| 55 | cliente | `prints/cliente/03-inquilino-inicio.png` | `app./inquilino` | `telas/gestao/05-area-do-cliente.dc.html#inquilino` | Início do inquilino |
| 56 | cliente | `prints/cliente/04-inquilino-pix.png` | `app./inquilino/cobrancas/{id}` | `telas/gestao/05-area-do-cliente.dc.html#pix` | Pix com modo de teste |
| 57 | cliente | `prints/cliente/05-inquilino-documentos.png` | `app./inquilino/documentos` | `telas/gestao/05-area-do-cliente.dc.html#inq-docs` | Contrato e vistoria |
| 58 | cliente | `prints/cliente/06-proprietario-extrato.png` | `app./proprietario` | `telas/gestao/05-area-do-cliente.dc.html#proprietario` | Extrato e repasse |
| 59 | cliente | `prints/cliente/07-proprietario-desktop.png` | `app./proprietario (desktop)` | `telas/gestao/05-area-do-cliente.dc.html#prop-desktop` | Histórico de repasses |

Total: 59 telas/estados.
