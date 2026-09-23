<!-- Atualizado em 22/09/2026 pela entrega de design: portal nacional, portais parceiros integrados, blocos coloridos permitidos, gestão mantém o visual atual. -->

# Contexto para o Claude Design — AchouImovel

Você vai criar a identidade visual e as telas do AchouImovel. Depois, o Claude Code vai
implementar exatamente o que você desenhar, num monorepo que já existe (Next 16,
TypeScript, PostgreSQL). Por isso, cada tela precisa sair pronta para virar código: com
estados, medidas, tokens e nomes de componentes.

Trabalhe em duas entregas, nesta ordem, e pare entre elas para aprovação:

1. **Avaliação das referências + proposta de identidade** (seções 5 e 6).
2. **Telas** (seção 7), só depois que a identidade for aprovada.

---

## 1. O produto

O AchouImovel é **um produto com dois lados**, no modelo de marketplace. Mesmo banco,
mesma conta, mesma marca.

| Lado                                                        | Para quem                                               | Endereço                         | Nome exibido       | Paga? |
| ----------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- | ------------------ | ----- |
| Portal de anúncios                                          | Quem procura imóvel **para alugar ou comprar**          | `achouimovel.online`             | AchouImovel        | Não   |
| Sistema de gestão (CRM de locação e venda + ERP de locação) | Imobiliárias: gestor, corretor, vistoriador, financeiro | `app.achouimovel.online`         | AchouImovel Gestão | Sim   |
| Área do cliente                                             | Proprietário e inquilino de uma locação                 | `app.achouimovel.online/cliente` | AchouImovel        | Não   |

Como os lados se ligam:

```
Imobiliária cadastra o imóvel → publica no portal (sempre ação manual dela)
  → anúncio aparece nas páginas de busca do portal
  → pessoa pede contato (formulário ou WhatsApp)
  → lead cai no CRM da imobiliária dona do anúncio
  → ALUGUEL: atendimento, visita, proposta, análise cadastral, contrato, assinatura,
    vistoria, locação ativa, cobrança, divisão do valor (split), repasse ao proprietário
  → VENDA: atendimento, visita, proposta de compra e contraproposta, negociação,
    documentação, contrato de compra e venda, assinatura, fechamento e comissão
  → imóvel alugado ou vendido sai do portal
```

A proposta para a imobiliária numa frase: **gerencie seus aluguéis e suas vendas e
receba leads no mesmo lugar.**

Escopo: **aluguel e venda de imóveis usados e prontos.** O mesmo imóvel pode estar à
venda, para alugar ou os dois. Lançamentos de construtora e simulador de financiamento
ficam fora por enquanto. **O portal é nacional**: a busca começa pela cidade e a Home usa a cidade aproximada do visitante (pelo IP, sem cookie) no título e no campo de busca; sem cidade detectada, o texto fica genérico.

### Planos (lado pago)

- **Anunciante**: só anúncios no portal e caixa de leads. Para a imobiliária que já usa
  outro sistema.
- **Gestão**: sistema completo, com o portal incluído, em duas frentes que podem ser
  contratadas juntas ou separadas (proposta a validar, no modelo que o mercado usa):
  - **Gestão Locação**: limitada principalmente por **contratos de locação ativos**.
  - **Gestão Vendas**: limitada principalmente por **usuários** (corretores).
- Módulos fora do plano aparecem no menu com cadeado e abrem uma tela de upgrade.

---

## 2. O que o sistema já faz (é isto que as telas de gestão precisam mostrar)

O sistema de gestão **já está construído e funcionando** em homologação, com cerca de
50 telas. A sua tarefa no lado de gestão é **redesenhar e corrigir** a interface, não
inventar funcionalidade. Módulos existentes:

