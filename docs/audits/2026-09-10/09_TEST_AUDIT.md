# 09 — Auditoria de testes e gates

## 1. Gates executados hoje

Primeira execução veio **100% do cache do turbo** ("24 cached, 24 total — FULL TURBO"); por isso lint/typecheck/test/build foram reexecutados com `--force` (sem cache). Resultados abaixo são os forçados.

| Gate               | Comando                                       | Resultado                                         | Duração | Observação                                                                                                                                                                                              |
| ------------------ | --------------------------------------------- | ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install            | `pnpm install --frozen-lockfile`              | ✅                                                | 53 s    | 813 pacotes, lockfile íntegro                                                                                                                                                                           |
| Format             | `pnpm format:check`                           | ❌                                                | 10 s    | 631 arquivos no checkout Windows (CRLF, `core.autocrlf=true`, sem `.gitattributes`); com `--end-of-line auto` resta **1 arquivo real**: `docs/production-readiness/SESSION_REPORT.md` → **CI vermelho** |
| Lint               | `pnpm lint --force --continue`                | ✅                                                | 120 s   | não inclui `eslint-plugin-react-hooks` (deixou passar P1-04)                                                                                                                                            |
| Typecheck          | `pnpm typecheck --force --continue`           | ✅                                                | 82 s    | —                                                                                                                                                                                                       |
| Test               | `pnpm test --force --continue`                | ✅                                                | 322 s   | 24/24 tarefas, 0 cache                                                                                                                                                                                  |
| Build              | `pnpm build --force --continue`               | ✅                                                | 145 s   | 12/12; Next lista 44 páginas + 7 handlers                                                                                                                                                               |
| Secret scan        | `pnpm security:scan`                          | ✅                                                | 2 s     | não varre conteúdo de zip                                                                                                                                                                               |
| Audit prod         | `pnpm security:audit`                         | ❌ (informativo no CI)                            | 3 s     | 44 vulns: **2 critical**, 31 high, 11 moderate                                                                                                                                                          |
| Audit critical     | `pnpm security:audit --audit-level=critical`  | ❌ (**bloqueante no CI**)                         | 3 s     | `next` 16.3.0                                                                                                                                                                                           |
| Migrations         | `pnpm db:generate` + `git status packages/db` | ✅ sem drift                                      | 4 s     | índice parcial manual invisível (ver 02)                                                                                                                                                                |
| Migrations do zero | `db:apply` em banco vazio (2×)                | ✅                                                | 2,8 s   | idempotente                                                                                                                                                                                             |
| E2E                | `pnpm --dir tests/e2e test:e2e`               | ✅ **3/3** (stack manual) · ❌ boot automático 2× | 21,9 s  | ver 06 §3                                                                                                                                                                                               |

## 2. Contagem de testes (executados, sem cache)

| Suíte                                            | Arquivos | Testes  | Pass    | Fail  | Skip  |
| ------------------------------------------------ | -------- | ------- | ------- | ----- | ----- |
| `@aluguei/domain`                                | 13       | 96      | 96      | 0     | 0     |
| `@aluguei/integrations`                          | 15       | 154     | 154     | 0     | 0     |
| `@aluguei/tests-integration` (PGlite + API real) | 17       | 93      | 93      | 0     | 0     |
| `@aluguei/tests-contract`                        | 1        | 10      | 10      | 0     | 0     |
| `@aluguei/web`                                   | 5        | 10      | 10      | 0     | 0     |
| `@aluguei/worker`                                | 4        | 9       | 9       | 0     | 0     |
| `@aluguei/storage`                               | 1        | 8       | 8       | 0     | 0     |
| `@aluguei/contracts`                             | 2        | 7       | 7       | 0     | 0     |
| `@aluguei/meta-mcp` (protocolo stdio)            | 1        | 7       | 7       | 0     | 0     |
| `@aluguei/ui`                                    | 1        | 6       | 6       | 0     | 0     |
| `@aluguei/mobile`                                | 1        | 5       | 5       | 0     | 0     |
| `@aluguei/api`                                   | 2        | 5       | 5       | 0     | 0     |
| `@aluguei/config`                                | 1        | 4       | 4       | 0     | 0     |
| `@aluguei/observability`                         | 1        | 4       | 4       | 0     | 0     |
| **Total vitest**                                 | **65**   | **418** | **418** | **0** | **0** |
| Playwright E2E                                   | 1        | 3       | 3       | 0     | 0     |

