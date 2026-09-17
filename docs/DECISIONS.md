# Decisões arquiteturais

Registro append-only simplificado. O agente adiciona decisões reversíveis tomadas sem perguntar ao usuário.

| ID      | Data       | Decisão                                                                                                                                                                                                                                                                                                | Motivo                                                                                | Alternativas                                    | Reversibilidade |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------- |
| ADR-001 | bootstrap  | Monorepo TypeScript                                                                                                                                                                                                                                                                                    | Compartilhar contratos e reduzir linguagens no produto independente                   | C# + TS, microserviços                          | alta            |
| ADR-002 | bootstrap  | Modular monolith + workers                                                                                                                                                                                                                                                                             | Menos complexidade operacional inicial                                                | microserviços                                   | média           |
| ADR-003 | bootstrap  | Meta Ads como MCP interno + adapter Marketing API                                                                                                                                                                                                                                                      | Permitir operação por agente sem expor tokens                                         | chamadas Meta direto pelo LLM                   | alta            |
| ADR-004 | 2026-08-13 | Toolchain e versões pinadas da Fase 01                                                                                                                                                                                                                                                                 | Determinismo e compatibilidade do ecossistema                                         | versões floating                                | alta            |
| ADR-005 | 2026-08-13 | Autenticação: sessão opaca em DB + cookie HttpOnly (web) / Bearer (mobile)                                                                                                                                                                                                                             | Revogação imediata, sem gestão de segredo JWT, web e mobile consomem a mesma API      | JWT assinado (@fastify/jwt), sessões em Redis   | alta            |
| ADR-006 | 2026-08-13 | Segurança do gate da Fase 02 (pós-review)                                                                                                                                                                                                                                                              | Fechar P1/P2 de enumeração, contrato de erro e CSRF antes de expor auth               | aceitar dívida                                  | alta            |
| ADR-007 | 2026-08-13 | Upload de mídia via presigned PUT (R2/S3) + confirmação server-side                                                                                                                                                                                                                                    | Sem credencial no frontend, MIME real validado no confirm, sem multipart              | multipart via API                               | alta            |
| ADR-008 | 2026-08-13 | Geocoding: adapter Google Maps REST + mock determinístico                                                                                                                                                                                                                                              | Sem SDK; mock em dev/test; produção sem chave retorna null (nunca dados falsos)       | SDK oficial                                     | alta            |
| ADR-009 | 2026-08-13 | Modelo Fase 03: soft delete de property, FKs SET NULL, fonte única de preço, slug único                                                                                                                                                                                                                | Auditoria, integridade de referências, sem drift de preço                             | hard delete, priceCents no listing              | média           |
| ADR-010 | 2026-08-13 | Jobs de canal: fila no Postgres com claim atômico (SKIP LOCKED), sem BullMQ/Redis                                                                                                                                                                                                                      | CI sem Redis, PGlite suporta, volume de portais não exige fila externa                | BullMQ+Redis, outbox-only                       | média           |
| ADR-011 | 2026-08-13 | IListingChannelAdapter em @aluguei/integrations + FakeChannel de referência; canais reais registrados sem adapter                                                                                                                                                                                      | Sem contrato oficial de portal acessível — nunca inventar endpoints                   | package dedicado, endpoints de portal fictícios | alta            |
| ADR-012 | 2026-08-13 | conversation_intents em tabela própria (não payload de timeline)                                                                                                                                                                                                                                       | Intents são extrações reutilizáveis/queryáveis, não eventos                           | timeline payload                                | alta            |
| ADR-013 | 2026-08-13 | properties.code (UNIQUE org) para código/link do imóvel no WhatsApp                                                                                                                                                                                                                                    | Slug é por anúncio; código curto amigável                                             | slug do listing                                 | média           |
| ADR-014 | 2026-08-13 | Webhook WhatsApp processado via webhook_inbox (inbox/outbox)                                                                                                                                                                                                                                           | SECURITY.md exige inbox; Meta retenta falhas; resposta 200 imediata                   | processar inline, channel_sync_jobs             | média           |
| ADR-015 | 2026-08-13 | Privacy guard: mídia de vistoria em tabela própria SEM isPublic                                                                                                                                                                                                                                        | Impossível marcar vistoria como pública por construção; prefixos de storage distintos | coluna isPublic                                 | alta            |
| ADR-016 | 2026-08-13 | Processamento de vistoria reutiliza webhook_inbox (provider INSPECTION)                                                                                                                                                                                                                                | Fila genérica + claim SKIP LOCKED + retry/reaper existentes                           | job table própria, BullMQ                       | média           |
| ADR-017 | 2026-08-13 | Modelo Fase 06: InspectionAudio fundido em inspection_media, checklist=observações, relatório=snapshot, mobile API-first                                                                                                                                                                               | Menos tabelas, checklist extensível, PDF em fase 10, UI sobre API estável             | audio separado, checklist jsonb                 | média           |
| ADR-018 | 2026-08-13 | Consentimento LGPD obrigatório antes de screening (party_consents CREDIT_SCREENING ativo)                                                                                                                                                                                                              | LGPD + auditoria; índice único parcial por (party, purpose) ativo                     | sem consentimento                               | alta            |
| ADR-019 | 2026-08-13 | Decisão de crédito por regras determinísticas explicáveis (decision_rules persistido); IA nunca decide                                                                                                                                                                                                 | SECURITY.md exige decisões automatizadas explicáveis/revisáveis                       | IA na decisão                                   | alta            |
| ADR-020 | 2026-08-13 | Webhook de assinatura via webhook_inbox (provider SIGNATURE)                                                                                                                                                                                                                                           | Reusa claim/retry/reaper; 200 imediato; dedup por UNIQUE                              | inline                                          | média           |
| ADR-021 | 2026-08-13 | Modelo Fase 07: decision fundido em screening_results; template versionado na própria tabela; Guarantee adiado (GUARANTOR em contract_parties); lease_id para Fase 08                                                                                                                                  | Menor schema, histórico de versões aprovadas                                          | tabela de decisões, tabela de versões           | média           |
| ADR-022 | 2026-08-13 | Dinheiro em centavos inteiros em todo o domínio financeiro; datas em UTC; multiplicadores em bps                                                                                                                                                                                                       | Evitar float e arredondamento duplo; cálculo determinístico e auditável               | decimal no DB, microcentavos                    | alta            |
| ADR-023 | 2026-08-13 | Ledger dupla entrada via postLedgerTransaction (DEBIT positivo/CREDIT negativo, soma=0, idempotente por transaction+account)                                                                                                                                                                           | Razão auditável; balanceamento garantido por construção                               | ledger eventualmente consistente                | média           |
| ADR-024 | 2026-08-13 | IPaymentProvider + FakePaymentProvider determinístico; Asaas registrado SEM adapter (rotas 400 'não configurado')                                                                                                                                                                                      | Sem credencial/documentação oficial — nunca inventar endpoints                        | SDK Asaas, endpoints fictícios                  | alta            |
| ADR-025 | 2026-08-13 | Split determinístico por regra (agencyShareBps default 10%); comissão nunca excede pagamento; payout PENDING                                                                                                                                                                                           | Previsibilidade de repasse; sem efeito real de dinheiro em dev                        | split por valor livre no payout                 | média           |
| ADR-026 | 2026-08-13 | MCP via @modelcontextprotocol/sdk 1.30.0 stdio; token Meta nunca no contexto do LLM (IDs locais + backend resolve segredo)                                                                                                                                                                             | Spec META_MCP.md; zod 4 compatível                                                    | SDK alternativo, token no tool input            | alta            |
| ADR-027 | 2026-08-13 | Webhook Meta processado via webhook_inbox (provider META); meta_webhook_events é archive/dedup, não segunda fila                                                                                                                                                                                       | Reuso do claim SKIP LOCKED/retry/reaper (ADR-010/014/016/020)                         | fila própria                                    | média           |
| ADR-028 | 2026-08-13 | Token Meta por conexão criptografado AES-256-GCM (META_TOKEN_ENCRYPTION_KEY + tokenKeyId) em @aluguei/config                                                                                                                                                                                           | SECURITY.md exige token externo criptografado; token por org                          | texto claro, KMS externo                        | alta            |
| ADR-029 | 2026-08-13 | Publish/resume/budget/schedule/creative/archive são INTENTS (meta_sync_jobs): dry_run executa no fake; live exige adapter homologado e intenção de runtime                                                                                                                                             | SECURITY.md: alta impacto exige intenção explícita do usuário                         | execução direta via MCP                         | média           |
| ADR-030 | 2026-08-13 | Tools MCP v1 = 7 read + 10 write (spec META_MCP.md); UI Meta Ads fora da Fase 09 (rotas API são o contrato estável)                                                                                                                                                                                    | Spec é fonte de verdade; UI mínima atual fica para fases de UI/reporting              | 12+12 tools, UI na fase                         | alta            |
| ADR-031 | 2026-08-13 | Limites de budget/geo por org em meta_org_settings; housingTargetingAllowed                                                                                                                                                                                                                            | Org não tem settings; app_metadata é global; política Housing por org                 | colunas em organizations, app_metadata          | alta            |
| ADR-032 | 2026-08-14 | Portal externo (proprietário/locatário): acesso via portal_access (grant por party+kind) + token one-time consumido → sessão opaca própria (portal_sessions), sem User interno                                                                                                                         | Parties não são users/members; sessão interna não pode ser reutilizada; revogável     | login com senha, JWT longo prazo                | média           |
| ADR-033 | 2026-08-14 | Visibilidade de vistoria no portal: relatório estruturado (rooms, observações CONFIRMED, transcripts, contagens) SEM mídia bruta no MVP                                                                                                                                                                | ADR-015 privacy guard; mídia privada não deve vazar; relatório é snapshot             | download de mídia autorizada                    | média           |
| ADR-034 | 2026-08-14 | Exportação segura: RBAC report:export, máximo 10.000 linhas, rate limit, auditoria, colunas por whitelist por role (sem PII desnecessária/credenciais)                                                                                                                                                 | SECURITY.md: PII mínima; exportação é ação sensível                                   | exportação assíncrona, sem limites              | alta            |
| ADR-035 | 2026-08-14 | Hardening de rede: trustProxy=loopback (nunca irrestrito) + XFF propagado pelo proxy Next; rate limit global 300/min por IP (userId autenticado) com RedisStore quando REDIS_URL; error handler respeita statusCode 4xx do framework                                                                   | Evitar bucket único atrás de proxy e spoofing de IP; 429/413 não viram 500            | trustProxy irrestrito, bucket por proxy         | alta            |
| ADR-036 | 2026-08-17 | Mobile field operation MVP (Expo): cliente HTTP com captura/reenvio de sessão (Cookie + Bearer), router por estado no App.tsx (login/agenda/visit-detail/inspection/inspection-review), agenda = SCHEDULED+CONFIRMED (schema visits não tem OPEN), tokens PEG/brand locais sem dependência @aluguei/ui | Mobile API-first; sem dependências novas; contrato de visits é a fonte de verdade     | react-navigation, AsyncStorage de sessão        | alta            |