| Módulo                      | O que tem                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Painel inicial              | Alertas, resumo, fila do dia, ciclo de locação, atendimento                                                                                                                                                                         |
| Imóveis                     | Lista densa com abas e contagens, cadastro em modo foco, detalhe, fotos, proprietários com participação percentual, publicação por canal                                                                                            |
| CRM                         | Leads (funil e lista), detalhe do lead com responsável, contatos (pessoas com CPF/CNPJ validado e documentos), tarefas, agenda, visitas (confirmar, reagendar, cancelar com motivo), propostas (validade, envio, recusa, expiração) |
| Atendimento (WhatsApp)      | Caixa de entrada, conversa com o bot, "passar para a equipe" e "devolver ao atendimento automático", conexão e verificação do número                                                                                                |
| Análise cadastral           | Candidatura com autorização LGPD, regras explicáveis, decisão com motivo                                                                                                                                                            |
| Contratos                   | Modelos versionados, contrato em PDF, envelope de assinatura com eventos                                                                                                                                                            |
| Vistoria                    | Ambientes, observações com categoria e severidade, fotos e áudio, sugestões de IA que precisam de confirmação humana, comparação entrada × saída, relatório (também no app de celular)                                              |
| Locações                    | Encargos, coproprietários, reajustar, renovar, encerrar, histórico de alterações                                                                                                                                                    |
| Financeiro                  | Cobranças (multa e juros calculados), pagamentos, split, repasses, conciliação, contabilidade                                                                                                                                       |
| Marketing                   | Campanhas de Meta Ads (sempre nascem pausadas)                                                                                                                                                                                      |
| Relatórios                  | Funil de leads, receita mensal, investimento em anúncios, exportação                                                                                                                                                                |
| Configurações               | Membros e papéis, convites, integrações, situação da conta                                                                                                                                                                          |
| Administração da plataforma | Aprovar, recusar ou suspender imobiliárias; planos                                                                                                                                                                                  |
| Área do cliente             | Proprietário: extratos e repasses. Inquilino: cobranças, pagamento por QR, contrato assinado, vistoria concluída. Acesso por link de uso único                                                                                      |

Rotas atuais do painel (para você mapear cada tela redesenhada à rota que ela substitui):
`/dashboard`, `/app/properties`, `/app/properties/new`, `/app/properties/[id]`,
`/app/listings`, `/app/channels`, `/app/crm/leads`, `/app/crm/leads/[id]`,
`/app/crm/pipeline`, `/app/crm/contacts`, `/app/crm/contacts/[id]`, `/app/crm/tasks`,
`/app/crm/calendar`, `/app/visits`, `/app/proposals`, `/app/inbox`, `/app/screening`,
`/app/screening/[id]`, `/app/contract-templates`, `/app/contracts`, `/app/contracts/[id]`,
`/app/inspections`, `/app/inspections/[id]`, `/app/leases`, `/app/leases/[id]`,
`/app/charges`, `/app/payments`, `/app/payouts`, `/app/reconciliation`, `/app/ledger`,
`/app/finance`, `/app/marketing`, `/app/reporting`, `/app/settings`,
`/app/admin/members`, `/app/admin/integrations`, `/plataforma`, `/plataforma/imobiliarias`,
`/plataforma/planos`, `/situacao-da-conta`, `/proprietario`, `/inquilino`, `/portal/entrar`,
`/login`, `/register`, `/convite`, `/esqueci-senha`, `/redefinir-senha`.

**Venda ainda não existe no sistema.** Hoje o imóvel só tem valores de aluguel e todo o
fluxo depois do lead é de locação. Tudo o que for de venda é **tela nova**: marque essas
telas com a etiqueta "NOVO" na entrega, para o Claude Code saber que precisa criar o
backend junto. O que a venda precisa ter:

- Imóvel com finalidade (aluguel, venda ou os dois) e valores de venda (preço, e
  condomínio e IPTU que já existem).
- Funil de venda separado do funil de aluguel no CRM.
- Proposta de compra com contraproposta e histórico da negociação.
- Checklist de documentação do imóvel e do comprador.
- Contrato de compra e venda (usa os modelos versionados e a assinatura que já existem).
- Fechamento com comissão e divisão entre corretores (captador e vendedor).
- Exclusividade de venda (autorização do proprietário, com prazo).

Problemas conhecidos do painel atual que o redesenho deve resolver:

