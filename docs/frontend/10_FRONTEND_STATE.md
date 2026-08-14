# Frontend Execution State

status: IMPLEMENTING
current_phase: 7
current_phase_name: SCREENING_CONTRACTS
last_completed_phase: 6
last_commit: feat(web): complete inbox visits and proposals UI
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
- Phase 05 — Properties, Media, Listings & Channels.
- Phase 06 — Inbox, WhatsApp, Visits & Proposals:
  - /app/inbox: shell 3 zonas (conversation list + active conversation + CRM
    context panel), busca/filtro/status, thread de mensagens com direção, composer
    (POST /conversations/:id/messages), handoff, intenções extraídas no contexto.
  - /app/visits: lista com filtro por status, drawer de detalhe, agendamento.
  - /app/proposals: lista com filtro, drawer de detalhe, criação (imóvel + aluguel
    + condições + validade).
  - Validado runtime: 3 rotas 200; create visit 201; create proposal 201.

## In progress
- Phase 07 — Screening, Contracts & Signatures (rental applications, screening
  decision, contracts, templates, signature envelope).

## Next
- Phase 07 → 08 Inspections/Leases → 09 Finance → 10 Marketing/Reporting →
  11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties, timeline de imóveis (entityType limitado).

## Rule
Update this file at every committed phase.
