# ALUGUEI.APP — COMPLETE PRODUCT DESIGN

# PEG PRODUCT DESIGN SYSTEM — REGRA COMPARTILHADA

Este produto faz parte da mesma família visual de **Kal El**, **Commerce Wayne** e **ALUGUEI.APP**.

O **PEG Product Design System** já existente no projeto é a fonte visual principal. Não crie outro design system, não duplique foundations e não redesenhe primitives que já existam.

## Source of truth

Use nesta ordem de precedência:

1. screenshots e referências visuais existentes no workspace;
2. PEG Product Design System já construído;
3. este arquivo de especificação do produto;
4. padrões/componentes já aprovados no projeto;
5. somente na ausência de referência, decisão visual nova.

## Linguagem visual obrigatória

Preserve a identidade dos screenshots:

- interface predominantemente clara e neutra;
- tipografia sans-serif limpa e de alta legibilidade;
- alta densidade informacional sem parecer apertada;
- bordas finas;
- sombras discretas;
- radius moderado;
- grids rigorosos;
- tabelas compactas;
- sidebars e inspectors precisos;
- hierarquia baseada em tipografia, spacing e contraste — não em excesso de cor;
- mobile pensado como experiência própria, não desktop comprimido;
- dark mode com surfaces próprias, nunca simples inversão automática.

Evite:

- glassmorphism;
- gradientes decorativos;
- sombras pesadas;
- cards gigantes;
- excesso de pills;
- radius exagerado;
- dashboards genéricos;
- gráficos decorativos;
- saturação excessiva;
- ilustrações sem função;
- visual “template SaaS”.

## Fundação neutra compartilhada

Estas cores são comuns aos três produtos e devem permanecer consistentes:

| Token | HEX | Uso |
|---|---:|---|
| `neutral.canvas` | `#FCFCFC` | canvas/background principal |
| `neutral.surface` | `#F0F0F0` | surface secundária, hover leve, blocos suaves |
| `neutral.mid` | `#C7C7C7` | borders fortes, disabled, divisores |
| `neutral.ink` | `#2F332B` | texto forte, ação principal escura, ícones principais |

A identidade não deve virar uma interface colorida. A cor de produto é **accent**, não substituto dos neutros.

## Regra de componentização

Composição correta:

`PEG primitive → semantic component → domain composition → product screen`

Nunca:

`product screen → CSS arbitrário`

Quando surgir uma necessidade nova:

1. procure primitive PEG existente;
2. procure pattern PEG existente;
3. componha componentes existentes;
4. só então crie extensão nova;
5. se criar extensão, documente-a como candidata a componente compartilhável.

## QA obrigatório

Para cada domínio/tela relevante:

1. desenhar usando PEG UI;
2. comparar com referências;
3. validar spacing, tipografia, grid, borders, radius, density, states e responsive;
4. classificar divergências:
   - `P0`: rompe identidade ou fluxo;
   - `P1`: divergência visual/UX perceptível;
   - `P2`: refinamento;
5. corrigir todos os P0 e P1 antes de considerar concluído.


# PALETA DO ALUGUEI.APP

O ALUGUEI.APP usa a fundação neutra compartilhada e acrescenta dois verdes de marca:

| Token | HEX | Papel |
|---|---:|---|
| `aluguei.brand.primary` | `#41945D` | accent principal |
| `aluguei.brand.strong` | `#417D55` | accent forte, hover/pressed, estados selecionados |

## Regras de uso da paleta

- O canvas continua predominantemente `#FCFCFC`.
- Surfaces secundárias usam `#F0F0F0`.
- Borders/disabled usam a família neutra derivada de `#C7C7C7`.
- Texto e ações escuras continuam ancorados em `#2F332B`.
- `#41945D` identifica ALUGUEI.APP em navegação ativa, focus, destaques, gráficos e ações de marca.
- `#417D55` serve como variação mais forte.
- Não pintar grandes áreas de verde sem necessidade funcional.
- Verde de marca **não substitui automaticamente o semantic success**. Estados de sucesso, warning, error e info devem continuar semanticamente distinguíveis.

O resultado deve ser reconhecível como ALUGUEI.APP sem perder a sobriedade do PEG UI.

---

# 1. VISÃO DO PRODUTO

ALUGUEI.APP é um **Operating System Imobiliário** com foco no ciclo completo de locação.

Não trate como “CRM + cadastro de imóveis”.

Fluxo macro:

