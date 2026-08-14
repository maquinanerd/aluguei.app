# Frontend Execution State

status: IMPLEMENTING
current_phase: 6
current_phase_name: INBOX_SERVICE
last_completed_phase: 5
last_commit: feat(web): complete property and distribution UI
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
- Phase 04 — Dashboard & CRM.
- Phase 05 — Properties, Media, Listings & Channels:
  - /app/properties: lista table+grid, busca, filtro por status, row → Property 360.
  - /app/properties/new: formulário de criação completo via createPropertyRequest.
  - /app/properties/[id]: Property 360 (header + tabs dados/mídia/proprietário/
    financeiro/histórico + context rail), features add/remove, termos financeiros
    (PUT financial-terms), remoção com confirm. Histórico: gap registrado (timeline
    não suporta PROPERTY entityType).
  - /app/listings: lista, criação, transição de status (DRAFT→READY→PUBLISHED→PAUSED).
  - /app/channels: resumo por canal, publicações por listing, publish/remove/
    reconcile/import-leads com estados e retry.
  - Validado runtime (fluxo completo): criar imóvel → termos → endereço público →
    listing → publish no canal fake → summary reflete publicação.

## In progress
- Phase 06 — Inbox, WhatsApp, Visits & Proposals (conversation list + detail +
  CRM context, handoff; visit list/calendar/detail; proposals lifecycle).

## Next
- Phase 06 → 07 Screening/Contracts → 08 Inspections/Leases → 09 Finance →
  10 Marketing/Reporting → 11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties, timeline de imóveis (entityType limitado).

## Rule
Update this file at every committed phase.
