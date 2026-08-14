# Frontend Execution State

status: IMPLEMENTING
current_phase: 9
current_phase_name: FINANCE
last_completed_phase: 8
last_commit: feat(web): complete inspection and lease UI
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
- Phase 06 — Inbox, WhatsApp, Visits & Proposals.
- Phase 07 — Screening, Contracts & Signatures.
- Phase 08 — Inspections & Active Leases:
  - /app/inspections: lista com filtros tipo/status + criação.
  - /app/inspections/[id]: 360 com resumo (mídia/progresso), ambientes (CRUD rooms),
    ocorrências (registro + severidade/categoria + origem IA/humano), revisão IA
    (sugestões pendentes com aceitar/rejeitar — confirmação humana), relatório,
    processar mídia, mudar status.
  - /app/leases: lista com filtro + criação (contrato assinado).
  - /app/leases/[id]: Lease 360 (partes, aluguel/condomínio, split agency/landlord
    bps, cobranças por período com status e total em aberto, gerar cobrança, link contrato).
  - Validado runtime: create inspection + room 201; UI detail 200.

## In progress
- Phase 09 — Finance (overview, charges, payments, payouts, split, reconciliation, ledger).

## Next
- Phase 09 → 10 Marketing/Reporting → 11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties, timeline de imóveis (entityType limitado).

## Rule
Update this file at every committed phase.