- A marca "Aluguei.app" está espalhada à mão; o produto agora é AchouImovel Gestão.
- Tokens com o nome da marca (`--aluguei-brand*`); os novos devem ser neutros (`--brand-*`).
- Menu organizado por tabela do banco, não pelo trabalho do dia (o corretor procura
  "meus leads de hoje", não "leads" + "tarefas" + "visitas" em três lugares).
- Não existe controle visual de plano (cadeado e upgrade).
- Estados de vazio, erro, carregamento e sem permissão são inconsistentes.

---

## 3. Regras de produto que o design não pode quebrar

1. **A IA sugere, a pessoa decide.** Nenhuma tela mostra a IA publicando, assinando,
   aprovando crédito, cobrando ou movimentando dinheiro. Toda sugestão de IA tem estado
   "sugerido" e ações "aceitar / editar / descartar".
2. **Publicar é sempre manual.** O canal AchouImovel vem pré-marcado no diálogo de
   publicação, mas a pessoa confirma.
3. **Portais parceiros estão integrados**: Canal Pro (ZAP e VivaReal), OLX e Imovelweb
   aparecem como "Integrado"/"Conectado" em todos os planos, inclusive o Anunciante.
   Publicação, atualização e retirada são sincronizadas e os leads voltam para o CRM.
   **Continuam "em breve"** (modo de teste): cobrança real (Asaas), assinatura real
   (Clicksign) e análise de crédito real (Serasa/SPC).
4. **Privacidade do endereço.** O portal nunca mostra rua, número, complemento, CEP ou
   coordenadas. Mostra bairro e cidade. Mapa, se houver, é aproximado por bairro.
5. **Todo dado do portal vem do anúncio real.** Sem número inventado. Estatísticas de
   preço só aparecem com amostra de pelo menos 5 anúncios; abaixo disso o bloco some.
6. **Confiança:** anúncio publicado mostra nome e CRECI da imobiliária.

---

## 4. Dados disponíveis

### Anúncio no portal (não crie campos além destes)

Finalidade (aluguel, venda ou os dois), tipo, título, descrição. Aluguel: aluguel,
condomínio, IPTU, **valor total mensal**. Venda: **preço**, preço por m² (calculado),
condomínio, IPTU (campos de venda são novos; ver seção 2). Demais: quartos,
suítes, banheiros, vagas, área (m²), mobiliado, aceita pet, características (lista),
bairro, cidade, UF, fotos (mínimo 5, com legenda opcional por foto: "Cozinha",
"Suíte"...), data de publicação, data de atualização, nome, CRECI e slug da imobiliária,
WhatsApp da imobiliária (quando verificado).

### Estatísticas por página de busca (separadas por finalidade)

Contagem de anúncios; no aluguel, mediana/mínimo/máximo do aluguel e do total; na
venda, mediana/mínimo/máximo do preço e mediana do preço por m²; mediana por número de
quartos; bairros vizinhos com contagem e mediana.

### Alerta de imóvel

Quem não acha o que procura pode criar um alerta (cidade, bairro, tipo, filtros,
e-mail ou WhatsApp, com consentimento). A imobiliária vê só números agregados
("demanda por bairro"), nunca o contato.

---

## 5. Referências anexadas — avalie cada uma antes de desenhar

Abra **todos** os arquivos. Para cada um, entregue: o que é, o que aproveitar, o que
evitar e por quê (em relação ao AchouImovel, não em abstrato).

