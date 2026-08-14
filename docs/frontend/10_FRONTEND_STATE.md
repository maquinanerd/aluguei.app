# Frontend Execution State

status: IMPLEMENTING
current_phase: 8
current_phase_name: INSPECTIONS_LEASES
last_completed_phase: 7
last_commit: feat(web): complete screening and contract UI
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
- Phase 07 — Screening, Contracts & Signatures:
  - /app/screening: lista de aplicações com filtro por status.
  - /app/screening/[id]: 360 com resultado do screening (decisão/score/provedor),
    consentimento LGPD, solicitar screening, aprovar com confirm. IA nunca autoridade
    final: decisão vem do provedor/regras do backend.
  - /app/contracts: lista com filtro, criação (aplicação aprovada + template aprovado).
  - /app/contracts/[id]: 360 com partes, envelope de assinatura, gerar contrato,
    enviar para assinatura, cancelar (VOID), visualizar conteúdo (hash verificado).
  - /app/contract-templates: lista com busca/filtro, criação, aprovação.
  - Validado runtime (fluxo real): party → application → consent LGPD →
    SUBMITTED → SCREENING → screening request 202 → APPROVED → UI detail 200.

## In progress
- Phase 08 — Inspections & Active Leases (vistorias desktop: agenda/detail/checklist/
  rooms/media/áudio/transcrição/sugestões IA/confirmação humana/comparação/relatório;
  Lease 360).

## Next
- Phase 08 → 09 Finance → 10 Marketing/Reporting → 11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties, timeline de imóveis (entityType limitado).

## Rule
Update this file at every committed phase.
