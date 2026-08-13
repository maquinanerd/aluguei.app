# UI/UX

## Web

Uma aplicação Next.js pode conter inicialmente:

- `/` site público
- `/imoveis` listagem
- `/imoveis/[slug]` detalhe
- `/app` CRM/admin
- `/app/imoveis`
- `/app/leads`
- `/app/vistorias`
- `/app/locacoes`
- `/app/financeiro`
- `/app/integracoes`
- `/app/meta-ads`
- `/proprietario`
- `/inquilino`

## Mobile

Foco operacional, não réplica completa do CRM:

- login
- agenda/visitas
- imóveis
- vistoria
- captura de foto/áudio offline-first quando possível
- sync resiliente

## Meta Ads

Tela deve permitir:

- conectar Meta
- escolher conta/ativos
- selecionar imóveis
- selecionar fotos
- gerar/revisar copy
- orçamento e período
- visualizar estado e preview
- ativar/pausar
- métricas por imóvel/campanha

## Princípios

- acessibilidade WCAG como requisito
- feedback de processamento assíncrono
- conflitos e erros exibidos de forma acionável
- nenhuma ação financeira ou de anúncio escondida atrás de automação silenciosa