## ADR-010 — Jobs de canal: fila no Postgres (Fase 04)

Status: Aceito.

Contexto: worker é shell; BullMQ não instalado; Redis opcional (docker-compose); CI roda PGlite sem serviços externos.

Decisão: `channel_sync_jobs` como fila no próprio Postgres. Claim atômico com `UPDATE ... WHERE id IN (SELECT ... WHERE status='PENDING' AND run_at <= now() ORDER BY created_at LIMIT n FOR UPDATE SKIP LOCKED) RETURNING` (PGlite suporta SKIP LOCKED). Retry/backoff via coluna `run_at = now() + LEAST(POWER(2, attempts), 600)s`. Idempotência: `idempotency_key` UNIQUE (PUBLISH/REMOVE por org+listing+channel; UPDATE inclui hash canônico do payload; IMPORT_LEADS por timestamp) com `ON CONFLICT DO UPDATE` reusando a linha (retry nunca duplica). BullMQ fica atrás da fachada `runChannelJobs` se o volume exigir. Reversibilidade: média.

## ADR-011 — Adapter de canal + FakeChannel (Fase 04)

Status: Aceito.

Contexto: sem documentação oficial/contratual acessível de Canal Pro/VivaReal/ZAP/OLX/Imovelweb; docs/INTEGRATIONS.md proíbe inventar endpoints.

Decisão: `IListingChannelAdapter` (validate/publish/update/remove/reconcile/importLeads) e tipos em `@aluguei/integrations/src/channels/`; `FakeChannel` determinístico com falhas injetáveis (`failNext`) como adapter de referência; registry com canais reais registrados SEM adapter (`adapter: null`) → rotas respondem 404 "canal não configurado". Contrato de idempotência dos adapters: `channelListingId` determinístico por (channel, externalId); remove de inexistente = sucesso. Reversibilidade: alta.

## ADR-007 — Upload de mídia: presigned PUT + confirm (Fase 03)

Status: Aceito.

Contexto: fotos/documentos de imóvel no R2/S3. SECURITY.md exige upload por URL pré-assinada, MIME real validado, limite de tamanho, sem credencial no frontend.

Decisão: `POST /properties/:id/media/upload-url` (RBAC `property:write`) valida MIME (whitelist jpeg/png/webp/pdf), tamanho (foto/floorplan ≤ 10MB, documento ≤ 20MB), gera `storageKey = orgs/{orgId}/properties/{propertyId}/{kind}/{uuid}.{ext}` e retorna URL assinada (`@aws-sdk/s3-request-presigner`). `POST /properties/:id/media/confirm` faz `headObject` (existência + tamanho real) e valida prefixo da key. DOCUMENT nunca é público; PHOTO/FLOORPLAN ficam públicos. Storage ausente → 400. Sem upload via API (sem multipart). Reversibilidade: alta.

## ADR-008 — Geocoding: Google REST + mock (Fase 03)

Status: Aceito.

Contexto: lat/lng do endereço sem credencial de homologação; AGENTS.md permite adapter + mock.

Decisão: interface `GeocodingService` em `@aluguei/integrations`; `GoogleMapsGeocodingAdapter` (fetch nativo + zod + timeout 5s, sem SDK); `GeocodingMockService` determinístico (hash → lat/lng estáveis, confidence 0.6) para dev/test; produção sem chave → `geocode` retorna null (nunca dados falsos). lat/lng persistem em `property_addresses` mas não entram no DTO público. `IMPLEMENTED_NOT_LIVE_VERIFIED` em docs/BLOCKERS.md. Reversibilidade: alta.

## ADR-009 — Modelo de dados Fase 03 (Fase 03)

Status: Aceito.

Decisões: property sem hard delete (PATCH status=ARCHIVED; auditoria/referências); FKs pendentes da Fase 02 (`lead_property_interests`/`visits`/`proposals`.property_id) → `ON DELETE SET NULL`; `property_owners` UNIQUE(property,party) e party FK cascade; features em tabela (whitelist app-level) em vez de colunas boolean; preço do listing vem de `property_financial_terms.monthlyRentCents` (sem `priceCents` no listing); slug UNIQUE(org,slug) com sufixo numérico em colisão; até 1 endereço público e 1 privado por property (UNIQUE(property_id, is_public)); endereço privado nunca promovido a público automaticamente.

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

## ADR-036 — Mobile field operation MVP: sessão, navegação e agenda (2026-08-17)

Status: Aceito.

Contexto: `apps/mobile` era apenas um shell (offline banner + error boundary). A primeira UI operacional do app (operação de campo de vistoria) exige cliente HTTP com sessão, navegação mínima e telas do fluxo — sem adicionar dependências.

Decisões:

- **Cliente HTTP único (`src/api.ts`)**: base URL de `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:4000`); captura o token de `Set-Cookie` (`aluguei_session`) e o reenvia em toda chamada como `Cookie` e `Authorization: Bearer` (mesmo token — ADR-005). Sessão apenas em memória (sem persistência); token nunca é logado.
- **Navegação por estado (`App.tsx`)**: stack de `Route` em `useState` (login/agenda/visit-detail/inspection/inspection-review) com `navigate`/`reset`/`back` — sem dependência de router; `AppErrorBoundary` + `useConnectivity` permanecem no topo (banner offline em todas as telas).
- **Agenda = visitas SCHEDULED + CONFIRMED**: a especificação da tarefa citava `status=OPEN`, mas o schema de visits (`packages/contracts`) só aceita SCHEDULED/CONFIRMED/DONE/CANCELLED/NO_SHOW — `OPEN` retornaria 400. O app busca os dois status e mescla por id (o contrato é a fonte de verdade).
- **Sem `@aluguei/ui`**: o pacote é web (CSS/Next) e adicioná-lo seria dependência nova (proibida na tarefa); tokens PEG/brand espelhados em `src/tokens.ts` (baseline do painel) + primitivos locais (`src/ui.tsx`).
- **Testes focados**: `src/api.test.ts` (vitest) cobre captura/reenvio de sessão, erro tipado (409 → `ApiError` com code/message), falha de rede (status 0) e merge de visitas.

Consequências: cookie em memória não sobrevive a restart do app (persistência offline fica para próxima iteração); no native, o header `Set-Cookie` pode ser filtrado pela stack de rede do SO (validar em device; o Bearer já é o padrão mobile do ADR-005 e o cliente envia ambos). Reversibilidade: alta.