```text
IMÓVEL
  ↓
CADASTRO / CAPTAÇÃO
  ↓
ANÚNCIOS / SITE / PORTAIS
  ↓
LEADS
  ↓
CRM / ATENDIMENTO
  ↓
WHATSAPP
  ↓
QUALIFICAÇÃO
  ↓
VISITAS
  ↓
PROPOSTAS
  ↓
ANÁLISE DE CRÉDITO
  ↓
CONTRATO
  ↓
ASSINATURA
  ↓
VISTORIA
  ↓
LOCAÇÃO ATIVA
  ↓
COBRANÇA
  ↓
PAGAMENTO
  ↓
SPLIT
  ↓
REPASSE
  ↓
CONCILIAÇÃO / LEDGER
```

Fluxos paralelos:

```text
IMÓVEL → META ADS → LEADS → CRM
IMÓVEL → PORTAIS/SITE → LEADS → CRM
```

O imóvel é entidade central e se relaciona com:

- proprietário;
- corretor/responsável;
- anúncios;
- portais;
- campanhas;
- leads;
- contatos;
- visitas;
- propostas;
- screening/crédito;
- contratos;
- assinatura;
- locatário;
- locação;
- vistoria;
- cobrança;
- pagamentos;
- repasses;
- documentos;
- ocorrências;
- histórico/auditoria.

---

# 2. SUPERFÍCIES DO PRODUTO

Projete coerentemente:

1. **CRM / Backoffice**
2. **Site/operação pública de imóveis**
3. **Portal do Proprietário**
4. **Portal do Locatário**
5. **App Mobile — Corretor**
6. **App Mobile — Vistoria**
7. **Inbox / WhatsApp**

Todas compartilham PEG UI, mas não precisam ter o mesmo shell.

---

# 3. PRINCÍPIOS OPERACIONAIS

O produto deve parecer:

- profissional;
- rápido;
- confiável;
- auditável;
- orientado a operação;
- denso;
- contextual;
- eficiente para equipes.

Priorize:

- busca global;
- filtros;
- saved views;
- ações em massa;
- contexto entre entidades;
- timeline;
- próximas ações;
- estados claros;
- rastreabilidade;
- redução de troca de tela;
- excelente uso mobile em campo.

---

# 4. ARQUITETURA DE NAVEGAÇÃO

Estrutura-base:

```text
ALUGUEI.APP

Visão Geral

Inbox
├── Conversas
├── WhatsApp
└── Pendentes

CRM
├── Leads
├── Contatos
├── Empresas
├── Oportunidades
├── Pipeline
├── Atividades
└── Agenda

Imóveis
├── Todos
├── Disponíveis
├── Reservados
├── Alugados
├── Inativos
├── Proprietários
└── Anúncios

Atendimento
├── Visitas
├── Propostas
├── Qualificação
└── Histórico

Crédito
├── Análises
├── Pendências
└── Histórico

Contratos
├── Contratos
├── Assinaturas
├── Documentos
└── Templates

Vistorias
├── Agendadas
├── Em andamento
├── Concluídas
└── Relatórios

Locações
├── Ativas
├── Renovações
├── Encerramentos
└── Ocorrências

Financeiro
├── Visão Geral
├── Cobranças
├── Recebimentos
├── Pagamentos
├── Repasses
├── Conciliação
└── Ledger

Marketing
├── Campanhas
├── Meta Ads
├── Criativos
├── Audiências
├── Leads
└── Performance

Canais
├── Site
├── Portais
├── Publicações
└── Integrações

Automação
├── Workflows
├── Triggers
├── Execuções
└── Falhas

Analytics
Relatórios
Documentos

Administração
├── Usuários
├── Equipes
├── Permissões
├── Auditoria
├── Integrações
└── Configurações
```

Não inventar módulos adicionais só para preencher a navegação.

---

# 5. DASHBOARD OPERACIONAL

O dashboard é central de trabalho, não apresentação executiva.

Mostrar prioritariamente:

### CRM
- novos leads;
- leads sem atendimento;
- leads aguardando resposta;
- qualificados;
- oportunidades abertas;
- atividades atrasadas;
- visitas;
- propostas.

### Imóveis
- disponíveis;
- reservados;
- alugados;
- sem publicação;
- com pendência;
- maior procura.

### Operação
- crédito pendente;
- contratos aguardando ação;
- assinaturas pendentes;
- vistorias próximas;
- ocorrências abertas.

### Financeiro
- cobranças previstas;
- vencidas;
- recebidas;
- repasses pendentes;
- conciliações pendentes.

### Atendimento
- conversas abertas;
- sem responsável;
- aguardando resposta.

---

# 6. CRM — LEADS