| Arquivo                               | O que é                                                                                                                                                             | Onde olhar com atenção                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `front_opapreco.zip`                  | **Base principal de design.** Sistema completo de outro produto do mesmo dono (site de ofertas OpaPreço): tokens, componentes, rotas, painel admin e protótipo HTML | Leia `README.md`, todos os `docs/` e abra `prototypes/OpaPreço - Site Público (offline).html`. É daqui que vem a linguagem visual |
| `3541157e-...pdf`                     | Home do QuintoAndar                                                                                                                                                 | Busca de aluguel no hero, blocos de serviço, links por cidade e "buscas mais populares"                                           |
| `ada78e0d-...pdf`                     | Home do ZAP Imóveis                                                                                                                                                 | Busca com abas, cards com aluguel + condomínio + IPTU, bairros populares, blog                                                    |
| `b2ff0f6c-...png`                     | Home do VivaReal                                                                                                                                                    | Card de imóvel com valores e atributos, faixa "para corretores e imobiliárias", buscas populares                                  |
| `a3dce984-...pdf`                     | Home da MySide                                                                                                                                                      | Links por cidade e bairro, ferramentas (calculadoras), guias por etapa                                                            |
| `d315eba7-...pdf`                     | Home da Kenlo (concorrente direto do lado de gestão)                                                                                                                | Como apresenta um ecossistema de produtos, FAQ de respostas diretas, prova social                                                 |
| `cmr_kenlo.pdf`                       | Página do CRM da Kenlo                                                                                                                                              | Estrutura de página de produto B2B, tabela de planos com preço público, FAQ longo                                                 |
| `erp.pdf`                             | Página do ERP de locação da Kenlo                                                                                                                                   | Como comunica cobrança, repasse, DIMOB/NF-e e planos por contratos administrados                                                  |
| `4becd22b-...pdf` e `f29d7e6c-...pdf` | Página da LYA SDR (Kenlo), atendimento com IA no WhatsApp — os dois arquivos são a mesma página                                                                     | Como explica o fluxo do primeiro atendimento até o lead qualificado                                                               |
| `cd80519d-...pdf`                     | Página do LYA Omnichannel (Kenlo), WhatsApp dentro do CRM                                                                                                           | Caixa de entrada, passagem da IA para a equipe                                                                                    |
| `ca94be27-...pdf`                     | Página do LYA Editor (Kenlo), descrição de imóvel com IA                                                                                                            | Fluxo "sugerir, revisar, aprovar"                                                                                                 |
| `b945b9e4-...pdf`                     | Página do LYA Studio (Kenlo), ambientação de fotos com IA                                                                                                           | Galeria e criação sob demanda                                                                                                     |
| `77dde5e0-...pdf`                     | Formulário de cadastro da Kenlo (6 passos) com oferta de implantação                                                                                                | Fluxo de cadastro em etapas curtas                                                                                                |

**Atenção ao usar a Kenlo:** use como referência de conteúdo e estrutura, não de visual.
**Blocos coloridos são permitidos** no portal: bloco cheio na cor do tipo de imóvel ou do
acento, com grade branca de 1px a 14–16% (identidade Oficina Conectada), em mosaico de tipos,
faixa de topo da busca, hero de páginas B2B e bloco da marca no rodapé. O restante do fundo é
branco. Sem caixa alta, sem gradiente, sem sombra pesada.

---

## 6. Direção de identidade (entrega 1)

A base é a linguagem do OpaPreço (zip). Adapte, não copie: o OpaPreço vende ofertas; o
AchouImovel ajuda alguém a achar onde morar e ajuda imobiliárias a administrar aluguel.

### Portal público — partir destas regras do OpaPreço

- Fundo branco puro `#FFFFFF`, muito respiro, divisórias de 1px, sem sombra, sem
  gradiente. No máximo um segundo fundo claro para blocos atrás de foto e faixas
  (o OpaPreço usa `#F4F2EF`; avalie se funciona para imóvel ou se um cinza neutro é melhor).
- Manrope em tudo (portal e gestão), pesos 400 a 800, títulos com espaçamento negativo,
  sem caixa alta, sem emoji.
- **Uma cor de acento só**, usada apenas no valor (aluguel/total ou preço de venda), no botão principal
  ("Falar com a imobiliária" / "Chamar no WhatsApp") e em links de texto. Proponha a cor
  do AchouImovel (pode partir do terracota `#C2410C` do OpaPreço ou propor outra, com
  justificativa e contraste mínimo 4.5:1).
- O sistema de "cor por nicho" do OpaPreço vira **cor por tipo de imóvel** (apartamento,
  casa, casa de condomínio, kitnet/studio, e os que você julgar necessários): quadrado
  marcador antes do tipo, filete no menu, bloco no mosaico da home, faixa no topo da
  página de busca. Nunca como fundo de card nem em texto corrido. A cor nunca é o único
  indicador: sempre acompanha o nome.