## ADR-037 — Liquidação financeira atômica e idempotente (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: a auditoria de 2026-09-10 provou (P0-01) que dois eventos do mesmo pagamento processados em paralelo creditavam duas vezes: a liquidação lia, decidia e escrevia sem transação, sem trava de linha, sem compare-and-set, sem unicidade em `split_allocations`/`payouts` e com `transaction_id` aleatório no ledger.

Decisões:

- **Uma transação por efeito monetário** (`apps/api/src/finance/settlement.ts`): trava a cobrança (`FOR UPDATE`), depois o pagamento, e só então escreve. A ordem das travas (cobrança → pagamento) é a mesma em liquidação, estorno, cancelamento e iniciação, para não haver deadlock.
- **Compare-and-set de status**: o `UPDATE` traz o status esperado no `WHERE` e usa `RETURNING`; quem não altera linha desiste sem efeito (`ALREADY_APPLIED`).
- **Chave de negócio no ledger**: `postLedgerTransaction` recebe `businessKey` (ex.: `PAYMENT:<id>`, `PAYOUT:<pagamento>:<parte>`, `REFUND:<id>`), deriva o `transaction_id` dela (UUID v8 determinístico) e o banco tem `UNIQUE (org_id, business_key, account_id)`. A mesma operação lógica, repetida ou concorrente, lança no máximo uma vez.
- **Unicidade no banco como última defesa**: `split_allocations (payment_id, role, party_id)` NULLS NOT DISTINCT, `payouts (payment_id, party_id)` parcial, `charges (provider_charge_id)` parcial, `payments (provider, provider_payment_id)` parcial.
- **Chamada ao provider nunca dentro de transação**; o status do provider é lido antes e a transação só registra o que ele confirmou.

Consequências: PGlite serializa transações e não reproduz a corrida — por isso a suíte `finance-concurrency.pg.test.ts` roda em PostgreSQL real (ADR-043). Escritas financeiras passam a exigir `tx` na assinatura (usar `db` dentro da transação trava no PGlite e escreveria fora dela no PostgreSQL).

## ADR-038 — O provider é a autoridade sobre o dinheiro (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: P0-02 — `/webhooks/payments` não exigia segredo em produção, e um evento `PAYMENT_REFUNDED` forjado fazia o worker EXECUTAR o estorno no provider, sem idempotência e sem reverter split/repasse.

Decisões:

- O webhook **só enfileira**: autentica (token obrigatório em produção via `enforceProductionSecret`), resolve a organização pela tentativa de pagamento (`payments.provider_payment_id`) e grava no inbox. Não confirma, não estorna, não credita.
- O worker **relê o estado no provider** (`getChargeStatus`) antes de qualquer efeito: crédito só com `CONFIRMED`, estorno só com `REFUNDED`, falha só com `FAILED`.
- **Quem executa estorno é o backoffice** (`POST /charges/:id/refund`): chama o provider, confirma o novo estado e só então registra — cancelando as alocações, revertendo o repasse pendente (ou registrando clawback se já pago) e lançando `REFUND:<pagamento>`.
- O provider FAKE deixou de ser confirmado pelo webhook; a simulação do pagador virou rota explícita (ADR-041).

Consequências: um webhook forjado não tem efeito e o job termina em falha controlada (DEAD após as tentativas, com alerta). Estorno iniciado no painel do provider continua sendo registrado, pelo próprio webhook, quando o provider confirma.

## ADR-039 — Recebimento não aplicado (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: P0-03 — pagamento de cobrança `SCHEDULED` ou já cancelada ficava `FAILED` no inbox e o dinheiro não entrava em lugar nenhum.

Decisões:

- A máquina de cobrança aceita `SCHEDULED → PAID` e `OVERDUE → PAID`.
- Pagamento confirmado para cobrança que não aceita liquidação (cancelada, estornada ou já paga por outra tentativa) vira **recebimento não aplicado**: `CASH` a débito e `UNAPPLIED_RECEIPTS` (passivo) a crédito, com audit `payment.unapplied`.
- Estorno desse recebimento devolve o valor da mesma conta.
- Conta nova `LANDLORD_CLAWBACK_RECEIVABLE` para estorno com repasse já pago.
- A conciliação varre pagamentos pendentes que o provider já confirmou e os liquida (rede de segurança para webhook perdido).

Consequências: o dinheiro sempre tem contrapartida contábil; o passivo de recebimentos não aplicados é a fila de trabalho para devolução ou aplicação manual (tela fica para fase posterior).

## ADR-040 — Iniciação de pagamento idempotente (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: P0-03(c) — cada iniciação criava um `payment` novo e sobrescrevia `charges.provider_charge_id`; pagar o QR anterior era ignorado. O portal ainda fabricava um QR (`000201-qr-…`) no caminho "idempotente".

Decisões: `initiatePayment` (`apps/api/src/finance/initiation.ts`), usado pelo backoffice e pelo portal:

1. no máximo **uma tentativa pendente por cobrança** (índice único parcial `payments (charge_id) WHERE status = 'PENDING'`);
2. mesma cobrança, mesmo valor e método → devolve a tentativa existente com o QR/boleto **gravados** (200);
3. reemissão com valor/método diferente só ocorre se o provider ainda não recebeu — a tentativa anterior é cancelada no provider e localmente;
4. a chamada ao provider fica fora da transação; falha marca a tentativa como `FAILED`;
5. `externalReference` = id da tentativa (conciliação e webhooks do provider real).

Consequências: pagar um QR substituído continua sendo registrado (a tentativa cancelada aceita confirmação do provider); duas iniciações simultâneas resultam em uma tentativa (as demais recebem 409).

## ADR-041 — Estado do provider FAKE em tabela e simulação do pagador (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: P1-13 — com o FAKE em memória, API e worker (processos separados) tinham estados diferentes e a stack integrada nunca liquidava um pagamento.

Decisões:

- `FakePaymentProvider` recebe um `FakePaymentStore`; o padrão continua em memória (testes in-process) e a API/worker usam `createDbFakePaymentStore` (tabela `fake_provider_charges`).
- Id do FAKE passa a ser único (`pc.fake.<uuid>`) — o hash de valor+vencimento colidia entre cobranças e organizações.
- A simulação do pagador é uma rota explícita, `POST /dev/fake-payments/:providerChargeId/confirm`, registrada apenas fora de produção e ativa apenas com provider FAKE, exigindo `finance:write` e cobrança da própria organização.

Consequências: a tabela existe em todos os ambientes, mas só é escrita com provider FAKE. O E2E prova a liquidação com API e worker em processos separados.

## ADR-042 — Fila: tentativas por provider, DEAD letter e claim com marca (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: P2-10 — o reaper devolvia jobs expirados para `PENDING` sem olhar tentativas (reciclagem infinita) e não havia estado terminal nem alerta.

Decisões: `PAYMENT` tolera 8 tentativas (confirmação no provider pode demorar), os demais 3; job que esgota vira `DEAD` (terminal, com `onDeadLetter` → log estruturado `inbox.dead_letter`); o claim devolve `started_at` e só quem detém a marca conclui o job; o worker não sobrepõe ciclos (um por vez).

## ADR-043 — Concorrência real em suíte própria (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: o PGlite serializa transações num mutex: um teste de corrida passaria mesmo sem transação, sem trava e sem CAS — falsa confiança.

Decisão: `tests/integration/src/*.pg.test.ts` rodam em PostgreSQL real (`TEST_DATABASE_URL`), em banco criado e removido pela própria suíte, fora do `pnpm test` (que não exige servidor) e com gate próprio `pnpm test:pg` — local e no CI (serviço `postgres:17`). Sem servidor, a suíte falha explicitamente em vez de ser pulada.

## ADR-044 — Isolamento multi-tenant por referência (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: P0-05 — a organização B criava lead, visita, proposta, candidatura, vistoria e ativos Meta apontando para pessoas, imóveis e usuários da organização A, e lia o consentimento LGPD da A.

Decisões:

- Helper canônico em `apps/api/src/routes/helpers.ts` (`assertOwnedByOrg`, `assertAllOwnedByOrg`, `assertOrgMember`) aplicado a **todo id vindo do corpo**, antes de qualquer escrita.
- Resposta uniforme `404 NOT_FOUND` para id de outra organização e para id inexistente (sem oráculo de existência); id não-uuid também responde 404 (antes 500).
- `first()` passa a lançar `NOT_FOUND` em vez de erro genérico.
- Consentimento e resultados de screening lidos sempre com filtro de organização.
- Ids polimórficos (`tasks.related_entity_id`, `timeline_events.entity_id`) só aceitam tipos conhecidos, com verificação de dono; tipo desconhecido com id → 400.