Criar List + Detail + Pipeline.

Tabela de leads deve suportar:

- nome;
- telefone/WhatsApp;
- e-mail;
- origem;
- campanha;
- canal;
- imóvel de interesse;
- responsável;
- estágio;
- score/qualificação quando aplicável;
- última interação;
- próxima atividade;
- data de entrada;
- status.

Ferramentas:

- search;
- advanced filters;
- saved views;
- sorting;
- bulk selection/actions;
- custom columns;
- pagination;
- context actions.

Estados:

- default;
- hover;
- selected;
- loading;
- empty;
- error;
- filtered;
- bulk selection.

---

# 7. LEAD 360

Estrutura:

```text
Lead Header
├── identidade
├── estágio
├── status
├── responsável
└── ações

Workspace
├── Overview
├── Conversas
├── Atividades
├── Interesses
├── Visitas
├── Propostas
├── Crédito
├── Documentos
└── Histórico

Context Rail
├── contato
├── origem
├── imóvel
├── tags
├── responsável
└── próxima ação
```

Timeline unificada:

- lead criado;
- mensagem;
- chamada;
- nota;
- mudança de estágio;
- imóvel visualizado;
- visita;
- proposta;
- crédito;
- documento;
- contrato.

---

# 8. PIPELINE

Pipeline compacto e operacional:

```text
Novo
→ Primeiro contato
→ Qualificado
→ Visita
→ Proposta
→ Crédito
→ Contrato
→ Fechado
```

Cards podem exibir:

- lead;
- imóvel;
- valor;
- responsável;
- próxima atividade;
- atraso;
- origem;
- prioridade.

Criar também view em tabela.

---

# 9. CONTATOS E EMPRESAS

Contato continua existindo independentemente de oportunidade.

Criar:

- lista;
- detail;
- atividades;
- interesses;
- contratos;
- locações;
- documentos;
- conversas;
- histórico.

Para empresas:

- company list/detail;
- contatos;
- oportunidades;
- contratos;
- documentos;
- timeline.

---

# 10. IMÓVEIS

Criar Table View + Grid View operacional.

Campos visuais:

- foto;
- código;
- título;
- endereço;
- bairro/cidade;
- tipo;
- finalidade;
- preço;
- condomínio;
- IPTU quando aplicável;
- dormitórios;
- suítes;
- banheiros;
- vagas;
- área;
- status;
- proprietário;
- responsável;
- canais;
- leads;
- visitas;
- propostas;
- última atualização.

Grid não deve parecer portal público.

---

# 11. PROPERTY 360

Página central:

```text
Property Header
├── foto
├── código
├── endereço
├── status
├── valor
├── responsável
└── ações

Tabs/Sections
├── Overview
├── Dados
├── Mídia
├── Proprietário
├── Anúncios
├── Leads
├── Conversas
├── Visitas
├── Propostas
├── Contrato
├── Vistoria
├── Financeiro
├── Marketing
├── Documentos
└── Histórico
```

---

# 12. CADASTRO DE IMÓVEL — VOICE FIRST

Fluxo obrigatório:

```text
Novo imóvel
→ Gravar/enviar áudio
→ Speech-to-text
→ Transcrição
→ Extração estruturada
→ Dados canônicos
→ Revisão
→ Imagens
→ Análise visual por IA
→ Organização da galeria
→ Texto do anúncio
→ SEO/Schema
→ Canais
→ Revisão humana
→ Publicação
```

Criar estados para:

- recording;
- upload;
- transcription;
- extraction;
- confidence;
- missing fields;
- human correction;
- AI processing;
- ready to publish;
- failed/retry.

IA não inventa dados ausentes.

---

# 13. MÍDIA DO IMÓVEL

Criar:

- upload;
- drag & drop;
- reorder;
- cover image;
- multi-select;
- remove;
- processing state;
- room classification;
- qualidade;
- sugestões de IA;
- confirmação humana.

IA pode sugerir cômodo, características, dano, inconsistência ou qualidade, mas nunca converter inferência em fato sem revisão.

---

# 14. ANÚNCIOS / PORTAIS / CANAIS

Cada imóvel pode ter múltiplas distribuições.

Estados:

- Draft;
- Ready;
- Published;
- Pending;
- Failed;
- Paused;
- Needs Attention.

Para cada canal:

- conectado/desconectado;
- status;
- última sincronização;
- imóveis ativos;
- erros;
- pendências;
- ações de retry.

---

# 15. INBOX / WHATSAPP

Shell em três zonas:

```text
Conversation List
+
Active Conversation
+
CRM Context Panel
```