- Decida sobre cantos: o OpaPreço usa raio 0. Avalie se mantém raio 0 no portal ou se
  um raio pequeno funciona melhor para fotos de imóvel; justifique.
- Foto de imóvel é o oposto de foto de produto: ocupa o quadro inteiro (`cover`), não
  `contain`. Adapte a regra.

### Gestão — partir do painel do OpaPreço

- Linguagem de painel denso inspirada no Vibe Design System (monday.com), como está em
  `docs/01-tokens.md` do zip: fundo `#F6F7FB`, superfícies brancas, bordas `#E6E9EF`,
  primária `#0073EA`, pílulas de status coloridas, board e tabela.
- Adapte as cores de status aos estados reais do sistema (anúncio, lead, visita,
  proposta, negociação de venda, contrato, vistoria, locação, cobrança, repasse). Liste
  cada estado e a cor.
- Menu lateral de 238px com grupos por trabalho, contadores, busca e usuário no rodapé.

### O que a entrega 1 precisa ter

1. Avaliação de cada referência (tabela: arquivo → aproveitar → evitar → motivo).
2. Logotipo em texto "AchouImovel" e a variação "AchouImovel Gestão", em fundo branco.
3. Tokens do portal e da gestão em tabela (cor, tipografia, espaçamento, raio,
   breakpoints), com nomes neutros (`--brand-*`, `--portal-*`, `--app-*`).
4. Cores por tipo de imóvel com cor de texto sobre cada uma.
5. Cores de todos os status do sistema.
6. Três componentes de amostra aplicados: card de imóvel do portal, linha de tabela
   de leads da gestão, pílula de status.

**Pare aqui e aguarde aprovação.**

---

## 7. Telas (entrega 2, depois da aprovação)

Para cada tela: desktop 1440px e celular 390px, e os estados vazio, carregando, erro e
sem permissão quando se aplicarem. Celular não é o desktop empilhado: menu em gaveta,
filtros em gaveta, botão de contato fixo no rodapé do anúncio, alvos de toque de 44px.

### 7.1 Portal (`achouimovel.online`)

1. **Home**: busca com abas **Alugar** e **Comprar** (cidade, bairro, tipo, faixa de
   valor), mosaico de tipos, imóveis recentes das duas finalidades, bairros mais
   procurados com contagem, faixa "Para imobiliárias".