## ADR-045 — Defesa no banco: UNIQUE (org_id, id) e FKs compostas (Gate G1, 2026-09-11)

Status: Aceito.

Contexto: o ADR-044 fecha P0-05 na aplicação, mas a checagem vive em cada rota. Uma rota nova que esqueça `assertOwnedByOrg` volta a gravar o vínculo entre organizações e o banco aceita: a FK de coluna única só exige que o id exista, não que ele pertença à mesma organização.

Decisões:

- Nove tabelas ganham `UNIQUE (org_id, id)` e viram alvo referenciável por organização: `parties`, `properties`, `leads`, `proposals`, `inspections`, `inspection_rooms`, `inspection_media`, `meta_connections`, `meta_assets`.
- 22 referências passam a FK composta `(org_id, ref_id) → alvo (org_id, id)`: `leads.party_id`; `lead_property_interests.lead_id/property_id`; `visits.lead_id/party_id/property_id`; `proposals.lead_id/party_id/property_id`; `rental_applications.party_id/property_id/lead_id/proposal_id`; `inspections.property_id`; `inspection_media.room_id`; `inspection_observations.room_id/media_id`; `meta_assets.connection_id`; `meta_ad_profiles.connection_id/property_id/page_asset_id/instagram_asset_id`.
- `ON DELETE SET NULL` lista a coluna (`ON DELETE SET NULL ("party_id")`): `org_id` é NOT NULL e não pode ser anulada junto (PostgreSQL 15+). O drizzle-kit não gera essa forma — a `0013_tenant_composite_fks.sql` é editada à mão, como a 0012, com as UNIQUE antes das FKs.
- A migration tem pré-voo: se o banco já tiver referência entre organizações, ela para com `RAISE EXCEPTION` listando relação, contagem e exemplo, em vez de falhar no meio do `ALTER TABLE`.
- MATCH SIMPLE (padrão do Postgres): referência nula continua permitida — a FK só age quando há vínculo.

Consequências: a aplicação continua respondendo `404 NOT_FOUND` (sem oráculo de existência) — a FK é segunda linha, não a mensagem de erro do usuário. Se ela disparar, é defeito de programação (a rota deixou de checar o dono): sobe como falha de servidor com `pgCode` no log estruturado. Cobertura residual, que continua só na aplicação e na query permanente `CROSS_ORG_VERIFY_SQL`: ids polimórficos (`tasks.related_entity_id`, `timeline_events.entity_id`), ids dentro de jsonb (`meta_ad_profiles.media_selection`, `meta_creative_links.media_refs`, `meta_sync_jobs.payload.mediaRefs`) e referências cujo alvo não ganhou `UNIQUE (org_id, id)` (`listings`, `property_media`, `party_consents`, `contract_templates`). Evidência: `fase2-db-red.log` (sem a 0013, o insert direto de `leads.party_id` com id de outra organização é aceito) e `fase2-db-green.log` (10 inserts recusados com 23503).

## ADR-046 — Banco separado, storage MinIO e evidência versionada na homologação (2026-09-15)

Status: Aceito.

Contexto: a primeira homologação no Coolify (2026-09-14) rodava o PostgreSQL dentro do compose da aplicação, sem backup, e sem storage — o upload de mídia estava desligado. No mesmo dia o usuário decidiu: banco separado com backup e MinIO no próprio Coolify. Nessa execução apareceu também que a regra `*.log` do `.gitignore` tinha deixado fora do repositório as evidências RED/GREEN citadas pelo relatório do G1.

Decisões:

- Banco: recurso PostgreSQL 17 próprio do Coolify, sem porta pública, com backup diário e 14 cópias retidas. A senha é gerada na criação e existe só no Coolify, dentro da variável `DATABASE_URL` da aplicação.
- Corte: o serviço de execução única `db-copy` copia o banco embutido para o novo e não faz nada se o destino já tiver tabelas; `migrate` só roda depois dele. O banco embutido e o volume ficam até o usuário confirmar que nenhum dado ficou para trás.
- Storage: MinIO no compose da aplicação, com a build comunitária mantida pelo Coolify em versão fixada (a MinIO deixou de publicar imagens da edição comunitária). As credenciais são variáveis mágicas compartilhadas entre `minio` e `api`; o console não tem domínio público.
- Path-style: `STORAGE_FORCE_PATH_STYLE=true` liga `forcePathStyle` no adapter S3 — atrás de domínio próprio, o bucket no host não tem rota nem certificado no proxy. O `storage-init` garante o bucket de forma idempotente antes de a API subir.
- Evidência: exceção explícita no `.gitignore` para `docs/audits/**/evidence/**/*.log`.

Consequências: backups e arquivos ficam no mesmo VPS — protegem contra erro humano e corrupção, não contra perda do servidor; falta uma cópia fora dele (Fase 6). A existência do bucket só está inferida até o primeiro upload autenticado. O MinIO comunitário é um risco de manutenção: reavaliar storage gerenciado (R2/S3) antes do piloto. Evidência: `docs/audits/2026-09-10/evidence/ops/` e `docs/audits/2026-09-10/evidence/deploy/smoke-2026-09-15.txt`.

## ADR-047 — Contrato: versões imutáveis e texto congelado no envio (Gate G2, 2026-09-14)

Status: Aceito.

Contexto: P0-04 — `POST /contracts/:id/generate` só barrava `GENERATED` e validava a transição a partir do literal `DRAFT`: um contrato `SIGNED` voltava a `GENERATED` com conteúdo e hash reescritos, `signed_at` preservado e a locação `ACTIVE` apontando para ele. Não havia versão anterior do texto.

Decisões:

- O texto só é gerado em `DRAFT` ou, com pedido explícito (`{ "regenerate": true }`), em `GENERATED` sem envelope. Em `SENT_FOR_SIGNATURE`, `PARTIALLY_SIGNED`, `SIGNED` e `VOID` a resposta é `409` sem nenhuma escrita, com ou sem `regenerate`.
- Cada geração grava uma linha em `contract_versions` (versão, conteúdo, hash SHA-256, template e versão do template, autor). `contracts.content`, `content_hash` e `current_version` espelham a versão vigente. Repetir `generate` em `GENERATED` é idempotente; regenerar o mesmo texto não cria versão.
- O envelope registra a versão enviada (`signature_envelopes.contract_version`). `send-for-signature` grava envelope e status numa transação, com trava da linha e compare-and-set de versão e hash: se outra requisição regenerou o contrato durante a chamada ao provider, nada é gravado (`409`).
- Defesa no banco (migration 0014, gatilhos `BEFORE UPDATE`, `check_violation` 23514): texto, hash e versão imutáveis a partir do envio; status não regride (`SIGNED` e `VOID` terminais, `SENT_FOR_SIGNATURE` não volta a `DRAFT` ou `GENERATED`, `PARTIALLY_SIGNED` não volta); `signed_at` imutável em `SIGNED`; linhas de `contract_versions` imutáveis. `UNIQUE (org_id, id)` em `contracts` e FK composta de `contract_versions`, no padrão do ADR-045.
- Pré-voo da 0014 aborta com `RAISE EXCEPTION` se já houver contrato corrompido pelo defeito: `signed_at` com status fora de `SIGNED`/`VOID`, `contract.generated` depois de `contract.sent_for_signature` na auditoria, conteúdo ausente fora de `DRAFT` ou hash que não confere com o conteúdo.

Consequências: a UI regera contrato `GENERATED` enviando `regenerate: true` (ADR-058). Cancelar (`VOID`) um contrato já enviado não cancela o envelope no provider — pendência da Fase 7.3 (Clicksign). A exclusão física de contrato não existe na API e não foi coberta pelos gatilhos. Evidência: `docs/audits/2026-09-10/evidence/g2/track-a/p0-04-red.txt` (8 de 8 falham antes da correção) e `p0-04-green.txt` (8/8 depois).

Alternativas descartadas: histórico em coluna `jsonb` (sem unicidade nem gatilho por versão); trava só na API (sem defesa contra escrita direta ou rota futura).

## ADR-048 — Decisão de crédito com origem obrigatória e trilha auditável (Gate G2, 2026-09-14)

Status: Aceito.

Contexto: P1-06 — `SUBMITTED → SCREENING → APPROVED` por `PATCH`, sem screening, sem motivo e com `decided_by` nulo; o worker decidia sem registrar a origem; `CONTRACTING` nunca era gravado.

Decisões:

