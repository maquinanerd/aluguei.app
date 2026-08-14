# Frontend Execution State

status: IMPLEMENTING
current_phase: 4
current_phase_name: DASHBOARD_CRM
last_completed_phase: 3
last_commit: feat(web): build Aluguei operational app shell
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
- Phase 01 — Repository & Design Discovery (docs gerados em docs/frontend/generated/).
- Phase 02 — PEG Foundation & Calibration (packages/ui completo, calibration screen /dev/calibration).
- Phase 03 — Application Shell & Navigation:
  - apps/web/src/lib: api-client (cliente HTTP único via /api/backend proxy),
    session (sessão /auth/me), rbac (espelho de permissões p/ UX; servidor autoridade),
    navigation (NAV_GROUPS + breadcrumbs, capability-aware).
  - components/shell: AppShell (sidebar full 240px, topbar 52px, breadcrumbs, drawer
    mobile <1024px), AccountMenu (logout), OrgSwitcher (troca de org via proxy).
  - Route group /app com layout server-side (auth guard → redirect /login) e Visão
    Geral inicial.
  - Proxy genérico /api/backend/[...path] (BFF: origem + cookie + XFF + Set-Cookie).
  - Recape das páginas públicas: home marketing, login/register (Focus Mode).
  - Validado runtime: /app 307→/login sem sessão; login+register via proxy OK; shell
    autenticado renderiza sidebar/brand; proxy GET /leads 200.

## In progress
- Phase 04 — Dashboard & CRM (Visão Geral completa + Leads list/360 + Pipeline +
  Contatos/parties + Tarefas + Agenda).

## Next
- Phase 04 implement; então 05 Properties → 06 Inbox/Visitas/Propostas →
  07 Screening/Contracts → 08 Inspections/Leases → 09 Finance → 10 Marketing/Reporting →
  11 Admin/Integrations → 12 Final Audit.

## Blockers
- none known
- NOT_APPLICABLE_BACKEND_GAP (confirmados): auditoria de leitura (só escrita),
  empresas separadas, automação/workflows, documentos genéricos, ocorrências de locação,
  filtro de proprietários por role em /parties.

## Rule
Update this file at every committed phase.