2. **Página de busca**, uma para cada finalidade com a mesma estrutura
   (`/alugar/goiania-go/setor-bueno/apartamento/2-quartos` e
   `/comprar/goiania-go/setor-bueno/apartamento/2-quartos`): H1 com contagem ("48
   apartamentos para alugar no Setor Bueno, Goiânia, GO" / "31 apartamentos à venda no
   Setor Bueno, Goiânia, GO"), filtros, lista
   de cards, resumo de preço (mediana e faixa, por quartos), bairros próximos com
   contagem e mediana, links para filtros do mesmo bairro, breadcrumb, FAQ calculado,
   alerta de imóvel. Desenhe também a **versão com poucos anúncios** (sem estatística,
   com bairros vizinhos e alerta em destaque) e a **versão sem nenhum anúncio**.
3. **Página do anúncio** (`/imovel/{slug}`), em três variações: **aluguel** (valores
   separados e total mensal em destaque), **venda** (preço em destaque, preço por m²,
   condomínio e IPTU) e **os dois** (as duas opções lado a lado, com o botão de contato
   perguntando o interesse). Em todas: galeria com legendas, atributos, características, bairro e cidade (sem
   endereço), publicado/atualizado em, imobiliária com CRECI e link para a vitrine,
   formulário de contato com consentimento LGPD, botão de WhatsApp, "outros imóveis no
   bairro", comparação com a mediana do bairro (só com amostra suficiente). No
   celular, barra fixa com o valor e o botão de contato.
4. **Anúncio indisponível** (imóvel já alugado ou vendido): mensagem e imóveis parecidos no bairro.
5. **Vitrine da imobiliária** (`/imobiliaria/{slug}`): nome, CRECI, anúncios.
6. **Alerta de imóvel**: criação, confirmação por e-mail, descadastro.
7. **Para imobiliárias** (`/para-imobiliarias/`), **Anunciar** (plano Anunciante),
   **Gestão Locação** e **Gestão Vendas** (o sistema por módulo) e **Planos** (`/planos/`) com preço quando houver,
   limite de contratos (Locação) ou de usuários (Vendas), FAQ de respostas diretas e CTA "Começar".
8. **Mapa do site**, **404**.

### 7.2 Entrada e conta

Login, cadastro com plano escolhido (em etapas curtas, como o da Kenlo), convite,
esqueci a senha, redefinir senha, conta em análise, conta suspensa.

### 7.3 Gestão (`app.achouimovel.online`)

1. **Estrutura**: menu lateral agrupado por trabalho (proposta a validar: Hoje,
   Atendimento, Imóveis e anúncios, Vendas, Locação, Financeiro, Marketing, Relatórios,
   Configurações), topo com trilha e busca global (⌘K), módulo bloqueado com cadeado e
   tela de upgrade.
2. **Hoje** (painel inicial do corretor e do gestor): leads novos, visitas do dia,
   tarefas, conversas esperando a equipe, cobranças vencendo, demanda por bairro.
3. **Imóveis**: lista (com filtro por finalidade), cadastro em modo foco (finalidade,
   dados, fotos com legenda, valores de aluguel e/ou venda, proprietários com
   participação, exclusividade de venda — NOVO), detalhe e **diálogo de publicação** (canal
   AchouImovel pré-marcado, portais externos "em breve", confirmação manual, e o
   motivo quando não pode publicar: falta CRECI, menos de 5 fotos, sem bairro).
4. **Leads**: board por etapa (funis separados de aluguel e de venda — o de venda é
   NOVO) e tabela, filtros com chips, seleção múltipla com ações
   em lote, painel lateral de detalhe, origem (Portal AchouImovel, WhatsApp, manual).
5. **Atendimento**: caixa de entrada do WhatsApp, conversa com indicação clara de quem
   está respondendo (bot ou pessoa), "passar para a equipe" e "devolver ao automático".
6. **Visitas e agenda**, **Propostas**, **Tarefas**.
   6b. **Vendas** (NOVO): negociações em board, proposta de compra com contraproposta e
   histórico, checklist de documentação, contrato de compra e venda com assinatura,
   fechamento com comissão dividida entre captador e vendedor, painel de vendas do mês.
7. **Análise cadastral**: candidatura, autorização LGPD, regras com explicação, decisão.
8. **Contratos**: modelos, contrato, envelope de assinatura com linha do tempo.
9. **Vistoria**: ambientes, observações, sugestões de IA com aceitar/editar/descartar,
   comparação entrada × saída, relatório.
10. **Locações**: detalhe com encargos, proprietários, reajustar, renovar, encerrar, histórico.
11. **Financeiro**: cobranças, repasses, conciliação, com os integrados "em breve"
    sinalizados.
12. **Marketing**: campanhas Meta Ads (nascem pausadas), sugestão de texto com IA.
13. **Relatórios**, **Configurações** (membros, papéis, integrações, plano e uso),
    **Administração da plataforma** (fila de aprovação de imobiliárias).

### 7.4 Área do cliente

Proprietário (extrato e repasses) e inquilino (cobranças, pagar por QR, contrato,
vistoria), mobile-first, com entrada por link de uso único.

---

## 8. Formato da entrega para o Claude Code

- Cada tela com: nome, rota, componentes usados (com nome em PascalCase), estados, e
  quais dados da seção 4 ela consome.
- Inventário de componentes com anatomia e variantes, como em `docs/02-componentes.md`
  do zip.
- Tokens em tabela e prontos para variáveis CSS.
- Textos da interface em pt-BR, finais (não "lorem ipsum"). Números de exemplo
  claramente marcados como fictícios.
- Blocos coloridos com grade só onde o design indica; nada de gradiente ou sombra pesada.
- A gestão mantém o visual do painel que já está no ar (tokens em packages/ui/src/styles/tokens.css).
- Acessibilidade: contraste 4.5:1, foco visível, ícones com rótulo, `prefers-reduced-motion`.
