# 01 — Frontend Scope

## Superfície principal
CRM / Backoffice do Aluguei.app.

## Módulos

### Visão Geral
Central de trabalho operacional.

### Inbox
- Conversas
- WhatsApp
- Pendentes

### CRM
- Leads
- Contatos
- Pipeline
- Atividades
- Agenda
- Oportunidades somente se capability atual suportar

### Imóveis
- Todos
- Disponíveis
- Reservados
- Alugados
- Inativos
- Proprietários
- Anúncios

### Atendimento
- Visitas
- Propostas
- Qualificação
- Histórico

### Crédito
- Análises
- Pendências
- Histórico

### Contratos
- Contratos
- Assinaturas
- Documentos
- Templates

### Vistorias
- Agendadas
- Em andamento
- Concluídas
- Relatórios

### Locações
- Ativas
- Renovações/encerramentos quando domínio suportar
- Ocorrências quando capability existir

### Financeiro
- Overview
- Cobranças
- Recebimentos
- Pagamentos
- Repasses
- Conciliação
- Ledger

### Marketing
- Campanhas
- Meta Ads
- Criativos
- Performance
- Leads relacionados

### Canais
- Site
- Portais
- Publicações
- Integrações

### Analytics / Relatórios

### Documentos

### Administração
- Usuários
- Equipes/memberships
- Permissões
- Auditoria
- Integrações
- Configurações

## Regra anti-invenção

A navegação final deve refletir capabilities reais.
Não criar módulo vazio só porque aparece no design doc.
Se a capability não existir, registrar `NOT_APPLICABLE_BACKEND_GAP`.