- A máquina de estados recebe a origem da transição (`ApplicationTransitionSource`). `SUBMITTED → SCREENING` só pelo pedido de screening. `SCREENING → APPROVED`, `REJECTED` ou `MANUAL_REVIEW` só pelo resultado do provider, com resultado gravado. `MANUAL_REVIEW → APPROVED` ou `REJECTED` só por uma pessoa, com motivo, responsável e resultado existente. `APPROVED → CONTRACTING` só pela criação do contrato; `CONTRACTING → APPROVED` só pelo cancelamento do último contrato ativo.
- Nova coluna `rental_applications.decision_source` (`MANUAL` | `AUTOMATIC`). Em `APPROVED`, `REJECTED` e `CONTRACTING`, motivo não vazio, `decided_at` e origem são obrigatórios (CHECK na migration 0015). `decided_by` fica fora do CHECK porque a FK é `ON DELETE SET NULL`.
- Decisão automática: `decided_by` nulo (não há pessoa), motivo gerado pelo domínio (`Decisão automática (<provider>): <decisão> — <regra>: <detalhe>`), auditoria `rental_application.decided` com `source: AUTOMATIC` e o id do resultado de screening; resultado, decisão, timeline e auditoria numa transação, com a chamada ao provider fora dela.
- API: aprovação ou rejeição sem motivo → `400` (validação do contrato da API); transição fora da origem → `409`; destino repetido → `200` sem reescrever a decisão; compare-and-set em toda mudança de status. `POST /screening` é idempotente com pedido pendente, recusa (`409`) fora de `SUBMITTED` e cria um job de inbox por pedido (antes a chave por candidatura descartava um segundo pedido).
- Pré-voo da 0015 aborta se houver candidatura decidida sem motivo, sem data, sem responsável nem motivo `auto:` do worker antigo; candidatura em `MANUAL_REVIEW`, `APPROVED` ou `REJECTED` sem resultado de screening; ou em `SCREENING` sem pedido. Backfill: `decision_source` pela presença de `decided_by`; `APPROVED` com contrato não cancelado vira `CONTRACTING`.

Consequências: a UI de crédito oferece decisão só em `MANUAL_REVIEW`, com motivo digitado (não fixo), e pedido de screening só em `SUBMITTED`; a tela de contratos deixa de listar `CONTRACTING` como elegível (ADR-058). Candidaturas legadas sem trilha bloqueiam a migration até revisão humana — decisão deliberada: aprovação de crédito sem análise não é reclassificada como aceitável. Evidência: `docs/audits/2026-09-10/evidence/g2/track-a/p1-06-red.txt` (7 de 8 falham), `p1-06-red-domain.txt` (8 de 19), `p1-06-green.txt` (8/8) e `p1-06-green-domain.txt` (19/19); `p1-06-red-run1.txt` guarda a primeira execução do RED, quebrada por erro do próprio teste.

## ADR-049 — Texto do contrato em R$ e trilha de eventos de assinatura (Gate G2, 2026-09-14)

Status: Aceito.

Contexto: P2-08 — o corpo do contrato saía com o aluguel em centavos crus ("ALUGUEL 250000"); o template era obrigado a usar todas as variáveis oferecidas; `signature_events` nunca era gravada; `PATCH /contracts/:id/status` gravava `VOID` e respondia `400` (schema de resposta errado).

Decisões:

- A geração oferece um conjunto fixo de variáveis (`CONTRACT_TEMPLATE_VARIABLES`: `tenantName`, `landlordName`, `propertyTitle`, `monthlyRent`, `monthlyRentCents`). Valor monetário é formatado no domínio (`formatCentsBRL`: centavos inteiros, sem ponto flutuante e sem depender de ICU, `R$ 2.500,00`); dado ausente vira `—`, nunca `R$ 0,00`.
- `monthlyRentCents` fica como nome legado e renderiza o mesmo valor em R$: templates aprovados são imutáveis (mudar exige nova versão e nova aprovação) e nenhum contrato deve exibir centavos crus. Templates novos devem usar `monthlyRent`.
- `renderTemplate` deixa de recusar variável oferecida e não usada; continua recusando placeholder sem variável (erro de digitação) e passa a usar `Object.hasOwn`, para que `{{constructor}}` não resolva para o protótipo do objeto.
- `POST /webhooks/signature` grava `signature_events` na chegada, na mesma transação do inbox, com dedup por `UNIQUE (provider, provider_event_id)`; envelope desconhecido continua ignorado (`200`) e sem linha.
- `PATCH /contracts/:id/status` responde `{ contract: agregado }`, no mesmo formato de `generate`.

Consequências: os placeholders ainda não são validados no cadastro ou na aprovação do template — o erro aparece só ao gerar (`400`). `occurred_at` do evento é a hora do recebimento: o contrato atual do webhook não traz a hora do evento no provider. Evidência: `docs/audits/2026-09-10/evidence/g2/track-a/p2-08-red.txt` (4 de 4 falham), `p2-08-red-domain.txt`, `p2-08-green.txt` (4/4) e `p2-08-green-domain.txt` (22/22).

## ADR-050 — Documento de assinatura em PDF (pdf-lib) e provider real no envelope (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: P1-11 (parte interna) — `send-for-signature` mandava `content_hash` como documento e gravava `provider: 'FAKE'` fixo. O adapter Clicksign v3 só aceita arquivo em base64 e recusava o envio (a API respondia `500`); e, como o webhook localiza o envelope por `(provider, provider_envelope_id)`, um evento `CLICKSIGN` nunca casaria com um envelope gravado como `FAKE`.

Decisões:

- Dependência nova: `pdf-lib` 1.17.1 (MIT), versão fixa, em `@aluguei/integrations`. JavaScript puro, sem binário nativo nem script de instalação; transitivas `pako` (MIT AND Zlib), `tslib` (0BSD), `@pdf-lib/standard-fonts` e `@pdf-lib/upng` (MIT). Sem advisory crítico (gate `security:audit --audit-level=critical`).
- `renderContractPdf` (`packages/integrations/src/signature/document.ts`): A4 com cabeçalho (contrato e versão), texto quebrado por largura e paginado, rodapé com o SHA-256 do texto; título e assunto nos metadados. Determinístico: `updateMetadata: false` (sem datas nem produtor automático) e sem identificador aleatório — a mesma versão gera os mesmos bytes.
- Fonte padrão Helvetica (WinAnsi): cobre os acentos do português; caractere fora dela vira `?` em vez de derrubar a geração.
- `ISignatureProvider.name` (`CLICKSIGN | D4SIGN | FAKE`): o envelope grava o nome do provider que o criou. O documento segue como data URI `application/pdf`; o envelope guarda `document_hash` (SHA-256 dos bytes enviados) ao lado de `contract_version`.
- Migration 0016: coluna `document_hash`; pré-voo aborta se houver envelope gravado como `FAKE` com id que não é do provider FAKE, ou com provider desconhecido.

Consequências: o PDF enviado não é armazenado — é reproduzível byte a byte a partir de `contract_versions` enquanto o renderizador (layout e versão da `pdf-lib`) não mudar; mudar um dos dois exige antes armazenar o documento enviado (Storage, Fase 7.1) ou versionar o renderizador. O arquivo assinado devolvido pelo provider fica para a Fase 7.3, assim como HMAC do webhook e URL base de produção da Clicksign. Nome com caractere fora do WinAnsi sai com `?`; embutir fonte TTF (fontkit) foi adiado por peso e por falta de caso real. Todo `ISignatureProvider` precisa declarar `name`. Evidência: `docs/audits/2026-09-10/evidence/g2/track-a/p1-11-red.txt` (2 de 2 falham: com o adapter Clicksign a API responde 500), `p1-11-red-document.txt`, `p1-11-green.txt` (2/2) e `p1-11-green-document.txt` (18/18).

Alternativas descartadas: `pdfkit` (mais pesado, depende de fontkit e streams), Chromium/Puppeteer (binário nativo), armazenar só o hash sem gerar documento (o provider exige o arquivo).

## ADR-051 — Sugestão de IA: status é o resultado, nunca a ação (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: P1-05 — resolver uma sugestão gravava a ação (`ACCEPT | REJECT | EDIT`) na coluna `status`, que a leitura valida como `PENDING | ACCEPTED | REJECTED | EDITED`: depois da primeira resolução, `GET /inspections/:id`, `/report` e `/review` respondiam `400`. O critério do G2 lista P1-01..05, mas o plano de continuação agenda o P1-05 na Fase 5; ele foi fechado no G2 porque quebra a leitura da vistoria que a Fase 4 precisa entregar.

Decisões:

