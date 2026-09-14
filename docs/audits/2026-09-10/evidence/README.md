# Evidências da auditoria 2026-09-10

Material bruto que sustenta os documentos `00`–`14`. Nada aqui contém credenciais reais: os cookies de sessão e tokens de portal (de um banco descartável já destruído) foram substituídos por `<redacted>`.

## Conteúdo

| Pasta/arquivo                                                                   | O que é                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent_reports/agent_A_db.md`                                                   | Auditoria estática do banco (72 tabelas, FKs, uniques, órfãs, colunas nunca escritas)                                                                              |
| `agent_reports/agent_B_api.md`                                                  | Inventário completo dos 154 endpoints (auth, permissão, schemas, tabelas, domínio, audit, escopo de org), contracts (306 schemas), domínio (12 máquinas de estado) |
| `agent_reports/agent_C_web.md`                                                  | Matriz por página, matriz de cadastros, BFF, 107 chamadas de API do web com arquivo:linha                                                                          |
| `agent_reports/agent_D_integrations.md`                                         | Integrações, worker, MCP, storage, config, observabilidade, IA                                                                                                     |
| `agent_reports/agent_E1_security.md`                                            | Threat review estático                                                                                                                                             |
| `agent_reports/agent_E2_finance.md`                                             | Auditoria financeira (dinheiro, split, ledger, caminhos de crédito, cenários a–j, provas propostas)                                                                |
| `agent_reports/agent_F_mobile_kalel.md`                                         | Mobile (MOBILE PARCIAL) + reconhecimento do frontend de referência Kal El                                                                                          |
| `agent_reports/agent_G_docs.md`                                                 | Afirmações da documentação histórica × código, contradições, higiene                                                                                               |
| `scripts/probe.mjs`                                                             | Jornada + CRUD + RBAC + cross-tenant + portal + webhooks (HTTP)                                                                                                    |
| `scripts/probe_b.mjs`, `probe_c.mjs`                                            | Verificação dos achados do agente de API; Meta dry-run; sugestão de IA; consentimento cross-org                                                                    |
| `scripts/probe_acq.mjs`                                                         | Aquisição: WhatsApp inbound FAKE, import de canal FAKE, Meta dry-run                                                                                               |
| `scripts/crawl.mjs`, `crawl_mobile.mjs`                                         | Crawler Playwright (desktop autenticado/anônimo; mobile 375 px)                                                                                                    |
| `scripts/extract-routes.mjs`                                                    | Extração mecânica das rotas da API                                                                                                                                 |
| `scripts/build-api-matrix.mjs`                                                  | Gera a tabela do documento 05                                                                                                                                      |
| `scripts/run-gates.sh`                                                          | Execução sequencial dos gates                                                                                                                                      |
| `scripts/zz-audit-races.tmp.test.ts.archived`                                   | Harness temporário in-process (removido do repositório após a execução)                                                                                            |
| `results/*_sanitized.jsonl`                                                     | Saída das provas HTTP (1 linha por passo)                                                                                                                          |
| `results/races_result_*.json`, `races_first_run.log`                            | Resultados do harness (S1, S1b, S1c, S2, S3, S4, S5, S6, S8, S9)                                                                                                   |
| `results/crawl_results.json`, `crawl_mobile_results.json`                       | Resultados do crawler                                                                                                                                              |
| `results/routes.tsv`                                                            | 154 rotas (método, path, arquivo:linha, permissão)                                                                                                                 |
| `results/gates_summary.txt` (com cache) / `gates_force_summary.txt` (sem cache) | Gates                                                                                                                                                              |
| `results/pnpm_audit_prod_summary.txt`                                           | Advisories por severidade/pacote                                                                                                                                   |
| `results/e2e_playwright.log`                                                    | Playwright 3/3                                                                                                                                                     |

## Como reproduzir (Windows, PostgreSQL 17 local em `C:\Program Files\PostgreSQL\17\bin`)

Os scripts têm caminhos absolutos do scratchpad desta sessão; ajuste `SP`/`ROOT` antes de rodar.

```bash
# 1) cluster descartável (não use o serviço da máquina); rode em background e com -l (log em arquivo)
initdb -D <dir>/pg -U postgres -A trust -E UTF8
pg_ctl -D <dir>/pg -o "-p 55432" -l <dir>/pg.log start      # não canalize a saída (trava no Windows)
psql -h localhost -p 55432 -U postgres -c "CREATE DATABASE aluguei_audit;"
DATABASE_URL=postgresql://postgres@localhost:55432/aluguei_audit pnpm --filter @aluguei/db db:apply

# 2) API e worker com providers FAKE (sem efeitos externos)
export DATABASE_URL=postgresql://postgres@localhost:55432/aluguei_audit META_MODE=dry_run AI_PROVIDER=mock \
  PAYMENT_PROVIDER=FAKE SIGNATURE_PROVIDER=FAKE SCREENING_PROVIDER=FAKE NODE_ENV=development
API_PORT=4100 API_HOST=127.0.0.1 APP_BASE_URL=http://localhost:3417 COOKIE_SECURE=false node --import tsx apps/api/src/index.ts
node --import tsx apps/worker/src/index.ts

# 3) web (use next dev: next start exige API_BASE_URL https)
cd apps/web && API_BASE_URL=http://127.0.0.1:4100 APP_BASE_URL=http://localhost:3417 PUBLIC_ORG_SLUG=<slug> ./node_modules/.bin/next dev -p 3417

# 4) provas
node probe.mjs && node probe_b.mjs && node probe_c.mjs && node probe_acq.mjs && node crawl.mjs
```

Gates: use `--force` (o cache do turbo reproduz logs antigos). Prettier no Windows: sem `.gitattributes`, o checkout em CRLF falha em ~630 arquivos; confira com `pnpm exec prettier --check . --end-of-line auto`.
