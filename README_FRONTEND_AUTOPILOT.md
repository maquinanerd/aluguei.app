# Aluguei.app — Frontend Autopilot Pack

Pacote de continuação do Aluguei.app dedicado à construção integral do **painel web / CRM / backoffice**.

Ele parte do estado real do repositório e deve:
- descobrir a implementação existente;
- preservar o backend, domínio, banco e contracts;
- reconstruir/refinar a camada visual com fidelidade ao Claude Design do Aluguei.app;
- usar o PEG Product Design System como foundation compartilhada;
- implementar todas as superfícies operacionais do painel;
- testar, revisar visualmente, corrigir e continuar sem interrupção até o gate final.

## Comando principal

No OpenCode com DeepSeek V4 Flash:

`/frontend-autopilot`

Para continuar uma sessão interrompida:

`/frontend-resume`

Para auditar sem avançar:

`/frontend-audit`

## Autoridade visual

1. assets/screenshots específicos do Aluguei.app encontrados no repositório;
2. screenshots do PEG Product Design System em `design-source/peg-product-design-system/references/`;
3. PEG Product Design System existente no repositório;
4. `design-source/aluguei/30_ALUGUEI_APP_COMPLETE_DESIGN.md`;
5. docs/tokens do PEG empacotados em `design-source/peg-product-design-system/`;
6. implementação atual, somente quando não conflitar com os itens acima.

Não criar um novo design system.

## Identidade Aluguei.app

Foundation neutra:
- `#FCFCFC` canvas
- `#F0F0F0` surface secundária
- `#C7C7C7` border/disabled forte
- `#2F332B` ink

Accent:
- `#41945D` Aluguei primary
- `#417D55` Aluguei strong

A cor de produto é accent controlado. Não transformar o painel em interface verde.

## Regra de arquitetura visual

`PEG primitive → semantic component → domain composition → product screen`

Nunca:

`screen → CSS arbitrário`

## Escopo

O pacote cobre o painel:
- Visão Geral
- Inbox/WhatsApp
- CRM
- Leads
- Contatos
- Pipeline
- Atividades
- Agenda
- Imóveis
- Proprietários
- Anúncios
- Visitas
- Propostas
- Crédito
- Contratos
- Assinaturas
- Vistorias
- Locações
- Financeiro
- Meta Ads / Marketing
- Canais / Portais
- Analytics / Relatórios
- Documentos
- Usuários / Equipes / Permissões
- Auditoria
- Integrações
- Configurações

Não inclui reconstruir o backend do zero.
