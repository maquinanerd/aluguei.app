# Decisões arquiteturais

Registro append-only simplificado. O agente adiciona decisões reversíveis tomadas sem perguntar ao usuário.

| ID      | Data       | Decisão                                                                    | Motivo                                                                           | Alternativas                                  | Reversibilidade |
| ------- | ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | --------------- |
| ADR-001 | bootstrap  | Monorepo TypeScript                                                        | Compartilhar contratos e reduzir linguagens no produto independente              | C# + TS, microserviços                        | alta            |
| ADR-002 | bootstrap  | Modular monolith + workers                                                 | Menos complexidade operacional inicial                                           | microserviços                                 | média           |
| ADR-003 | bootstrap  | Meta Ads como MCP interno + adapter Marketing API                          | Permitir operação por agente sem expor tokens                                    | chamadas Meta direto pelo LLM                 | alta            |
| ADR-004 | 2026-08-13 | Toolchain e versões pinadas da Fase 01                                     | Determinismo e compatibilidade do ecossistema                                    | versões floating                              | alta            |
| ADR-005 | 2026-08-13 | Autenticação: sessão opaca em DB + cookie HttpOnly (web) / Bearer (mobile) | Revogação imediata, sem gestão de segredo JWT, web e mobile consomem a mesma API | JWT assinado (@fastify/jwt), sessões em Redis | alta            |
| ADR-006 | 2026-08-13 | Segurança do gate da Fase 02 (pós-review)                                  | Fechar P1/P2 de enumeração, contrato de erro e CSRF antes de expor auth          | aceitar dívida                                | alta            |

## ADR-006 — Correções de segurança do gate da Fase 02 (2026-08-13)

Status: Aceito.

Contexto: review independente e auditoria de segurança apontaram P1 (enumeração de e-mail via 500 no login) e P2 (500 em rotas por :id/cross-org, dedupe por valor apenas, rate limit ausente em auth, login-CSRF via proxy web, último owner rebaixável, logout sem audit).

Decisões:

- Login anti-enumeração: e-mail inexistente e senha errada retornam 401 idêntico; hash dummy pré-computado (`hashPasswordSync`) uniformiza o tempo de resposta.
- Contrato de erro: rotas por `:id`/org-alvo retornam 404 (sem enumeração) ou 400 (uuid inválido validado por zod) em vez de 500.
- Deduplicação casa por par `(kind, value)` (nunca apenas valor) — evita falso positivo entre kinds.
- Rate limit: 10 req/min em `/auth/register` e `/auth/login` (além do global 300/min).
- Login-CSRF: route handlers do Next exigem header `Origin` igual a `APP_BASE_URL` (403 caso contrário).
- Guarda do último owner: PATCH/DELETE de membership negam rebaixar/remover o último owner da org.
- Logout grava `AUTH_LOGOUT` em audit.

Dívidas registradas (fases futuras): revogação de sessão por token (hoje por org ativa), escopo de referências em POSTs (partyId/leadId/propertyId de outras orgs), N+1 em `GET /parties`, cleanup de sessões expiradas/audit, serializer de query string em logs.

## ADR-005 — Autenticação: sessão opaca em DB (cookie HttpOnly + Bearer)

Status: Aceito. Fase 02, 2026-08-13.

Contexto: monorepo modular monolith com API Fastify (fonte de verdade), Next web e Expo mobile. Exigências de docs/SECURITY.md: cookies HttpOnly/Secure/SameSite, rate limiting em auth, CSRF quando aplicável, auditoria. Fluxo email+senha nesta fase, sem SMS/2FA (gancho para TOTP futuro).

Decisão:

- Sessão: token opaco de 32 bytes (`crypto.randomBytes` → base64url), armazenado como SHA-256 hex em `user_sessions` (DB leak não expõe tokens válidos). Sem JWT: revogação imediata no logout, sem segredo de assinatura nem estado de revogação extra. Uma lookup por PK indexada por request é aceitável no monolith.
- Entrega: cookie `aluguei_session` HttpOnly, SameSite=Lax, Secure em produção, Path=/; o MESMO token aceito via `Authorization: Bearer <token>` (mobile).
- Senha: argon2id via `@node-rs/argon2@2.1.0` (prebuilds por plataforma; fallback documentado `bcryptjs` se o binário falhar).
- Rate limiting: `@fastify/rate-limit@11.2.0` (300 req/min global; constante revisável).
- CSRF: SameSite=Lax bloqueia POST cross-site com cookie; reforço por verificação de Origin em mutações futuras se a API for cross-site.
- TTL: 30 dias (`SESSION_TTL_SECONDS`); revogação explícita no logout; renovação deslizante adiada.
- RBAC estático por role (sem tabela `permissions`); funil em `text` validado no domínio (funil configurável em fases futuras).
- Testes de DB sem Docker: `@electric-sql/pglite@0.5.5` (Postgres 17 WASM) + `drizzle-orm/pglite`, migrations versionadas aplicadas — CI sem serviço externo.
- Decisões D1–D10 do architect aceitas (Lead = entidade do funil; `lead_property_interests` join sem FK até Fase 03; mobile sem telas de auth nesta fase; 404 cross-org / 403 sem permissão; sem camada de repositório; E2E Playwright adiado).

Consequências: revogação server-side imediata; cookie e Bearer compartilham o token; sem segredos JWT a rotacionar. Reversibilidade: alta (emissor de sessão é interno à API).

## ADR-004 — Toolchain e versões pinadas (Fase 01, 2026-08-13)

Status: Aceito.

Contexto: Fase 01 exige detectar e pinar versões estáveis atuais do toolchain.

Decisões:

- TypeScript **6.0.3** (não 7.0.2): typescript-eslint 8.67.0 declara peer `typescript >=4.8.4 <6.1.0`; o compilador TS7 não é suportado pelo ecossistema de lint. Migração futura em fase dedicada.
- React unificado em **19.2.3** (web e mobile): Expo SDK 57 fixa react 19.2.3 / RN 0.86.x; Next 16.3.0 aceita `^19`. Versão única evita react duplicado no monorepo.
- Expo SDK **57.0.12** + React Native **0.86.x** (versão resolvida via `expo install`): linha estável atual; build nativo não é gate da Fase 01.
- Lint: **ESLint 10.8.1** (flat config) + **typescript-eslint 8.67.0** + **Prettier 3.9.6**. eslint-config-next e @biomejs/biome adiados.
- Migrations: **drizzle-kit generate** produz SQL versionado commitado (geração/validação DB-free); **drizzle-orm 0.45.2** + **pg 8.23.0**. Postgres local apenas via docker-compose opcional.
- Observabilidade: **pino 10.3.1** (logs estruturados) + **OpenTelemetry** (api 1.9.1; sdk-node/exporter 0.221.0; instrumentation-fastify 0.57.0); tracer noop/simple por padrão, OTLP somente com `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Storage: interface `StorageService` + adapter S3-compatible com **@aws-sdk/client-s3 3.1109.0** (baseline Cloudflare R2).
- Engine: **Node >= 24** (LTS), `@types/node 24.13.3`, `packageManager pnpm@11.15.1`.
- Runtime dos pacotes consome `src/` via `exports` (monorepo); a troca para `dist/` acontecerá no hardening (Fase 11), quando houver publicação/deploy real.

Consequências: toolchain determinístico e compatível entre si; atualização do TS7 em fase própria; runtime src-first até o hardening.
