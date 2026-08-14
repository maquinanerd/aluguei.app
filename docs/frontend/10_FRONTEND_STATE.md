# Frontend Execution State

status: IMPLEMENTING
current_phase: 5
current_phase_name: PROPERTIES_CHANNELS
last_completed_phase: 4
last_commit: feat(web): complete dashboard and CRM UI
p0: 0
p1: 0
build: green
lint: green
typecheck: green
tests: green
e2e: UNKNOWN
visual_qa: PENDING_CALIBRATION_SHOT
accessibility: PENDING

## Completed
- Phase 01 — Repository & Design Discovery.
- Phase 02 — PEG Foundation & Calibration.
- Phase 03 — Application Shell & Navigation.
- Phase 04 — Dashboard & CRM:
  - Infra reutilizável: useQuery (loading/error/permission/retry), labels de domínio
    (funil, roles, status por módulo), PageToolbar (pattern List/Index).
  - /app (Visão Geral): KPIs operacionais + cards de leads/tarefas/visitas/cobranças
    + quick links, server component com Promise.allSettled + guard por permissão.
  - /app/crm/leads: lista com busca, filtro por estágio, sort, seleção, paginação,
    criação de lead, transição de status via dropdown, row click → Lead 360.
  - /app/crm/leads/[id]: Lead 360 com header + tabs (overview/conversas/atividades)
    + context rail (contato/origem/orçamento); adaptado ao contrato real (sem GET
    /leads/:id — resolve via list; conversas via /leads/:id/conversations; timeline
    via /timeline?entityType=LEAD).
  - /app/crm/pipeline: board kanban por estágio + visão tabela, avanço 1-clique.
  - /app/crm/contacts: lista de parties com busca, criação com dedupe (POST
    /parties + /parties/dedupe), drawer de detalhe.
  - /app/crm/tasks: CRUD (criar/concluir/cancelar) com filtro.
  - /app/crm/calendar: agenda de visitas agrupada por dia + tarefas abertas.
  - Validado runtime: 6 rotas CRM 200 com shell; create lead via proxy 201;
    dashboard mostra o lead criado.

## In progress
- Phase 05 — Properties, Media, Listings & Channels (imóveis table/grid, Property 360,
  cadastro/edição, mídia upload, listings, canais/portais com sync/retry).

## Next
- Phase 05 → 06 Inbox/Visitas/Propostas → 07 Screening/Contracts → 08 Inspections/Leases
  → 09 Finance → 10 Marketing/Reporting → 11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties.

## Rule
Update this file at every committed phase.
