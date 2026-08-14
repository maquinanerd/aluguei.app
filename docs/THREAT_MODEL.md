# Threat Model — Aluguei.app

Aplicado na Fase 11 (Hardening). Estrutura: ativo → ameaça → controle existente → verificação/teste. Todo controle listado tem código no repositório; nada aqui descreve comportamento não implementado.

## Ativos e classificação

| Ativo                                                     | Classificação           | Onde vive                                                                          |
| --------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Dados do locatário (PII: nome, CPF, endereço, financeiro) | Confidencial (LGPD)     | `parties`, `party_identities`, `charges`, `payments`                               |
| Dados do proprietário (PII + conta bancária)              | Confidencial            | `parties`, `party_bank_accounts`, `payouts`                                        |
| Contratos assinados (content + hash)                      | Confidencial            | `contracts`, `signature_envelopes`                                                 |
| Credenciais externas (token Meta, chaves providers)       | Secreto                 | env criptografado (`meta_connections.access_token_encrypted` AES-256-GCM, ADR-028) |
| Dinheiro (cobranças, ledger, repasse)                     | Integridade             | `charges`, `payments`, `ledger_entries` (dupla entrada, ADR-022/023)               |
| Anúncios Meta (gasto real)                                | Integridade/Autorização | `meta_campaign_links`, intents `meta_sync_jobs` (ADR-029)                          |

## Ameaças e controles

### 1. Vazamento entre organizações (cross-tenant)

- **Ameaça**: usuário/portal de org A lê ou altera dados de org B.
- **Controles**:
  - Escopo por org em toda query (`eq(tabela.orgId, auth.orgId)`) — padrão revisado por domínio.
  - `requirePermission` (RBAC estático) em toda rota autenticada.
  - Portal externo escopa por associação (`leases.tenantPartyId`, `property_owners`), nunca por input do client (ADR-032).
  - Erros não-pertence → `NOT_FOUND` (404), sem enumeração.
- **Testes**: `tests/integration/src/cross-org.test.ts`, `portal.test.ts` (isolamento negativo), `rbac.test.ts`, `meta.test.ts` (cross-org 404).

### 2. Roubo/replay de token (sessão, convite portal, webhook)

- **Ameaça**: token de sessão/convite capturado é reutilizado.
- **Controles**:
  - Sessão opaca: token aleatório 32B, só SHA-256 no DB, expiração + revogação (ADR-005; portal ADR-032).
  - Token one-time de portal: consumo único (hash zerado), expiração 7 dias, rate limit 20/min.
  - Webhooks: dedup `UNIQUE(provider, provider_event_id)` + 200 imediato; resposta de retry não duplica.
  - Cookie `HttpOnly` + `SameSite=Lax`; Bearer aceito (mobile).
- **Testes**: `portal.test.ts` (replay → 401, revogação → 401), `dedupe.test.ts`.

### 3. Abuso de endpoint (flooding, brute force, upload)

- **Ameaça**: brute force de login, spam de mensagens, abuso de presigned upload.
- **Controles**:
  - Rate limit global 300/min por IP (autenticado: por userId) + específicos:
    - auth login/register: 10/min · portal consume: 20/min · export: 10/min
    - upload-url/confirm: 60/min · mensagens: 60/min · webhooks: 300-600/min
  - `trustProxy: 'loopback'` (nunca irrestrito) + `x-forwarded-for` propagado pelo proxy Next quando presente (LB/CDN) — evita bucket único atrás de proxy. Sem XFF, o limite anônimo é global-por-proxy (risco aceito em single-instance/dev; em produção o LB deve inserir XFF).
  - `bodyLimit` 1MB e `maxParamLength` 128 (uploads reais via presigned PUT no storage).
  - Upload: MIME whitelist (jpeg/png/webp/pdf), limite por tipo (foto 10MB, doc 20MB), `headObject` revalida tamanho real, storageKey gerada pelo servidor com prefixo de org (ADR-007).
  - Store do rate limit: em memória por instância; com `REDIS_URL` configurado usa `RedisStore` (multi-instância).
- **Testes**: `properties.test.ts` (media RBAC/validação), `auth.flow.test.ts`, `hardening.test.ts` (429).

### 4. Injeção e dados maliciosos

