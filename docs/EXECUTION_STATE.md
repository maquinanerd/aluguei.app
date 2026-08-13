# Estado da execução autônoma

- current_phase: 3
- status: GREEN
- last_completed_phase: 02 Identity + CRM
- last_commit: fase 02 (identity+crm)
- blockers_external: 0
- tests: passing (format/lint/typecheck/test 16 tasks incl. 21 integração PGlite/build green)
- updated_at: 2026-08-13

## Fases

- [x] 01 Foundation — monorepo pnpm+turbo, TS strict, Fastify API (/health), Next web shell, Expo mobile shell, worker shell, packages (contracts/config/observability/db/storage/integrations/domain/ui), migration drizzle inicial, CI, docker-compose opcional. ADR-004 em docs/DECISIONS.md.
- [x] 02 Identity + CRM — Organization/User/Membership/RBAC, sessão opaca em DB (cookie HttpOnly + Bearer, argon2id), audit events, Party/Contact + deduplicação por (kind,value), Lead com máquina de estado do funil (domínio puro), Task/Visit/Proposal/Timeline, UI web login/register/dashboard. ADR-005 em docs/DECISIONS.md. Correções pós-review: anti-enumeração (login 401 uniforme + hash dummy), 404 em vez de 500 em rotas por :id/cross-org, validação uuid de params, dedupe por par, rate limit 10/min em auth, Origin check no proxy web (anti login-CSRF), guard do último owner, logout audita AUTH_LOGOUT. Dívidas registradas: logout/switch-org afetam sessões por org (não por token), referências cross-org em POSTs (partyId/leadId/propertyId) não escopadas, N+1 em GET /parties, cleanup de sessões expiradas.
- [ ] 03 Properties + Listings
- [ ] 04 Channel Distribution
- [ ] 05 WhatsApp + Lead Automation
- [ ] 06 Inspections + AI
- [ ] 07 Screening + Contracts + Signature
- [ ] 08 Payments + Split + Ledger
- [ ] 09 Meta MCP + Ads
- [ ] 10 Portals + Reporting
- [ ] 11 Hardening
- [ ] 12 Final Audit