Lista:

- busca;
- filtros;
- unread;
- responsável;
- fila;
- status;
- preview;
- horário.

Conversa:

- mensagens;
- anexos;
- templates;
- timestamps;
- composer;
- ações;
- eventos relevantes do CRM.

Context panel:

- lead;
- contato;
- imóvel;
- estágio;
- responsável;
- próxima ação;
- visita;
- proposta.

---

# 16. VISITAS

Criar:

- list;
- calendar;
- schedule;
- detail;
- reschedule;
- cancel;
- status;
- corretor;
- imóvel;
- interessado;
- timeline.

No mobile, otimizar para campo.

---

# 17. PROPOSTAS

Estados:

- aberta;
- enviada;
- aceita;
- recusada;
- expirada;
- negociação.

Relacionar:

- interessado;
- imóvel;
- valores;
- condições;
- responsável;
- timeline;
- documentos;
- próxima ação.

---

# 18. CRÉDITO / SCREENING

Representar integração com análise de crédito (ex.: Serasa/SPC por adapter).

Tela:

- solicitante;
- imóvel;
- proposta;
- status;
- documentos;
- validações;
- pendências;
- regras;
- histórico;
- decisão.

Regras versionadas e decisões auditáveis. IA não é autoridade final.

---

# 19. CONTRATOS E ASSINATURA

Contract lifecycle:

- Draft;
- Em revisão;
- Aguardando assinatura;
- Parcialmente assinado;
- Assinado;
- Ativo;
- Encerrado;
- Cancelado.

Criar:

- contract list;
- contract detail;
- structured builder;
- partes;
- imóvel;
- valores;
- datas;
- cláusulas;
- documentos;
- timeline;
- audit.

Assinatura:

- preparado;
- enviado;
- visualizado;
- pendente;
- assinado;
- recusado;
- expirado;
- erro.

Mostrar participantes, ordem, timestamps e evidências.

---

# 20. VISTORIAS

Desktop + mobile.

Fluxo:

```text
Agendada
→ Imóvel
→ Ambientes
→ Fotos
→ Áudio/observações
→ Speech-to-text
→ Análise visual
→ Sugestões de IA
→ Confirmação humana
→ Relatório
→ Assinatura/conclusão
```

Criar:

- agenda;
- inspection detail;
- checklist;
- rooms;
- media;
- audio;
- transcription;
- issues/damages;
- notes;
- comparison;
- report.

Mobile prioriza câmera, áudio e uso com uma mão.

---

# 21. LOCAÇÃO ATIVA E OCORRÊNCIAS

Lease 360:

- imóvel;
- proprietário;
- locatário;
- contrato;
- vigência;
- cobrança;
- pagamentos;
- repasses;
- documentos;
- vistoria;
- ocorrências;
- timeline.

Ocorrências:

- nova;
- em análise;
- aguardando ação;
- em andamento;
- resolvida;
- encerrada.

Relacionar imóvel, locação, partes, responsável, fotos, documentos, mensagens e histórico.

---

# 22. FINANCEIRO

Arquitetura:

```text
Financeiro
├── Overview
├── Cobranças
├── Recebimentos
├── Pagamentos
├── Repasses
├── Conciliação
└── Ledger
```

Dashboard financeiro deve ser operacional.

Cobranças:

- futura;
- aberta;
- vencendo;
- vencida;
- parcialmente paga;
- paga;
- cancelada;
- falha.

Pagamentos podem representar Pix/boleto/gateway.

Split/repasse:

```text
Recebimento
→ Distribuição
→ Taxas/Composição
→ Destino
→ Repasse
```

Ledger de dupla entrada deve priorizar inspeção e auditabilidade:

- transação;
- conta;
- débito/crédito;
- origem;
- referência;
- timestamp;
- conciliação.

Conciliação:

- conciliado;
- não conciliado;
- divergência;
- filtros;
- ações seguras.

---

# 23. PORTAL DO PROPRIETÁRIO

Interface simplificada:

- dashboard;
- imóveis;
- ocupação/status;
- locações;
- próximos repasses;
- histórico;
- demonstrativos;
- documentos;
- contratos;
- vistorias;
- ocorrências.

Não expor backoffice inteiro.

---

# 24. PORTAL DO LOCATÁRIO

Interface própria:

- home;
- imóvel;
- contrato;
- próxima cobrança;
- pagamento;
- histórico;
- documentos;
- vistorias permitidas;
- abertura/acompanhamento de ocorrência.

---

# 25. MOBILE — CORRETOR