- **Ameaça**: SQL injection, HTML/JS em campos renderizados, upload de arquivo malicioso.
- **Controles**:
  - Queries parametrizadas (drizzle), nunca interpolação de input.
  - Zod `.strict()` em requests (campos extras rejeitados).
  - React (Next) escapa output por padrão; helmet (CSP/headers) ativo.
  - MIME real validado server-side no confirm de upload.
- **Testes**: contratos `*.test.ts` (strict), validações de media.

### 5. Segredo vazado (código, log, frontend, LLM)

- **Ameaça**: credencial em commit, log, resposta de API ou prompt de LLM.
- **Controles**:
  - `scripts/security-scan.mjs` (padrões de segredo) roda local + CI (bloqueante).
  - Logger com `redact` de password/token/secret/authorization/apiKey (pino).
  - Token Meta: criptografado AES-256-GCM no DB; MCP só recebe IDs locais (ADR-026/028); `toToolError` sanitiza URL/token.
  - `sanitizeError` em jobs (worker) remove URLs.
  - Nenhum segredo em fixture/commit — CI falha no secret scan.
- **Testes**: `meta-mcp/src/stdio.test.ts` (nenhuma tool aceita/retorna token), `secrets` roundtrip (config).

### 6. Integridade financeira

- **Ameaça**: duplicar/alterar cobrança, pagamento, repasse.
- **Controles**:
  - Dinheiro em centavos inteiros; ledger dupla entrada com soma=0 e idempotência `UNIQUE(transaction, account)` (ADR-022/023).
  - Máquinas de estado (Charge/Lease/Payment) com transições validadas (nunca ACTIVE de anúncio sem intent de runtime — ADR-029).
  - Pagamento idempotente no portal (reusa payment PENDING).
- **Testes**: `finance.test.ts` (ledger balanceado, split), `metaJobs.test.ts`, `portal.test.ts`.

### 7. Housing/Publicidade Meta

- **Ameaça**: anúncio de imóvel com targeting discriminatório (viola política Meta).
- **Controles**: `validateHousingTargeting` rejeita gênero/idade máxima/audiências customizadas/geo fora da org; `special_ad_categories: ['HOUSING']` obrigatório (ADR-031).
- **Testes**: `meta.test.ts` (domain), integração `meta.test.ts` (rejeição).

### 8. Disponibilidade

- **Ameaça**: queda de banco, fila presa.
- **Controles**:
  - `/health` (liveness) + `/health/ready` (checa DB, 503 sem detalhes internos).
  - Fila Postgres com claim SKIP LOCKED + reaper (RUNNING preso → PENDING) + retry com backoff (ADR-010/014).
- **Testes**: `heartbeat.test.ts`, health em testes de integração.

## Gap residual (aceito/documentado)

- 2 vulnerabilidades `pnpm audit --prod` — `image-size` (DoS em parser de imagem usado pelo metro/Expo): o fix publicado exige `>=2.0.3`, que NÃO existe no npm (última 2.0.2; 2.x quebra o metro). Mantido 1.2.1 por compatibilidade; não exposto em runtime da API/CRM; monitorar via `pnpm security:audit` no CI (informativo) + gate bloqueante para novos critical. A vuln moderate `uuid` (bounds check) foi resolvida via `pnpm.overrides: { uuid: '>=11.1.1' }` (pnpm-workspace.yaml).
- Entrega de token de portal por e-mail: manual no MVP (sem provider de e-mail) — `IMPLEMENTED_NOT_LIVE_VERIFIED` (docs/BLOCKERS.md).

## Correções aplicadas nesta fase

- `/health/ready` com checagem de DB (503 honesto).
- Rate limits em upload-url/confirm, mensagens; keyGenerator por usuário autenticado.
- `trustProxy: 'loopback'` + propagação de `x-forwarded-for` no proxy Next (evita bucket único atrás de proxy — P1 do security review); `RedisStore` quando `REDIS_URL` presente.
- `bodyLimit` 1MB + `maxParamLength` 128.
- Error handler respeita statusCode 4xx do framework (429/413 não viram 500) + log debug.
- Secret scan automatizado (local + CI) com allowlist por valor exato e padrões ampliados (sk-, xoxb-, rk_live-, SG., connection strings).
- CI: audit informativo + step bloqueante para novos critical.
- A11y no login (erro único com role=alert), mobile offline banner sem falso positivo no native, error boundary com mensagem genérica.
- Testes cross-tenant ampliados (meta/portal/reporting/rate limit/webhook dedup).
