# Decisões arquiteturais

Registro append-only simplificado. O agente adiciona decisões reversíveis tomadas sem perguntar ao usuário.

| ID      | Data       | Decisão                                           | Motivo                                                              | Alternativas                  | Reversibilidade |
| ------- | ---------- | ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------- | --------------- |
| ADR-001 | bootstrap  | Monorepo TypeScript                               | Compartilhar contratos e reduzir linguagens no produto independente | C# + TS, microserviços        | alta            |
| ADR-002 | bootstrap  | Modular monolith + workers                        | Menos complexidade operacional inicial                              | microserviços                 | média           |
| ADR-003 | bootstrap  | Meta Ads como MCP interno + adapter Marketing API | Permitir operação por agente sem expor tokens                       | chamadas Meta direto pelo LLM | alta            |
| ADR-004 | 2026-08-13 | Toolchain e versões pinadas da Fase 01            | Determinismo e compatibilidade do ecossistema                       | versões floating              | alta            |

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
