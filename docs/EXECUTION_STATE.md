# Estado da execução autônoma

- current_phase: 5
- status: GREEN
- last_completed_phase: 04 Channel Distribution
- last_commit: fase 04 (channels)
- blockers_external: 0 (3 IMPLEMENTED_NOT_LIVE_VERIFIED em docs/BLOCKERS.md)
- tests: passing (format/lint/typecheck/test 19 tasks incl. channels 7 + worker 4 PGlite/build green)
- updated_at: 2026-08-13

## Fases

- [x] 01 Foundation — monorepo pnpm+turbo, TS strict, Fastify API (/health), Next web shell, Expo mobile shell, worker shell, packages (contracts/config/observability/db/storage/integrations/domain/ui), migration drizzle inicial, CI, docker-compose opcional. ADR-004 em docs/DECISIONS.md.
- [x] 02 Identity + CRM — Organization/User/Membership/RBAC, sessão opaca em DB (cookie HttpOnly + Bearer, argon2id), audit events, Party/Contact + deduplicação por (kind,value), Lead com máquina de estado do funil (domínio puro), Task/Visit/Proposal/Timeline, UI web login/register/dashboard. ADR-005/006 em docs/DECISIONS.md.
- [x] 03 Properties + Listings — Property/endereço privado+público/terms/owners/features/media, Listing com máquina de estado + guarda de prontidão, site público /imoveis sem vazar endereço privado, presigned upload + confirm (ADR-007), geocoding Google + mock (ADR-008), FKs SET NULL (ADR-009).
- [x] 04 Channel Distribution — IListingChannelAdapter + FakeChannel de referência (ADR-011), registry de canais reais sem adapter (404, sem inventar endpoints), fila de jobs no Postgres com claim SKIP LOCKED (ADR-010), estados por canal (máquina pura), jobs PUBLISH/UPDATE/REMOVE/RECONCILE/IMPORT_LEADS no worker com retry automático (attempts<5) e reaper de RUNNING preso, idempotência por idempotency_key, importLeads com dedupe de party, painel read-only. Correções pós-review: reaper, retry automático, guard RUNNING no markJobSuccess, pool singleton no worker, sanitize/truncate de lastError, gancho de UPDATE por conteúdo (terms/address/media), escopo de listingId no reconcile. Dívidas: leads de canal sem consentimento LGPD (Fase 07), dedupe de lead por referenceId, PATCH listings enfileira UPDATE só de title/description/slug (conteúdo do property cobre o resto).
- [ ] 05 WhatsApp + Lead Automation
- [ ] 06 Inspections + AI
- [ ] 07 Screening + Contracts + Signature
- [ ] 08 Payments + Split + Ledger
- [ ] 09 Meta MCP + Ads
- [ ] 10 Portals + Reporting
- [ ] 11 Hardening
- [ ] 12 Final Audit
