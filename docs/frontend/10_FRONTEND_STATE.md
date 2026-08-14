# Frontend Execution State

status: IMPLEMENTING
current_phase: 10
current_phase_name: MARKETING_REPORTING
last_completed_phase: 9
last_commit: feat(web): complete finance operations UI
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
- Phase 09 — Finance:
  - /app/finance: overview operacional (em aberto, recebido, cobrado, repasses
    pendentes, locação ativa).
  - /app/charges: lista com filtro, criação, drawer de detalhe com breakdown
    (aluguel/condomínio/multa/juros/desconto), receber (Pix/boleto/cartão/manual —
    sandbox fake), cancelar, estornar.
  - /app/payments: lista com filtro, método/status/provedor.
  - /app/payouts: lista de repasses com status.
  - /app/reconciliation: lista + conciliar (POST /reconciliations).
  - /app/ledger: partidas de dupla entrada com filtro por conta, débitos/créditos/
    saldo, referência auditável.
  - Validado runtime: 6 rotas 200; ledger/accounts + entries respondem (vazio real
    sem transações processadas; fluxo completo coberto por testes de integração do repo).

## In progress
- Phase 10 — Marketing, Meta, Channels Analytics & Reporting (conexão Meta, assets,
  ad profiles, campanhas com create paused/publish/pause/resume/budget/schedule/
  creative/archive/insights; reporting: funnel, receita mensal, meta spend, export).

## Next
- Phase 10 → 11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties, timeline de imóveis (entityType limitado).

## Rule
Update this file at every committed phase.