Experiência própria, não responsividade simples.

Priorizar:

- tasks do dia;
- leads;
- inbox/WhatsApp;
- contatos;
- imóveis;
- cadastro por voz;
- visitas;
- agenda;
- proposta;
- atividades.

---

# 26. MOBILE — VISTORIA

Fluxo otimizado para:

- iniciar;
- imóvel;
- ambientes;
- câmera;
- fotos;
- áudio;
- transcrição;
- checklist;
- notas;
- review;
- conclusão.

Considerar estados offline/unstable connection quando aplicável.

---

# 27. MARKETING / META ADS

Criar:

```text
Marketing
├── Campanhas
├── Conjuntos
├── Anúncios
├── Criativos
├── Audiências
├── Performance
└── Leads
```

Relacionar campanha/creative com imóvel e leads.

Ações possíveis via integração/API/MCP devem ter:

- confirmation;
- loading;
- success;
- error;
- audit.

Não copiar o Meta Ads Manager.

---

# 28. AUTOMAÇÕES

Criar:

- workflow list;
- workflow builder;
- triggers;
- conditions;
- actions;
- runs;
- run detail;
- failures;
- retry/log.

Estados:

- ativo/inativo;
- running;
- success;
- failed;
- retrying.

---

# 29. IA

Casos:

- speech-to-text;
- visão multimodal;
- extração;
- resumo;
- classificação;
- qualificação;
- suporte a documentos;
- análise de mídia.

A UI deve diferenciar claramente:

`DADO FACTUAL` × `SUGESTÃO DA IA` × `AÇÃO HUMANA`

Estados:

- suggestion;
- confidence;
- needs review;
- accepted;
- rejected;
- processing;
- failed.

Nunca desenhar IA movimentando dinheiro, assinando contrato ou alterando dado crítico silenciosamente.

---

# 30. DOCUMENTOS / BUSCA / NOTIFICAÇÕES

Biblioteca documental contextual ligada a:

- contato;
- proprietário;
- locatário;
- imóvel;
- proposta;
- crédito;
- contrato;
- vistoria;
- locação;
- financeiro;
- ocorrência.

Busca global deve retornar entidades heterogêneas.

Notificações devem priorizar urgência, contexto e ação.

---

# 31. ANALYTICS / REPORTS

Analytics:

- comercial;
- imóveis;
- operação;
- financeiro;
- marketing.

Relatórios:

- período;
- filtros;
- campos;
- preview;
- geração;
- export;
- histórico.

Não inventar métricas ou fórmulas não especificadas.

---

# 32. INTEGRAÇÕES

Representar adapters para:

- WhatsApp;
- Google Maps;
- análise de crédito;
- assinatura eletrônica;
- pagamentos;
- portais;
- Meta.

Cada integração:

- status;
- account;
- health;
- última sync;
- permissions;
- settings;
- logs;
- reconnect.

Secrets nunca aparecem em claro.

---

# 33. ADMINISTRAÇÃO

Criar:

- users;
- teams;
- roles;
- permissions;
- audit log;
- settings.

Permissões por módulo/recurso/ação.

Audit log:

- usuário;
- ação;
- entidade;
- data;
- origem;
- mudança/diff;
- integração;
- resultado.

---

# 34. RESPONSIVE E ESTADOS

Cobrir:

- Desktop XL;
- Desktop;
- Tablet;
- Mobile.

Estados obrigatórios:

- loading;
- skeleton;
- empty;
- first use;
- error;
- permission denied;
- disconnected integration;
- partial data;
- offline quando aplicável;
- processing;
- retry;
- success;
- warning;
- blocked.

---

# 35. ORDEM DE EXECUÇÃO

1. Architecture
2. Core CRM
3. Property
4. Transaction
5. Rental Operation
6. Financial
7. Distribution/Marketing
8. Portals
9. Mobile
10. Administration
11. Visual QA final

---

# 36. CRITÉRIO FINAL

O design deve demonstrar o ciclo completo:

```text
CAPTAR IMÓVEL
→ PUBLICAR
→ GERAR LEAD
→ ATENDER
→ QUALIFICAR
→ VISITAR
→ NEGOCIAR
→ ANALISAR CRÉDITO
→ CONTRATAR
→ ASSINAR
→ VISTORIAR
→ INICIAR LOCAÇÃO
→ COBRAR
→ RECEBER
→ CONCILIAR
→ REPASSAR
→ ACOMPANHAR
```

Tudo construído sobre PEG UI, com a identidade verde do ALUGUEI.APP aplicada de forma controlada.
