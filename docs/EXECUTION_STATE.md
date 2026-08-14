# Estado da execução autônoma

- current_phase: 11
- status: GREEN
- last_completed_phase: 10 Portals + Reporting
- last_commit: fase 10 (portals-reporting)
- blockers_external: 0 (11 IMPLEMENTED_NOT_LIVE_VERIFIED em docs/BLOCKERS.md)
- tests: passing (format/lint/typecheck/test 20 tasks incl. portal 4 + reporting 5 PGlite/build green)
- updated_at: 2026-08-14

## Fases

- [x] 01 Foundation — monorepo pnpm+turbo, TS strict, Fastify API, Next web shell, Expo mobile shell, worker shell, packages, migration inicial, CI. ADR-004.
- [x] 02 Identity + CRM — Organization/User/Membership/RBAC, sessão opaca, audit, Party + deduplicação, Lead com funil, Task/Visit/Proposal/Timeline, UI auth/dashboard. ADR-005/006.
- [x] 03 Properties + Listings — Property/endereço privado+público/terms/owners/features/media, Listing com máquina de estado, site público, presigned upload, geocoding. ADR-007/008/009.
- [x] 04 Channel Distribution — IListingChannelAdapter + FakeChannel, fila Postgres SKIP LOCKED, estados por canal, jobs com retry/reaper, idempotência. ADR-010/011.
- [x] 05 WhatsApp + Lead Automation — WhatsAppMessenger (Meta REST + Fake), AiProvider mock, webhook inbox, gateway (vínculo/imóvel/intenção/visita/handoff), rotas conversation:* + connections. ADR-012/013/014.
- [x] 06 Inspections + AI — Inspection com máquina de estado, media com privacy guard (ADR-015), transcrição + sugestões (evidência observável), confirmação humana, comparação entrada×saída, relatório snapshot, jobs provider INSPECTION. ADR-016/017.
- [x] 07 Screening + Contracts + Signature — RentalApplication com máquina de estado, consentimento LGPD obrigatório (ADR-018), regras determinísticas explicáveis (ADR-019), screening provider (Serasa/SPC/FAKE — reais sem adapter), templates versionados + render com hash, contratos com máquina de estado, envelope de assinatura via provider + webhook inbox (ADR-020), jobs SCREENING/SIGNATURE. ADR-021.
- [x] 08 Payments + Split + Ledger — Charges com multa/juros/desconto determinísticos, pagamento via IPaymentProvider (Fake; Asaas registrado SEM adapter — ADR-024), webhook PAYMENT_CONFIRMED/REFUNDED/OVERDUE/FAILED via inbox, ledger dupla entrada (ADR-022/023), split AGENCY/LANDLORD determinístico + payout PENDING (ADR-025), banco de contas com validação de documento, reconciliação, jobs PAYMENT/PAYMENT_SCHEDULER/PAYMENT_RECONCILE. ADR-022/023/024/025.
- [x] 09 Meta MCP + Ads — Conexão Meta com token criptografado (ADR-028), ativos locais, AdProfile com validação de material/Housing/budget (ADR-031), criação de campanha CREATED_PAUSED via IMetaAdsProvider (Fake; Graph real SEM adapter — ADR-024-style), intents de alta impacto em meta_sync_jobs (ADR-029), insights em snapshots com spend em centavos, webhook via inbox (ADR-027), apps/meta-mcp com 17 tools stdio (ADR-026/030), RBAC meta:read/meta:write. ADR-026/027/028/029/030/031.
- [x] 10 Portals + Reporting — Portal externo proprietário/locatário com grant `portal_access` + token one-time → sessão opaca revogável (ADR-032), extratos (locatário/proprietário) sobre valores persistidos, contratos com content só SIGNED, vistorias como relatório estruturado sem mídia bruta (ADR-033), pagamento com QR via portal (idempotente), reporting KPIs (leads-funnel, receita mensal via ledger, spend Meta) e exportação segura CSV/JSON com RBAC report:export + rate limit + auditoria (ADR-034), paginação em payouts/reconciliations/ad-profiles, páginas web /proprietario e /inquilino. ADR-032/033/034 (+backfill 026-031).
- [ ] 11 Hardening
- [ ] 12 Final Audit
