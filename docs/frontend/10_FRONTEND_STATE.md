# Frontend Execution State

status: IMPLEMENTING
current_phase: 11
current_phase_name: ADMIN_INTEGRATIONS
last_completed_phase: 10
last_commit: feat(web): complete marketing and reporting UI
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
- Phase 08 — Inspections & Active Leases.
- Phase 09 — Finance.
- Phase 10 — Marketing, Meta, Channels Analytics & Reporting:
  - /app/marketing: visão geral (campanhas ativas, perfis, modo dry-run), campanhas
    com publicar/pausar/retomar/arquivar (confirm + audit, Housing Special Ad Category),
    sync insights, perfis de anúncio, conexão Meta (create FAKE dry-run).
  - /app/reporting: funil de leads com barras, receita mensal, gasto Meta, exportação
    CSV/JSON (report:export, maxRows 1000).
  - Validado runtime: marketing/reporting 200; meta connect FAKE 201; funnel com
    dados; export JSON 200.

## In progress
- Phase 11 — Administration, Audit & Integrations (members, roles, audit (gap),
  integrations, settings, whatsapp connections).

## Next
- Phase 11 → 12 Responsive/A11y/Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties, timeline de imóveis (entityType limitado).

## Rule
Update this file at every committed phase.