- `SUGGESTION_STATUS_BY_ACTION` (`packages/contracts/src/inspections.ts`) mapeia a ação para o status; `suggestionStatusSchema` é a fonte única dos valores válidos.
- Resolução numa transação: compare-and-set sobre `status = 'PENDING'` (segunda resolução → `409`), observação e auditoria juntas — não sobra observação sem sugestão resolvida.
- Banco: `CHECK (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED'))`. A migration 0017 converte as linhas legadas (`ACCEPT → ACCEPTED`, `REJECT → REJECTED`, `EDIT → EDITED`) antes do CHECK; o pré-voo aborta se houver status fora desses sete valores.

Consequências: o contrato de entrada da API não muda (a UI continua enviando a ação); a resposta e as leituras passam a trazer o status. Os testes de pré-voo das migrations 0014 a 0016 foram escritos depois da implementação das migrations e não têm RED próprio. Evidência: `docs/audits/2026-09-10/evidence/g2/track-a/p1-05-red.txt` (releitura 400, `ACCEPT` no lugar de `ACCEPTED`, migration 0017 inexistente) e `p1-05-green.txt` (10/10, com a migração de dados e os quatro pré-voos).

## ADR-052 — Entrada numérica pt-BR: centavos inteiros e ambiguidade recusada (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: P0-07 — "3.500", o próprio placeholder, era gravado como R$ 3,50. Três formulários convertiam com `parseFloat(v.replace(',', '.'))`, que lê o ponto de milhar como decimal; a área do cadastro de imóvel tinha o mesmo defeito.

Decisões:

- Um único parser em `packages/ui/src/lib/money.ts`: ponto separa milhares, vírgula separa decimais, resultado inteiro na menor unidade (centavos). Sem ponto flutuante na conversão.
- Texto que só faz sentido em outro formato (`3.50`, `1234.56`, `0.500`) é recusado com mensagem (`AMBIGUOUS`), nunca adivinhado: um valor digitado errado não pode virar outro valor gravado. Também recusados: mais de 2 casas, negativo, lixo, milhar mal agrupado (`12.34,56`).
- Teto padrão `2.147.483.647` centavos: as colunas de dinheiro são `integer` (int4).
- `MoneyInput` emite `number | null` e usa `setCustomValidity`: texto inválido bloqueia o envio nativo do formulário, com a mensagem no campo.
- Estrutura rótulo/ajuda/erro no padrão `FieldShell` do Kal El, reimplementada sobre `.peg-field`/`.peg-input` e os tokens do Aluguei (o CSS do Kal El não é carregado).

Consequências: formulários novos de dinheiro devem usar `MoneyInput`; a guarda `apps/web/src/lib/money-parsing-guard.test.ts` falha se `parseFloat`/`Number` sobre `replace(',', '.')` voltar ao web. Evidência: `docs/audits/2026-09-10/evidence/g2/track-b1/p0-07-parser-red.txt` (o parsing antigo falha 47 de 63 casos), `p0-07-parser-green.txt` (63/63), `p0-07-parsing-guard-red.txt` e `p0-07-parsing-guard-green.txt`; no navegador, `e2e-red.txt` e `e2e-green.txt` ("3.500" e "3.500,50" persistidos em centavos).

## ADR-053 — BFF transparente: content-type só com corpo e resposta repassada como veio (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: P1-02 — `apiFetch` e `apiProxy` definiam `content-type: application/json` sempre: mutação sem corpo virava 400 `FST_ERR_CTP_EMPTY_JSON_BODY` (logout, gerar e enviar contrato, cancelar cobrança, remover característica) — e `apiProxy` convertia toda resposta em JSON (CSV virava `{}`).

Decisões:

- `content-type: application/json` só quando há corpo; o proxy genérico repassa o content-type do navegador quando há corpo.
- `apiProxy` devolve status e bytes intactos (vazio em 204 e 304) e uma lista fechada de headers de conteúdo — `content-type`, `content-disposition`, `cache-control` — além de todos os `Set-Cookie`. `content-length` e `content-encoding` ficam de fora: o corpo é reenviado já decodificado.
- `apiFetch` só interpreta JSON quando a API declara JSON.

Consequências: evidência em `docs/audits/2026-09-10/evidence/g2/track-b1/p1-02-bff-red.txt` (7 de 16 falham; os controles passam) e `p1-02-bff-green.txt` (16/16); no navegador, `e2e-green.txt` (CSV e mutação sem corpo).

## ADR-054 — `GET /dashboard/summary`: agregação no banco, por organização e por permissão (Gate G2, 2026-09-14)

Status: Aceito.

Contexto: P1-01 — a Visão Geral buscava 12 listagens com `limit=200` (a API aceita até 100) e mostrava tudo zerado; mesmo com `limit=100`, os números seriam o tamanho de uma página.

Decisões:

- Rota de leitura nova em `apps/api/src/routes/dashboard.ts`: `count(*) filter (where …)` por seção, sempre com `org_id` da sessão. Sem migration e sem mudança de rota existente.
- Cada seção só é calculada com a permissão de leitura correspondente (`lead:read`, `finance:read`…); sem ela vem `null` e a tela mostra "—", nunca um zero inventado.
- "Hoje" é o dia civil de `America/Sao_Paulo`, calculado pelo banco de fusos do ICU; todas as comparações usam o mesmo instante, devolvido em `generatedAt`, e o teste de integração compara com contagens SQL independentes nesse instante.
- Filas (tarefas atrasadas e de hoje, cobranças vencidas, visitas) limitadas a 8 ou 6 itens; as contagens são totais.

Consequências: evidência em `docs/audits/2026-09-10/evidence/g2/track-b1/p1-01-dashboard-summary-red.txt` (4 de 4 falham), `p1-01-dashboard-summary-green.txt` (4/4) e `p1-01-dashboard-summary-green-pos-merge.txt` (4/4 depois do merge da trilha A, com a semente gravando a trilha de decisão exigida pelo ADR-048 e nenhuma asserção alterada).

Alternativas descartadas: aumentar o limite da API (proibido pelo plano e não resolve contagens); paginar as 12 listas no servidor do Next (N chamadas por visita e contagens ainda erradas).

## ADR-055 — Referências sem carregar a organização inteira: `ids`, `q` e combobox assíncrono (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: P1-01 — 37 chamadas `limit=200` montavam selects e resolviam nomes carregando todas as pessoas e imóveis da organização.

Decisões:

