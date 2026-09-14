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