**TOTAL 421 · PASS 421 · FAIL 0 · SKIP 0 · FLAKY 0 observado** (a infraestrutura de boot do E2E é instável; os testes em si não oscilaram).

## 3. Provas adicionais executadas nesta auditoria (fora da suíte)

| Prova                                                                                                                                       | O que cobre                                                                                                                             | Resultado                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Probes HTTP (`probe.mjs` + `probe_b/c/acq`)                                                                                                 | jornada, CRUD, RBAC, cross-tenant (~60 tentativas), portal, webhooks, Meta, WhatsApp, canais                                            | 214 PASS / 19 FAIL (os FAIL são os achados) + 3 rodadas complementares |
| Crawler desktop/mobile                                                                                                                      | 44 páginas autenticadas + anônimas; 35 a 375 px                                                                                         | 17 páginas com 400; 1 crash; 0 overflow                                |
| Navegador                                                                                                                                   | dashboard, novo anúncio, termos financeiros                                                                                             | dados falsos, select vazio, R$ 3,50                                    |
| **Harness temporário** (`tests/integration/src/zz-audit-races.tmp.test.ts`, criado, executado e **removido**; cópia em `evidence/scripts/`) | concorrência de pagamento, repasse, estorno forjado, portal SCHEDULED, cancelar→pagar, 2 cobranças/mês, juros, coproprietários, balanço | P0-01, P0-02, P0-03, P1-07, P1-08 PROVADOS                             |
| Backup/restore                                                                                                                              | pg_dump/pg_restore em banco descartável                                                                                                 | RESTORE MATCH                                                          |
| Boot com `REDIS_URL`                                                                                                                        | rate limit distribuído                                                                                                                  | API não sobe                                                           |
| 2 workers simultâneos                                                                                                                       | SKIP LOCKED                                                                                                                             | sem duplicidade observada                                              |

## 4. Lacunas de cobertura (o que nenhum teste pega hoje)

1. **Concorrência e idempotência financeira** (worker de pagamento, reaper, eventos duplicados com IDs diferentes) — nenhum teste; o harness mostrou duplicação.
2. Estorno, cancelamento, scheduler, conciliação, confirmação de pagamento via portal, coproprietários, atomicidade.
3. Webhook de pagamento sem token em produção; payload **nativo** do Asaas; wiring Clicksign (documento/provider).
4. UI: nenhum teste de componente/E2E exercita criação de anúncio/proposta/vistoria/contrato, logout, cancelar cobrança, export CSV, detalhe de vistoria, entrada monetária pt-BR. Lint sem regra de hooks.
5. Limites de paginação (`limit` > 100) e contrato BFF ↔ API (content-type).
6. Isolamento multi-tenant **por referência** (os testes `cross-org` cobrem acesso direto por ID, não IDs de outra org no corpo).
7. Imutabilidade de contrato assinado; transições de crédito via PATCH.
8. Resolução de sugestão de IA seguida de leitura da vistoria.
9. Mobile: só o cliente HTTP (5 testes).
10. E2E: não roda no CI; cobre só o caminho feliz; não verifica PAID.

## 5. CI

Pipeline existe e é adequado em estrutura (format → lint → typecheck → secret scan → audit → test → drift → build), **mas está vermelho hoje** (format + audit critical) e **não tem E2E**. O cache do turbo pode mascarar execuções locais — usar `--force` em auditorias.