- Listagens de `properties`, `parties` e `listings` aceitam `ids` (1 a 100 uuids, separados por vírgula) e `properties` aceita `q` (trecho do título, `ILIKE` com `%`, `_` e `\` escapados). Id de outra organização some da resposta, igual a id inexistente. Testes de isolamento em `tests/integration/src/list-search.test.ts`.
- `apps/web/src/lib/lookup.ts`: `useLookup` resolve só os ids da página (lotes de 100); `useAllPages` percorre, de 100 em 100 e com teto de 50 páginas marcado como `truncated`, as listagens sem `ids` (`rental-applications`, `contracts`), sem alterar essas rotas.
- `AsyncCombobox` (padrão combobox + listbox do WAI-ARIA) substitui os selects de imóvel dos modais de anúncio, proposta e vistoria; a lista fica no fluxo, abaixo do campo, para não ser cortada pelo corpo rolável do modal. Referência Kal El: `TokenPicker`, reimplementado para seleção única assíncrona.
- Guarda permanente `apps/web/src/lib/api-limits.test.ts`: todo `limit` literal do web é validado contra o `paginationQuerySchema` real da API, e `limit` calculado em tempo de execução é proibido.

Consequências: `leads?limit=100` (detalhe do lead, inbox) e `proposals?limit=100` (detalhe da candidatura) continuam válidos, mas só enxergam os 100 mais recentes — pendência P2-03. Evidência: `docs/audits/2026-09-10/evidence/g2/track-b1/p1-01-busca-q-red.txt` (10 de 11 falham), `p1-01-busca-q-green.txt` (11/11), `p1-01-limit-guard-red.txt` (37 chamadas com `limit=200`) e `p1-01-limit-guard-green.txt` (3/3).

## ADR-056 — Logout só conclui com confirmação da API (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: P1-03 — "Sair" não encerrava a sessão: a mutação sem corpo recebia 400 (P1-02) e a tela redirecionava mesmo assim; no portal, "Sair" era só um link.

Decisões:

- `requestLogout` considera a saída concluída com 2xx ou 401 (sessão que já não existe); qualquer outra resposta, ou falha de rede, mantém a pessoa na página com a mensagem.
- Sucesso faz recarga completa (`window.location.assign`), para nada da sessão encerrada ficar em memória no navegador.
- Portais: "Sair" deixa de ser link e chama `/api/portal/auth/logout`.

Consequências: `POST /portal/auth/logout` (`apps/api/src/routes/portal.ts`) só limpa o cookie e não revoga a linha de `portal_sessions`: um cookie copiado antes do "Sair" segue válido até expirar. O P1-03 continua aberto no portal até essa revogação existir. No painel, o logout revoga todas as sessões do usuário na organização ativa (P2-23), comportamento da API mantido. Evidência: `docs/audits/2026-09-10/evidence/g2/track-b1/p3-calibration-e-p1-03-logout-helper-red.txt` (helper inexistente), `p1-03-logout-helper-green.txt` (5/5) e `e2e-green.txt` (dois menus e portal).

## ADR-057 — Rotas `/dev` do web fora de produção (Gate G2, 2026-09-15)

Status: Aceito.

Decisão: `/dev/calibration` chama `notFound()` quando `NODE_ENV === 'production'`, o mesmo critério da API (`apps/api/src/app.ts` só registra rotas `/dev` fora de produção). No build de produção a rota é pré-renderizada como 404.

Consequências: evidência em `docs/audits/2026-09-10/evidence/g2/track-b1/p3-calibration-e-p1-03-logout-helper-red.txt` (a página renderiza em produção) e `p3-calibration-green.txt` (2/2).

## ADR-058 — Regras dos contratos e do crédito na interface: módulos puros testados, domínio fora do bundle do cliente (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: os ADRs 047, 048, 049 e 051 mudaram regras que a interface precisa refletir: crédito só decidido em `MANUAL_REVIEW` com motivo; contrato imutável após o envio e regeneração explícita; `VOID` só a partir de `GENERATED`; variáveis de template; status da sugestão de IA.

Decisões:

- As decisões de tela ficam em módulos puros em `apps/web/src/lib` (`credit-decision`, `contract-rules`, `contract-template-hints`, `inspection-suggestions`), cobertos por testes unitários; os componentes só os consomem.
- Os módulos não importam `@aluguei/domain` em tempo de execução: o pacote traz `node:crypto` e quebraria o bundle do cliente (mesma cautela de `apps/web/src/lib/rbac.ts`). A consistência com o domínio é garantida nos testes, que rodam no Node e comparam com `canTransitionContract`, `CONTRACT_TEMPLATE_VARIABLES`, `renderTemplate` e `suggestionStatusSchema`.

Consequências: regenerar, listar versões, enviar envelope e cancelar contrato, assim como os status de sugestão, estão cobertos por testes unitários desses módulos e pela jornada principal do Playwright, não por um spec de interface para cada ação. Evidência: `docs/audits/2026-09-10/evidence/g2/track-b1/track-a-ui-red.txt` (30 de 37 falham contra o comportamento anterior das telas) e `track-a-ui-green.txt` (37/37).

## ADR-059 — Foco de `Modal` e `Drawer` não depende de `onClose` (Gate G2, 2026-09-15)

Status: Aceito.

Contexto: na revisão final da Track B1, o diálogo da decisão de crédito (motivo digitado, ADR-058) perdia o foco a cada tecla. `Modal` e `Drawer` de `packages/ui` rodavam o efeito de foco com `[open, onClose]`, e as telas passam uma função nova a cada render: cada tecla num campo controlado re-executava o efeito, que devolvia o foco ao botão que abriu o diálogo e o levava para "Fechar" — o espaço seguinte fechava o diálogo. O `fill` do Playwright troca o valor de uma vez e escondia o defeito. Reproduzido também em "Novo contato" (CRM) e no `Drawer` da página de calibração; pelo código, "Nova ocorrência" (detalhe da vistoria) tem a mesma causa.

Decisões:

- Um hook compartilhado, `packages/ui/src/lib/use-dialog-focus.ts`, usado por `Modal` e `Drawer`: o efeito depende só de `open`; uma referência guarda o `onClose` mais recente. Padrão do `Modal` de `packages/design-system/src/components/Overlays.tsx` do Kal El, reimplementado — o CSS e o restante do componente do Kal El não foram trazidos.
- A lista de focáveis é lida a cada Tab, sem elementos desabilitados ou invisíveis, porque o conteúdo do diálogo muda enquanto ele está aberto.
- O listener de teclado continua na fase de bolha (o Kal El usa captura): o `AsyncCombobox` para a propagação do Escape para fechar só a lista de opções, sem fechar o modal.
- Spec que digita em diálogo usa `pressSequentially`, como uma pessoa digita.

Consequências: todo `Modal`, `ConfirmModal` e `Drawer` do web herda a correção sem mudança nas telas; "Nova ocorrência" e os drawers de detalhe não têm spec próprio. Teste permanente: `tests/e2e/src/g2-b1-dialog-focus.spec.ts` (decisão de crédito com Tab e Escape, "Novo contato" e campo controlado no `Drawer` da calibração). Evidência: `docs/audits/2026-09-10/evidence/g2/track-b1/dialog-focus-red.txt` (3 de 3 falham), `dialog-focus-green.txt` (3/3) e `e2e-green-r2.txt` (Playwright completo, 18/18).

## ADR-060 — Admin da plataforma: cadastro com aprovação, planos com limites e allowlist de admins (2026-09-16)

Status: Aceito.

Contexto: o Aluguei.app atende várias imobiliárias, mas todo cadastro aberto criava uma imobiliária operando na hora, e ninguém administrava esses cadastros. Em 2026-09-15 o usuário decidiu: cadastro aberto com aprovação, planos sem cobrança, imagens no MinIO e banco separado (ADR-046).

Decisões:

- Situação em `organizations.status`: aprovar leva `PENDING_APPROVAL` (ou `REJECTED`) a `ACTIVE`; recusar, `PENDING_APPROVAL` a `REJECTED`; suspender, `ACTIVE` a `SUSPENDED`; reativar, `SUSPENDED` a `ACTIVE`. Recusar e suspender exigem motivo, que a imobiliária vê. Transição fora da origem responde `409 INVALID_TRANSITION`; a linha é travada e a auditoria entra na mesma transação.
- Negação por padrão: só `ACTIVE` opera. `requireAuth` (todo o painel, direto ou via `requirePermission`) e `requirePortalAuth` recusam com `403` e `details.reason = ORG_NOT_ACTIVE`; o consumo de token do portal também, sem gastar o token; o site público responde `404`. `/auth/me`, logout e troca de imobiliária usam só a sessão (`requireSession`), para a tela de situação da conta funcionar.
- Admins da plataforma pela allowlist `PLATFORM_ADMIN_EMAILS` (e-mails separados por vírgula), avaliada a cada requisição sobre o e-mail da sessão. Admin sem imobiliária entra com `org: null`. As rotas `/platform/*` exigem a allowlist (`401` sem sessão, `403` fora dela).
- A conta do admin só nasce no servidor (`apps/api/src/cli/create-platform-admin.ts`, senha pela entrada padrão, mínimo de 12 caracteres). O cadastro aberto recusa e-mail da allowlist com a mesma resposta de e-mail já cadastrado, dada depois do hash. Sem isso, quem se cadastrasse primeiro com o e-mail listado viraria admin.
- Planos em `plans`, com limites de usuários, imóveis não arquivados e anúncios publicados (`null` é ilimitado; sem cobrança). A migration 0018 semeia ESSENCIAL (3 usuários, 50 imóveis, 20 anúncios; padrão das novas imobiliárias), PROFISSIONAL (10/300/150) e ILIMITADO. As imobiliárias existentes ficam `ACTIVE` no ILIMITADO. Plano desativado continua onde está, mas não pode ser atribuído. Rebaixar abaixo do uso é permitido: nada é apagado, só novos itens param (`overLimit` na listagem).
- O limite é checado na transação que acrescenta o item: `SELECT … FOR UPDATE` na linha da imobiliária, leitura do plano, contagem e `409 PLAN_LIMIT_REACHED` (`details`: `resource`, `limit`, `current`) antes de qualquer escrita. Vale para cadastro de imóvel, novo membro e publicação de anúncio, que ganhou compare-and-set de status.
- Interface: `/situacao-da-conta` (em análise, recusada ou suspensa, com o motivo) e a área `/plataforma` (visão geral com a fila, imobiliárias com busca e abas por situação, detalhe com ações e histórico, planos). A área reaproveita as classes do shell do painel e os componentes de `@aluguei/ui`. O Kal El serviu só de referência de padrão de lista e detalhe, sem código de domínio.

Consequências: não há aviso por e-mail nem WhatsApp (envio real está fora desta fase), então a imobiliária descobre a decisão ao entrar. A suspensão não despublica anúncios em canais externos nem para os jobs do worker, e webhooks de pagamento continuam sendo processados. Trocar os admins exige mudar a variável e reiniciar a API; não há papéis dentro da plataforma nem registro de quem alterou a allowlist. O limite de armazenamento (MinIO) não entrou e fica para quando houver contagem de bytes por imobiliária. As fixtures de teste (`registerUser`, `registerOrg`, `registerViaApi`) aprovam a imobiliária logo depois do cadastro; o fluxo sem aprovação fica em `platform-admin.test.ts` e `platform-admin.spec.ts`. Evidência: `docs/audits/2026-09-10/evidence/platform-admin/`.

Alternativas descartadas: tabela de admins com convite pela interface (mais superfície de escalada de privilégio, sem necessidade atual); admin automático no primeiro cadastro com o e-mail listado (sequestrável); plano escolhido no cadastro (o admin escolhe na aprovação).

## ADR-061 — Portal, candidatura, canal, arquivamento e cobrança pela interface (Gate G2, Track B2, 2026-09-17)

Status: Aceito.

Contexto: P1-16 — o portal do inquilino e do proprietário só era alcançável pela API; a imobiliária não tinha como gerar o link de acesso. P1-17 parcial — fluxos essenciais sem tela: candidatura nova (com a autorização LGPD que a análise de crédito exige), primeira publicação de anúncio em canal e arquivamento de imóvel (o botão "Remover" chamava `DELETE /properties/:id`, rota que não existe). P1-03 no portal — o "Sair" só limpava o cookie (ADR-056). Os specs da Track B2 acharam mais três defeitos: gerar o link de novo depois de revogar deixava duas concessões ativas; a lista de cobranças escondia "Cancelar" da cobrança agendada e oferecia na vencida, que a API recusa; e o clique nas ações da linha abria também o detalhe, que cobria o diálogo.

Decisões:

- Acesso ao portal na tela da locação: locatário e proprietário ganham o botão "Portal", que abre o diálogo de concessão — gerar o link de uso único, copiar, QR em SVG (`uqr` 0.1.3, MIT, sem dependências; o SVG é montado módulo a módulo, sem HTML injetado), situação do acesso (link não usado, já usado ou revogado, com as sessões abertas) e revogar. `GET /portal/access?partyId` (permissão `portal:manage`, pessoa da própria organização, 404 fora dela) devolve as concessões com `linkActive`, `linkExpiresAt` e `activeSessions`. A entrega do link por e-mail ou WhatsApp continua na Fase 7.
- Link `/portal/entrar?token=…`: a página tira o token da barra de endereço antes de consumir, consome uma vez só (o React em desenvolvimento executa efeitos duas vezes, e o segundo consumo gastaria o link), usa `referrer: no-referrer` e `noindex` e leva a `/inquilino` ou `/proprietario`. Link inválido, expirado ou já usado recebe a mesma mensagem.
- `POST /portal/access` numa transação que trava a linha da pessoa (`SELECT … FOR UPDATE`), procura só concessão não revogada (a mais recente) e troca o token dela — o link anterior deixa de valer; sem concessão ativa, grava uma nova. A busca antiga, sem filtro de revogação e sem ordem, pegava a revogada e gravava outra concessão a cada pedido. A auditoria entra na mesma transação.
- `POST /portal/auth/logout` revoga a linha de `portal_sessions` da sessão atual (`PortalAuth.sessionId`), o que fecha o P1-03 no portal deixado aberto no ADR-056. Outras sessões da mesma pessoa continuam; revogar a concessão encerra todas.
- Candidatura: "Nova candidatura" em Crédito. Solicitante e imóvel buscados no servidor; `GET /parties` aceita `q` (trecho do nome ou de qualquer identidade, com `%`, `_` e `\` escapados, e, a partir de 3 dígitos, os dígitos de CPF, CNPJ ou telefone, com ou sem máscara). A tela registra o consentimento `CREDIT_SCREENING` só com "A pessoa autorizou a consulta de crédito (LGPD)" marcado, não repete consentimento ativo (o 409 de registro simultâneo conta como registrado) e leva a candidatura a `SUBMITTED`. Se o envio falhar depois de a candidatura existir, o botão tenta de novo só o envio. A regra fica em `apps/web/src/lib/rental-application.ts`.
- Canal: "Publicar anúncio" em Canais. `GET /channels` informa quais canais têm adapter configurado (`available`); os outros aparecem desabilitados, com "(sem integração)". O select lista todos os anúncios publicados (`useAllPages`, páginas de 100).
- Imóvel: "Arquivar imóvel" (com confirmação) e "Reativar imóvel" mudam `status` por `PATCH /properties/:id`. Imóvel não é apagado.
- Cobranças: as ações da lista seguem a máquina de estados do domínio em `apps/web/src/lib/charge-rules.ts`, comparada com `canTransitionCharge` no teste (mesmo padrão do ADR-058): agendada e em aberto recebem e cancelam; vencida só recebe; paga estorna. O diálogo de pagamento tem estado próprio e não abre o detalhe.
- `DataTable` (`packages/ui`): clique que começa em botão, link, campo ou elemento com papel interativo dentro da linha não aciona `onRowClick`. Vale para todas as listas do painel e da plataforma que usam o clique na linha.
- Contrato: criar pelo diálogo leva ao detalhe do contrato, onde ficam "Gerar contrato" e "Enviar para assinatura".
- Acentuação: as mensagens de `apps/api/src/routes/properties.ts` e `places.ts` (e os nomes de `webhook-security.test.ts`) estavam com UTF-8 decodificado duas vezes — a tela mostrava "Imóvel não encontrado" corrompido (P3 da auditoria). Corrigidas, com a guarda `tests/integration/src/source-text-encoding.test.ts` sobre o código do monorepo; as evidências da auditoria ficam como foram gravadas.

Consequências: o índice `portal_access_org_party_kind_active_unique` inclui `revoked_at`, e o PostgreSQL trata nulos como distintos: o banco não impede duas concessões ativas, e a garantia é a trava da rota (provada em `portal-access-concurrency.pg.test.ts`). Trocar por índice parcial (`WHERE revoked_at IS NULL`) exige migration com limpeza de duplicatas e fica registrado como pendência de banco (P2-12). Arquivar não despublica anúncios nem mexe em contratos e locações do imóvel. As telas não escondem ações por permissão (o servidor responde 403 e a tela mostra o erro), como nas demais telas do painel. Evidência: `docs/audits/2026-09-10/evidence/g2/track-b2/`.

## ADR-062 — Saída do banco embutido da primeira implantação (2026-09-17)

Status: Aceito com o merge do PR, que é a confirmação do usuário pedida no ADR-046.

Contexto: o ADR-046 manteve no compose o PostgreSQL embutido (`postgres`) e a cópia única (`db-copy`) até o usuário confirmar que nenhum dado ficou para trás. A confirmação direta seria o log do `db-copy`, mas o token do Coolify não tem `read:sensitive`: pelo MCP, `get_logs` responde "Missing required permissions: read:sensitive" (verificado em 2026-09-17), nenhuma ferramenta lê o conteúdo dos bancos e não há SSH.

Decisões:

- A cópia está provada, de forma indireta, pela ordem do compose e pelo que se observou no corte:
  - o banco próprio estava vazio até o corte (backups de 836 bytes em 14/09 às 19:12 e em 15/09 às 05:00);
  - `db-copy` só copia com o destino vazio e termina com erro se a restauração falhar (`set -eu`, `pg_restore --exit-on-error`);
  - `migrate` só roda se `db-copy` terminar com sucesso, e a API só sobe depois de `migrate`;
  - na troca, o Docker Compose recria o contêiner da API antes de esperar as dependências. Se a cópia tivesse falhado, a API teria ficado fora do ar, mas ela respondeu no smoke de 15/09;
  - depois do corte, nenhum serviço usa o banco embutido: a única referência a ele era a origem do `db-copy`.
- Saem do repositório os serviços `postgres` e `db-copy`, o alvo `dbcopy` do `Dockerfile` e `deploy/db-copy.sh`.
- O volume `aluguei-pgdata` fica, montado só para leitura pelo serviço `legacy-pgdata` (`busybox:1.36`, executa `true` e termina). Sem um serviço que o use, o Docker Compose descarta o volume do modelo (`docker compose config --volumes` deixa de listá-lo) e ele sumiria do recurso no Coolify; aí só daria para apagá-lo direto no servidor.
- Apagar o volume é irreversível e depende de pedido explícito do usuário. O procedimento, e o de voltar a ler os dados antigos, está em `docs/DEPLOY_COOLIFY.md`.

Consequências: o servidor deixa de manter um PostgreSQL ocioso. A prova da cópia continua indireta; os dados originais seguem no volume até a decisão de apagá-lo. Evidência: `docs/audits/2026-09-10/evidence/ops/embedded-postgres-exit-red.txt` (compose de `main` em `a31c88e`: 6 falhas) e `embedded-postgres-exit-green.txt` (11/11).
