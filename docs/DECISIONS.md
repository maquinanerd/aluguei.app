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

## ADR-063 — Multa, juros e vencimento por locação (P1-07) (Gate G3, trilha C, 2026-09-17)

Status: Aceito com o merge do PR #10 (`8409420`) e implantado na homologação.

Contexto: o cálculo da cobrança usava juros de mora de **1% ao dia** e multa de 2%, fixos no código
(`chargeCalc.ts`), sem teto: 100 dias de atraso dobravam o aluguel. O vencimento era o dia 10 em UTC
e não havia dia útil. O teste antigo de `finance.test.ts` fixava o valor errado dos juros.

Decisões:

- A locação guarda `late_fee_bps` (padrão 200 = 2%, de 0 a 1.000), `interest_monthly_bps` (padrão
  100 = 1% ao mês, de 0 a 100) e `due_day` (padrão 10, de 1 a 28), com CHECK no banco e validação no
  domínio (`assertLateChargeTerms`). `PATCH /leases/:id/terms` muda os três, com o diff (`from`,
  `to`) na auditoria.
- Juros de mora de 1% ao mês **pro rata die** (mês comercial de 30 dias), contados desde o
  vencimento, e multa uma vez só. Os dois incidem sobre o valor em atraso: aluguel, condomínio e
  tributos. O desconto abate no fim. A conta usa `BigInt` e trunca o centavo.
- Vencimento no dia `due_day` do mês do período. A data gravada é o dia combinado; em sábado,
  domingo ou feriado bancário nacional (datas fixas, Carnaval, Sexta-feira Santa, Corpus Christi e
  Consciência Negra desde 2024), o pagamento sem encargos vale até o próximo dia útil. Feriados
  estaduais e municipais ficam fora.
- "Hoje" é a data civil de São Paulo (`saoPauloDate`) na criação da cobrança, no recálculo do
  pagamento e na varredura diária. Entre 21h e meia-noite, a data UTC já é o dia seguinte.
- A cobrança nova usa as taxas da locação; o pagamento pelo backoffice recalcula com elas na data de
  São Paulo.
- `POST /charges` aceita `periodStart` e `dueDate` só como data civil `AAAA-MM-DD`. Antes aceitava
  qualquer texto e respondia 500 ("abc"). O diálogo "Nova cobrança" mandava o vencimento como
  instante UTC e oferecia "+30 dias", que ignorava o dia de vencimento da locação. Agora pede o mês
  de referência e, opcionalmente, a data; sem data, vale o dia da locação.
- O painel mostra data civil sem fuso (`formatDate` de `packages/ui`). `new Date('2026-10-10')` é
  meia-noite UTC, que em São Paulo ainda é o dia 9: vencimentos, períodos, início e término
  apareciam um dia antes.

Consequências: locações existentes recebem os padrões na migration 0019. O pagamento pelo portal
ainda usa o valor de face (`recalculate: false`) e fica na trilha E. Os juros de 1% ao mês são o
teto; contrato com juros menores é configurado por locação.

## ADR-064 — Repasse entre coproprietários (P1-08) (Gate G3, trilha C, 2026-09-17)

Status: Aceito com o merge do PR #10 (`8409420`) e implantado na homologação.

Contexto: a locação guardava um único `landlord_party_id` e 100% do repasse ia para ele. A soma das
participações dos proprietários do imóvel não era validada (120% aceito pela API).

Decisões:

- Tabela `lease_landlords` (`lease_id`, `party_id`, `share_bps` de 1 a 10.000, única por locação e
  pessoa, FKs compostas com a organização). A locação é criada com as participações dos
  proprietários do imóvel: proprietário único sem participação (ou com 100%) recebe 100%;
  coproprietários precisam ter participação registrada e somar exatamente 100%, senão 409.
- `POST /properties/:id/owners` recusa soma acima de 100% (409).
- A liquidação divide a parte dos proprietários com `splitAmong` (maior resto, sem perder centavo): uma
  alocação, um repasse e um lançamento `PAYOUT` por proprietário com valor.
- Os portais do proprietário (extrato e contratos) usam `lease_landlords`, e cada coproprietário vê
  só a sua parte. `leases.landlord_party_id` continua sendo o de maior participação.
- A migration 0019 cria `lease_landlords` para as locações existentes com 100% para o proprietário
  que elas já tinham.
- Interface: a tela do imóvel lista os proprietários com participação, adiciona (pessoa buscada no
  servidor e participação de 1% a 100%) e remove, e avisa quando a locação seria recusada. A tela da
  locação mostra cada proprietário com a participação e o acesso ao portal.

Consequências: mudar participação depois de criada a locação não altera a locação (ela guarda as
suas); a troca de participações de uma locação em vigor não tem fluxo e fica fora do G3. Remover
proprietário do imóvel não mexe em locações.

## ADR-065 — Renovação, reajuste, encerramento e scheduler (P1-20) (Gate G3, trilha C, 2026-09-17)

Status: Aceito com o merge do PR #10 (`8409420`) e implantado na homologação.

Contexto: o scheduler escolhia locações com `lt(status, 'TERMINATING')`, comparação alfabética que
incluía `ENDED` e `PENDING` e deixava de fora `TERMINATING`. Não existia renovação, reajuste nem
encerramento.

Decisões:

- Status cobrados: `ACTIVE`, `DELINQUENT` e `TERMINATING`, só nos meses da vigência (do mês de
  início ao mês de término).
- Tabela `lease_amendments` (`RENEWAL`, `READJUSTMENT`, `TERMINATION`) guarda o histórico: término
  anterior e novo, aluguel anterior e novo com o mês de início, índice e variação, motivo e autor.
  Mudança de aluguel exige os três campos (CHECK). As rotas travam a locação (`FOR UPDATE`).
- `POST /leases/:id/renew` (ativa ou inadimplente): novo término depois do atual e, opcionalmente,
  aluguel novo a partir do mês do dia seguinte ao término atual (sem término, o mês que vem).
- `POST /leases/:id/readjust` (em vigor): índice (IGP-M, IPCA, INPC, IVAR ou outro) com variação em
  basis points (arredondamento meio centavo para cima, aceita negativa) ou novo valor, a partir do
  primeiro dia de um mês dentro da vigência.
- Histórico encadeado: cada mudança guarda o aluguel anterior, então uma mudança nova não pode começar
  antes da última registrada (409); no mesmo mês, vale a mais recente. O aluguel de cada período sai
  do histórico (`rentForPeriod`), e o aluguel em vigor da locação muda na hora quando a mudança já
  começou.
- `POST /leases/:id/end`: término não antes do início, com motivo. Término já passado leva a `ENDED`;
  senão, `TERMINATING`, e a varredura diária encerra depois da data. Cobranças agendadas ou abertas
  de meses depois do mês do término, sem nenhuma tentativa de pagamento, são canceladas com estorno
  contábil e auditoria. Vencidas e com pagamento continuam, e a tela da locação avisa.
- Varredura diária no job de conciliação: agendada abre no início do período, aberta vence depois do
  vencimento (com a regra do dia útil), locação em encerramento termina depois da data de fim e o
  aluguel em vigor acompanha o histórico.
- Interface: "Reajustar", "Renovar" e "Encerrar" na locação, conforme o status; "Encargos e
  vencimento" com edição; "Histórico da locação". As regras de tela ficam em
  `apps/web/src/lib/lease-rules.ts` e `property-owners.ts`, comparadas com o domínio nos testes (o
  mesmo padrão do ADR-058).

Consequências: o mês do término é cobrado inteiro (sem proporcional); proporcional de entrada e saída
fica fora do G3. O scheduler mensal continua sem cobrar locação criada depois da execução do mês
(comportamento anterior).

## ADR-066 — Portal: extrato, contagem, vistoria visível e pagamento com encargos (P2-05) (Gate G3, trilha E1, 2026-09-21)

Status: Aceito com o merge do PR #12 (`aec1ca5`) e implantado na homologação.

Contexto: o extrato do locatário somava a cobrança cancelada em `billedCents`. `GET
/portal/tenant/charges` devolvia em `total` o id de uma cobrança, porque selecionava `charges.id`
como se fosse contagem. As listas de vistoria do portal ignoravam `canPortalReadInspection`, que
já existia no domínio: o locatário e o proprietário viam vistoria intermediária e rascunho. E o
pagamento pelo portal usava o valor de face (`recalculate: false`), sem a multa e os juros do
atraso (achado da trilha C).

Decisões:

- `buildTenantStatement` mantém a cobrança cancelada na lista, para o locatário ver o que
  aconteceu, e a deixa fora dos totais. A cobrança estornada continua em `billedCents` (foi
  cobrada) e fora de `paidCents`.
- `total` da lista de cobranças do locatário é `count(*)` com o mesmo filtro da página.
- `canPortalSeeInspection` (domínio) junta tipo e status: o portal só vê vistoria de entrada ou saída
  já concluída ou assinada. As duas listas de vistoria do portal passam por ela.
- O pagamento pelo portal recalcula multa e juros na data de São Paulo, como o backoffice. O
  caminho idempotente segue devolvendo o QR emitido pelo provider (teste de regressão: a segunda
  tentativa traz o mesmo QR, com o id da cobrança no provider).

Consequências: a tela do portal não muda; os números passam a bater com o que é devido.

## ADR-067 — Evidência de vistoria imutável depois de concluída (P1-24) (Gate G3, trilha E1, 2026-09-21)

Status: Aceito com o merge do PR #12 (`aec1ca5`) e implantado na homologação.

Contexto: ambiente, mídia, observação e sugestão de IA continuavam mutáveis depois de COMPLETED, e
apagar mídia não deixava rastro na auditoria.

Decisões:

- `INSPECTION_EVIDENCE_WRITABLE_STATUSES` (DRAFT, CAPTURING, PROCESSING, REVIEW) e
  `assertInspectionEvidenceWritable` no domínio, no mesmo padrão do conteúdo do contrato (ADR-047).
  Ambiente, URL de upload, confirmação de mídia, remoção de mídia, observação e resolução de
  sugestão recusam com 409 depois de COMPLETED ou SIGNED.
- Remover mídia grava `inspection.media_removed` na auditoria (mídia e tipo).
- A tela da vistoria esconde as ações de evidência e explica por quê
  (`apps/web/src/lib/inspection-rules.ts`, comparado com o domínio no teste).

Consequências: a comparação entrada × saída passa a exigir que as observações entrem antes de
concluir cada vistoria (o teste antigo registrava observação depois de COMPLETED). Correção de
vistoria concluída exige uma vistoria nova; não há "reabrir".

## ADR-068 — Handoff do WhatsApp até a equipe devolver (P1-18, primeira parte) (Gate G3, trilha E1, 2026-09-21)

Status: Aceito com o merge do PR #12 (`aec1ca5`) e implantado na homologação.

Contexto: o gateway voltava a conversa para ACTIVE a cada mensagem recebida, então o handoff durava
uma mensagem só. Na caixa de entrada, o botão de uma conversa já em atendimento humano chamava o
próprio handoff de novo ("Assumir"), sem efeito, e não havia como devolver a conversa ao bot.

Decisões:

- O gateway não tira a conversa de NEEDS_HUMAN. O UPDATE para ACTIVE exclui NEEDS_HUMAN no
  próprio filtro, o que também cobre o handoff pedido pela equipe enquanto a mensagem é processada.
- `POST /conversations/:id/resume` (permissão `conversation:write`) devolve ao atendimento
  automático: só de NEEDS_HUMAN (senão 409), com compare-and-set, evento `HANDOFF_RETURNED` na linha
  do tempo e auditoria `conversation.handoff_returned`. O handoff pedido pela equipe passa a ser
  auditado também.
- Caixa de entrada: "Passar para a equipe" em conversa aberta ou ativa e "Devolver ao atendimento
  automático" em conversa com a equipe (`apps/web/src/lib/conversation-rules.ts`, comparado com
  `canTransitionConversation`).

## ADR-069 — Configuração explícita: NODE_ENV obrigatório e fail-fast em produção (P1-12) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: `NODE_ENV` tinha default `development` no schema, então um deploy sem a variável
subia com rotas de simulação de pagamento, cookie sem `Secure`, webhooks sem exigir segredo e
providers FAKE. A API e o worker subiam em produção sem banco e sem segredo de webhook, e só
falhavam na primeira requisição (ou silenciosamente, no caso do worker, que pulava o ciclo).

Decisões:

- `loadRuntimeEnv(serviço, source)` (`packages/config/src/runtime.ts`) é o único ponto de
  entrada de configuração da API e do worker. **NODE_ENV é obrigatório**: não há ambiente
  padrão. O default `development` continua no `envSchema` apenas para uso como biblioteca e nos
  testes (`loadEnv`, `envSchema.parse`).
- Em produção, a validação lista **todos** os problemas de uma vez, um por linha, e o processo
  termina com `exitCode 1` sem subir servidor nem loop. Exigências: `DATABASE_URL`
  (postgres/postgresql); na API, `APP_BASE_URL` https explícita, `COOKIE_SECURE` diferente de
  `false`, os quatro segredos de webhook (`ASAAS_WEBHOOK_TOKEN`, `SIGNATURE_WEBHOOK_TOKEN`,
  `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`), `META_TOKEN_ENCRYPTION_KEY` em hex de 64 e
  escolha explícita de `PAYMENT_PROVIDER`, `SIGNATURE_PROVIDER`, `META_MODE` e `AI_PROVIDER`;
  no worker, `PAYMENT_PROVIDER`, `SCREENING_PROVIDER`, `META_MODE` e `AI_PROVIDER`. Provider
  real exige credencial (`ASAAS_API_KEY` + `ASAAS_ENV`, `CLICKSIGN_API_TOKEN`, `SERASA_CLIENT_*`,
  tokens da Meta/WhatsApp no `live`, chave do OpenAI/Gemini). `D4SIGN` e `SPC` são recusados por
  não terem adapter. A mensagem nunca repete o valor de uma variável.
- **FAKE, mock e dry_run em produção só com `ALLOW_FAKE_PROVIDERS=true`** (valor exato). Com a
  permissão, o processo sobe e registra em `warn` quais providers são FAKE. A homologação recebe
  a permissão no `docker-compose.prod.yml` (api e worker).
- Fallbacks silenciosos removidos: WhatsApp e Meta Ads só usam FAKE com `dry_run` **explícito**
  (antes: qualquer modo diferente de `live`); o worker não escolhe pagamento FAKE sem
  `PAYMENT_PROVIDER` nem o esqueleto Serasa em produção sem `SCREENING_PROVIDER`. `dry_run` e
  screening FAKE continuam padrão **fora** de produção (`resolveMetaMode`,
  `resolveScreeningProvider`).
- Scripts de desenvolvimento declaram o ambiente: `dev` da API e do worker pré-carregam
  `scripts/node-env-development.mjs` (define `NODE_ENV=development` se o shell não trouxer) e a
  stack E2E passa `NODE_ENV=development` explícito.

Consequências: qualquer processo novo (CLI, job, cron) que leia configuração deve usar
`loadRuntimeEnv` e declarar o que precisa; um provider novo entra na tabela de validação e na
lista de FAKE. Rodar a API ou o worker "na mão" exige `NODE_ENV` no comando.

## ADR-070 — `.env.example` é contrato do schema, verificado por teste (P1-12) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: o exemplo tinha 18 chaves de menos (incluindo `PAYMENT_PROVIDER`,
`SIGNATURE_WEBHOOK_TOKEN` e `PLATFORM_ADMIN_EMAILS`) e duas que nenhum processo lia
(`API_BASE_URL` não estava no schema; `SENTRY_DSN` não tinha implementação).

Decisões: `packages/config/src/env-example.test.ts` falha quando uma chave existe num lado e
não no outro, quando uma chave se repete, quando o exemplo (sem os vazios) não é configuração
válida de desenvolvimento para API e worker, ou quando um campo de segredo vem preenchido. As
variáveis lidas pelo web (`API_BASE_URL`, `API_BASE_URL_ALLOW_HTTP`, `PUBLIC_ORG_SLUG`) entram
no schema como opcionais — o web não depende de `@aluguei/config`, mas a documentação das
variáveis fica num lugar só. `SENTRY_DSN` sai do exemplo (ver ADR-075).

Consequências: chave nova no schema exige linha no exemplo (e vice-versa) no mesmo commit.

## ADR-071 — Rate limit com Redis: client do ioredis e falha aberta (P1-14) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: com `REDIS_URL` preenchida a API caía no boot com
`TypeError: this.redis.defineCommand is not a function`: o `@fastify/rate-limit` registra
comandos Lua e precisa do client do ioredis, mas recebia o adapter `get/set/del` de
`createRedisClient`.

Decisões: `createRateLimitRedis` (`packages/integrations/src/redis/rate-limit.ts`) devolve o
client do ioredis com `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`,
`commandTimeout: 500 ms`, `connectTimeout: 2 s` e reconexão progressiva até 5 s — nenhuma
requisição espera pelo cache. Erro de conexão vai para o log em `warn` e o client fecha no
`onClose` (QUIT se conectado, senão só desconecta). Chaves com prefixo `aluguei:rate-limit:`.
Com o Redis fora do ar, `skipOnError: true`: **a requisição passa sem contar**. Preferimos
perder o limite temporariamente a derrubar a API inteira por causa do cache do contador; o erro
de conexão fica no log e a proteção volta sozinha.

Consequências: durante uma queda do Redis, brute-force de login fica só com as defesas do
domínio (hash com custo, mesma resposta para e-mail inexistente). Se o limite passar a ser
controle de segurança crítico, a decisão deve ser revista para falha fechada com página de erro.

## ADR-072 — API interna por http no web só com permissão explícita (P1-15) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: o web de produção exige `API_BASE_URL` https (o BFF repassa o cookie de sessão).
Com a API na rede interna do deploy (`http://api:4000`) o painel caía no login, então a
homologação fala com a API pelo domínio público — tráfego interno saindo e voltando pelo proxy.

Decisões: `assertSecureApiBase` continua exigindo https em produção. Com
`API_BASE_URL_ALLOW_HTTP=true` (valor exato) aceita http **apenas** para endereço interno: nome
de serviço sem domínio (Docker/Coolify), `localhost`/loopback, IPv4 privado (10/8, 172.16/12,
192.168/16) ou domínio `.internal`/`.local`. http para endereço público continua recusado, com
mensagem própria. Produção sem `API_BASE_URL` passa a ser recusada em vez de cair em
`http://localhost:4000`.

Consequências: a homologação pode passar a chamar a API pela rede interna com duas variáveis
(`API_BASE_URL=http://api:4000` e a permissão), o que também tira o tráfego do proxy do rate
limit — a troca fica para o deploy, com smoke (não foi ativada nesta trilha).

## ADR-073 — Worker operável: log por job, health HTTP e parada graciosa (P2-10) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: o worker só logava "worker started" (um job que falhava não deixava rastro), não tinha
health — um worker travado ou sem banco parecia saudável — e no SIGTERM chamava `process.exit`
na hora, cortando o job em andamento e deixando o pool aberto.

Decisões:

- **Log por job** nas três filas (inbox, canais, Meta): `job.started`, `job.finished` e
  `job.failed` com fila, id, tipo, tentativa, organização, duração em ms, status gravado na fila
  e a mensagem de erro saneada (mais tipo e pilha, ver ADR-075). Ciclo em `debug`
  (`worker.cycle`), falha de ciclo em `error`.
- **Loop com parada** (`job-loop.ts`): um ciclo por vez, o primeiro logo ao iniciar; `stop`
  para de pegar jobs e espera o ciclo em andamento até o limite, devolvendo `drained` ou
  `timeout`. O estado (falhas seguidas, último ciclo bem-sucedido, ciclo em andamento) alimenta
  o health.
- **Health HTTP** em `WORKER_HEALTH_PORT` (ausente: sem servidor): `GET /health` responde 200
  com o loop saudável e 503 com o motivo — `stopping`, `not_started`, `cycle_stuck` (ciclo
  passando de 5 min, o mesmo limite do reaper), `failing` (3 falhas seguidas) ou `stale` (sem
  ciclo bem-sucedido por 12 intervalos de poll, no mínimo 60 s). O corpo só tem estado do loop.
- **SIGTERM/SIGINT**: registra `worker.stopping`, para de pegar jobs, espera os em andamento até
  `WORKER_SHUTDOWN_TIMEOUT_MS` (padrão 20 s), fecha health e pool e deixa o processo terminar
  sozinho (`worker.stopped`). Estourado o limite: `worker.shutdown_timeout` em `error`,
  `exitCode 1` e `process.exit(1)` só depois de 1 s de folga — a execução interrompida volta à
  fila pelo reaper. No compose, `stop_grace_period: 30s` e healthcheck na porta 4001.

Consequências: o orquestrador passa a ter sinal de saúde do worker (o Coolify mostra
`unhealthy` sem reiniciar); um deploy derruba o worker esperando os jobs em andamento. Job
travado além do limite ainda termina em exit forçado — com log e reenfileiramento.

## ADR-074 — OTEL: instrumentação de HTTP, fetch e pg, ligada por endpoint (P2-11) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: o tracer subia sem instrumentação nenhuma — com `OTEL_EXPORTER_OTLP_ENDPOINT`
definido, nenhum span era criado. O endpoint ia cru para o exportador (o coletor recebia POST na
raiz, não em `/v1/traces`) e o SDK ligava também exportadores de métricas e logs para
`localhost:4318`.

Decisões:

- `startTelemetry` (`packages/observability/src/telemetry.ts`) substitui `initTracer` e registra
  `@opentelemetry/instrumentation-http` (servidor e cliente `node:http`),
  `@opentelemetry/instrumentation-undici` (`fetch`, usado por todos os providers) e
  `@opentelemetry/instrumentation-pg`. Versões exatas do mesmo trem do `sdk-node` 0.221.0 já
  usado (`0.221.0`, `0.73.0` e `0.31.0`, todas Apache-2.0, do repositório oficial
  open-telemetry). Métricas e logs OTLP ficam desligados (esta fase é só tracing) e não há
  detectores de recurso — nada de linha de comando, usuário e máquina no recurso.
- Só liga com `OTEL_EXPORTER_OTLP_ENDPOINT` (a base do coletor; `/v1/traces` é acrescentado uma
  vez) ou com exportador injetado nos testes. Sem endpoint, nenhum instrumentador é registrado:
  a homologação atual não paga nada por telemetria.
- **Ordem de carga**: os instrumentadores só enxergam módulos carregados depois do
  `startTelemetry`. Os pontos de entrada validam a configuração, sobem a telemetria e só então
  importam o app por **import dinâmico**. O worker passa a entrar por
  `apps/worker/src/main.ts` (o `index.ts` continua sendo a biblioteca, importada pelos testes e
  pela API); compose, stack E2E e scripts apontam para o novo caminho.
- Spans do produto: request com a rota do Fastify (`http.route` e nome `GET /rota`), ciclo do
  worker (`worker.cycle`) e job (`job <tipo>`, com fila, id, tipo, tentativa e organização) —
  as queries pg e as chamadas de provider de cada job entram no mesmo trace.

Consequências: quem quiser traces aponta `OTEL_EXPORTER_OTLP_ENDPOINT` para um coletor e recebe
HTTP + pg + jobs correlacionados. Qualquer ponto de entrada novo precisa repetir a ordem
(configuração → telemetria → import dinâmico do app), e o `index.ts` do worker não deve voltar a
ser o comando do container.

## ADR-075 — Captura de erro sem Sentry: log estruturado com pilha e marca no span (P2-11) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: não havia captura de erro. Um 5xx saía como `unhandled error` sem rota nem pilha
utilizável; falha de job só deixava a mensagem; `unhandledRejection` e `uncaughtException`
derrubavam o processo sem rastro. A opção óbvia seria o Sentry (`SENTRY_DSN` já aparecia no
`.env.example`, sem implementação).

Decisões: **não adotar Sentry nesta fase**. O SDK atual do Sentry para Node traz o próprio
OpenTelemetry e registra provider e instrumentadores por conta — conviveria com o tracing desta
trilha exigindo configuração para não duplicar, além de mandar dado de erro (com PII potencial)
para fora do servidor, o que a homologação não precisa. No lugar:

- `captureError` (`packages/observability/src/errors.ts`) registra `event=error.captured` com
  origem (`http_5xx`, `job_failed`, `unhandled_rejection`, `uncaught_exception`), contexto e
  pilha, e marca o span ativo com exceção e status de erro — o mesmo trace que já carrega HTTP e
  pg. `errorDetails` troca a primeira linha da pilha pela mensagem saneada, para que URL e token
  do provider não voltem pela pilha.
- 5xx da API sai com método, rota, código do Postgres e causa; 4xx não vira erro de servidor.
  Falha de job leva tipo e pilha junto da mensagem saneada. `unhandledRejection` e
  `uncaughtException` registram e levam ao encerramento gracioso com `exitCode 1`.
- `SENTRY_DSN` sai do `.env.example`. Se o produto precisar de agregação com alerta, o caminho é
  um coletor OTLP (os spans de erro já vão para lá) ou o Sentry com
  `skipOpenTelemetrySetup`, reutilizando o tracer desta trilha — decisão de outra fase.

Consequências: alerta depende de quem lê log/coletor; não há notificação automática de erro
enquanto não houver coletor na homologação.

## ADR-076 — Redação de dado pessoal nos logs: por caminho e por padrão de valor (P2-11) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: o `redact` do logger cobria senha, token e `authorization`, mas não cookie, CPF,
e-mail nem telefone. A busca de pessoas aceita CPF, e-mail e telefone em `q`, e a URL inteira ia
para o log de requisição; mensagens de violação de unicidade do PostgreSQL trazem o valor
(`Key (email)=(...)`).

Decisões:

- **Por caminho** (pino `redact`): `cookie` e `set-cookie` em qualquer cabeçalho até dois
  níveis, além de `cpf`, `cnpj`, `document`, `email`, `phone`, `waContactId` e o valor das
  identidades.
- **Por padrão de valor** (`packages/observability/src/pii.ts`): e-mail, CPF e CNPJ formatados,
  telefone com `+55`, com DDD entre parênteses ou com hífen, `wa_id` (55 + 10 ou 11 dígitos) e
  11 dígitos soltos (ambíguos entre CPF sem máscara e celular com DDD, marcados como
  `[REDACTED:DOC]`). Vale na mensagem e nos argumentos (hook `logMethod`), numa **cópia** do
  objeto do log (o objeto de quem loga não é alterado) e no erro serializado — mensagem, pilha e
  causas.
- **Requisição do Fastify**: serializer próprio com os campos do padrão e a URL redigida; os
  valores de `q`, `query`, `search`, `email`, `cpf`, `cnpj` e `phone` saem inteiros.
- Identificador (UUID), data ISO, epoch em ms e s e valores em centavos continuam legíveis —
  há teste para isso, porque uma redação gulosa deixaria o log inútil.

Consequências: log de produção não serve para achar "o CPF que a pessoa digitou"; a
investigação usa id de entidade e de requisição. Padrão novo (por exemplo, RG ou CNH) precisa
entrar na lista com teste.

## ADR-077 — `audit_events.payload` com o diff dos campos alterados, sem dado pessoal (P2-11) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: o payload chegava vazio nas atualizações — a trilha dizia "imóvel atualizado" sem
dizer o que mudou, e quem operasse não tinha como conferir uma alteração indevida.

Decisões: `auditDiff(before, after, opts)` (`apps/api/src/plugins/audit.ts`) compara o corpo da
atualização com o registro atual **pelo conteúdo** (datas em ISO; objeto e lista pela
serialização) e devolve `{ fields, changes: { campo: { from, to } } }` só com o que mudou.
`id`, `orgId`, `createdAt` e `updatedAt` ficam fora. Campo conhecido como pessoal (nome, e-mail,
telefone, documento, CPF, CNPJ, nascimento, contato de WhatsApp, IP, user agent, senha) aparece
como alterado com valor `[REDACTED]`; texto livre passa pela redação por padrão de valor e é
cortado em 200 caracteres. Aplicado em `PATCH /properties/:id` e na troca de papel de membro
(que grava só o id do usuário ao lado do diff do papel).

Consequências: rota de atualização nova deve passar o diff no `writeAudit`; campo pessoal novo
entra na lista de `PERSONAL_FIELDS` (ou é declarado por quem chama). O payload é trilha, não
cópia do registro: não serve para restaurar valor antigo de texto longo.

## ADR-078 — Runner de migration com trava consultiva e saída sem segredo (P2-12) (Gate G3, trilha F, 2026-09-21)

Status: Aceito com o merge do PR #13 (`52e2582`) e implantado na homologação.

Contexto: duas execuções simultâneas de `packages/db/scripts/apply-migrations.mjs` (dois
deploys, ou `migrate` reiniciado antes de o anterior terminar) leem "nada aplicado" e aplicam a
mesma cadeia ao mesmo tempo: a segunda falha no meio (`23505` em `pg_type`), deixando o deploy
vermelho com o banco em estado indefinido. A saída do script vai para o log do deploy.

Decisões: o runner usa um único cliente e uma trava consultiva do PostgreSQL —
`pg_try_advisory_lock` e, se ocupada, log de espera e `pg_advisory_lock` com `lock_timeout` de
10 minutos. Quem chega depois encontra a cadeia aplicada e não faz nada. A trava é da sessão:
se o processo morrer, o servidor a solta. Falha vira uma linha com motivo e código (sem pilha
nem objeto do driver), com a URL e a senha trocadas por `***`; em produção, sem `DATABASE_URL`,
o runner não cai no banco local padrão. Saída por `process.exitCode`, sem `process.exit`.

Consequências: o serviço `migrate` pode ser reexecutado sem risco de disputa; uma execução presa
bloqueia as outras por até 10 minutos (com log dizendo que está esperando).

## ADR-079 — Backup cifrado com restauração provada (Gate G3, trilha F2, 2026-09-22)

Status: Aceito com o merge do PR #15 (`901bb3c`) e implantado na homologação.

Contexto: a homologação tinha só o backup diário do próprio Coolify (dump sem cifra, no disco do
servidor, 14 cópias), e nenhuma restauração tinha sido provada. O plano pede backup com `pg_dump`,
retenção e criptografia, e restauração testada de forma automatizada; a cópia fora do servidor
depende de um destino do usuário (Fase 7).

Decisões:

- Linha de comando `packages/db/src/backup/cli.ts` (`@aluguei/db/backup`), com cinco comandos:
  `backup`, `restore`, `verify`, `schedule` e `health`.
- **Formato:** `ALUGUEI-BKP1` + IV + dump em formato custom cifrado com AES-256-GCM + etiqueta. A
  etiqueta autentica o arquivo inteiro: adulteração, truncamento ou chave errada falham antes de
  qualquer escrita no destino.
- **Cifra no backup:** em fluxo, direto da saída do `pg_dump`, então o dump não toca o disco em
  claro.
- **Decifra na restauração:** vai para um arquivo temporário que só sobrevive se a autenticação
  passar. Depois vem o `pg_restore --single-transaction --exit-on-error`.
- **Chave:** 32 bytes em hex (`BACKUP_ENCRYPTION_KEY`), na homologação `SERVICE_HEX_64_BACKUPKEY`
  do Coolify (`bin2hex(random_bytes(32))`). Nada de senha derivada: a chave já é aleatória e do
  tamanho certo.
- **Conexão:** por variáveis de ambiente (PGHOST, PGPASSWORD…), nunca em argumento. O log traz host,
  porta e banco, sem usuário e senha.
- **Restauração só em banco vazio:** um destino com tabelas é recusado, para ninguém restaurar por
  cima do banco em uso.
- **Retenção:** os `BACKUP_KEEP` mais novos (padrão 14), escolhidos pelo nome, que carrega o
  instante UTC. Arquivos com outro nome não são tocados.
- **Agendamento:** serviço `backup` no compose, na imagem `server` com `pg_dump` 17 do repositório
  oficial do PostgreSQL. O bookworm traz a 15, que não lê um banco 17. Um backup por dia às 06:00
  UTC, e um na subida se o último tiver mais de 24 h.
- **Saúde:** `status.json` com o último backup bom, o último erro e a próxima execução. O
  healthcheck fica vermelho sem backup bom em 26 h, e o Coolify mostra a aplicação sem saúde.
- **Prova:** `backup-restore.pg.test.ts`, em `pnpm test:pg` no CI, com o cliente 17 instalado no
  job. Faz backup de um banco com locação, cobrança paga, split, repasse e razão pela mesma linha de
  comando, restaura num banco vazio e compara todas as tabelas (contagem e hash das linhas).

Consequências:

- **Chave:** a chave existe só no Coolify. Sem uma cópia dela fora do servidor, os backups cifrados
  não abrem se o VPS se perder. A guarda da chave e o destino externo são do usuário (Fase 7).
- **Dois backups:** o backup do Coolify continua, como segundo caminho, sem cifra.
- **Sem PITR:** não há backup contínuo; depende de WAL archiving ou de destino externo.
- **Arquivos do MinIO:** seguem sem backup (limitação registrada no deploy).

## ADR-080 — CPF e CNPJ com dígito verificador (P2-01) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: `POST /parties` só normalizava o documento (dígitos) e aceitava `12345678900` como CPF. O
dígito verificador não era conferido em lugar nenhum.

Decisões:

- `packages/domain/src/values/documents.ts`: CPF e CNPJ pelo módulo 11, recusando sequência de
  dígitos iguais (`11111111111` passa no módulo 11 e não é CPF). `assertValidIdentityValue` valida
  cada tipo de identidade — CPF, CNPJ, e-mail com domínio, telefone com DDD (10 a 13 dígitos) e
  passaporte alfanumérico — com `INVALID_INPUT` (400).
- A validação vale na criação e na edição da pessoa. A deduplicação (`POST /parties/dedupe`)
  continua aceitando valor mal formado: ela procura, não cadastra.
- A tela confere antes de enviar (`apps/web/src/lib/party-rules.ts`), comparada com o domínio em
  milhares de números gerados; o servidor continua sendo a regra.
- Três testes antigos cadastravam CPF inválido e passaram a usar CPFs válidos (só o dado mudou).

Consequências: pessoas já gravadas com documento inválido não são corrigidas pela migration; a
primeira edição da pessoa exige documento válido. O documento da imobiliária no cadastro aberto
(`POST /auth/register`) continua só com o tamanho: fica fora da trilha D.

## ADR-081 — Detalhe, edição, arquivamento e documentos da pessoa (P2-01) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: não existia `GET /parties/:id` nem edição, e a tabela `party_documents` não tinha rota.

Decisões:

- `GET /parties/:id` traz identidades, endereços, papéis, consentimentos e documentos; pessoa de
  outra organização responde o mesmo 404 da inexistente (ADR-044).
- `PATCH /parties/:id` com trava de linha. Nome, tipo e status mudam campo a campo; identidades,
  papéis e endereços chegam como lista completa e substituem as atuais. Identidade que já é de outra
  pessoa da organização responde 409 (antes a UNIQUE viraria 500).
- Não há exclusão: a pessoa é arquivada (`status` `ACTIVE` | `ARCHIVED`, com CHECK). A lista mostra
  só as ativas; `?status=ARCHIVED` mostra as arquivadas; `?ids=` resolve qualquer uma (linhas
  antigas continuam com o nome).
- Auditoria com diff (`party.updated`, `party.archived`, `party.reactivated`). Das identidades o
  diff guarda só os tipos, nunca o valor do documento ou do telefone.
- Documentos: `POST /parties/:id/documents/upload-url` (chave gerada no servidor com o prefixo da
  organização e da pessoa, até 20 MB), `…/confirm` (confere o objeto no storage e o tamanho real,
  idempotente pela chave única), `GET …/documents` e `DELETE …/documents/:documentId`. Tipos
  fechados com CHECK: identidade, CPF, comprovante de renda, comprovante de endereço, estado civil,
  contrato social e outro.
- Interface: detalhe em `/app/crm/contacts/[id]` com dados, documentos e consentimentos; edição
  (nome, tipo, papéis, identificadores e endereços), arquivar e reativar com confirmação.

Consequências: excluir um documento apaga o registro, não o objeto no storage (limpeza de órfãos é o
P2-13). Sem bucket configurado, o envio mostra o erro da API ("Storage não configurado").

## ADR-082 — Ciclo de vida da visita (P2-02) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: a visita nascia `SCHEDULED` e nunca mudava.

Decisões:

- Máquina de estado em `packages/domain/src/crm/visit.ts`: agendada → confirmada, realizada, não
  compareceu ou cancelada; confirmada → realizada, não compareceu, cancelada ou agendada de novo
  (reagendar tira a confirmação). Cancelar exige motivo. Status final não volta.
- `PATCH /visits/:id/status` e `POST /visits/:id/reschedule` (nova data e hora; volta para
  agendada), com trava de linha, compare-and-set no status, evento na timeline e auditoria com diff.
  `GET /visits/:id`. A criação só aceita agendada ou confirmada.
- Banco: CHECK do status e CHECK de que cancelada tem motivo (`cancel_reason`); `status_changed_at`.
- Interface: ações no detalhe da visita conforme o status, reagendamento e cancelamento em diálogo
  (motivo obrigatório).

## ADR-083 — Ciclo de vida e expiração da proposta (P2-02) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: a proposta nascia `DRAFT` e nunca saía dali; `valid_until` era instante e não tinha efeito.
O formulário mandava a data do campo como instante UTC.

Decisões:

- `valid_until` passa a ser data civil (o último dia em que a proposta vale). A migration 0020 foi
  editada à mão para converter no fuso de São Paulo (`USING (valid_until AT TIME ZONE
'America/Sao_Paulo')::date`); sem isso a conversão usaria o fuso da sessão. A API aceita só
  `AAAA-MM-DD` que existe (`isoDateSchema`).
- Máquina de estado em `packages/domain/src/crm/proposal.ts`: rascunho → enviada (exige validade);
  enviada → aceita, recusada (exige motivo) ou expirada. Só o rascunho é editável (valor, condições
  e validade). O envio recusa validade anterior a hoje (data de São Paulo).
- `PATCH /proposals/:id`, `PATCH /proposals/:id/status` e `GET /proposals/:id`, com trava de linha,
  compare-and-set, timeline e auditoria com diff. `sent_at`, `decided_at` e `decision_reason`.
- Banco: CHECK do status, de que enviada tem validade e de que recusada tem motivo.
- Worker: job diário `PROPOSAL_EXPIRY` por organização (mesma fila dos jobs de cobrança). Proposta
  enviada com a validade anterior a hoje em São Paulo vira `EXPIRED` por compare-and-set (uma
  aceitação no mesmo instante vence), com timeline e `proposal.expired` na auditoria.
- Interface: validade como data civil no formulário e na exibição; editar no rascunho, enviar com a
  validade, aceitar e recusar com motivo no detalhe.

Consequências: expirar é só do worker; a tela não oferece "expirar". Aceitar a proposta não cria
candidatura nem locação — continua sendo passo manual.

## ADR-084 — Detalhe e edição do lead (P2-03) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: não existia `GET /leads/:id`; a tela do lead buscava a lista inteira e filtrava. Não havia
edição de dados nem de responsável.

Decisões:

- `GET /leads/:id` com os imóveis de interesse; `PATCH /leads/:id` para origem, canal, responsável,
  orçamento, observações, pessoa e imóveis de interesse (lista completa). O status continua só em
  `PATCH /leads/:id/status`, pelo funil do domínio (`status` no corpo do PATCH → 400).
- O responsável precisa ser membro da organização (404 uniforme). Orçamento mínimo acima do máximo →
  400, considerando o valor já gravado quando só um limite chega; `null` limpa o limite.
- Auditoria com diff; das observações o diff guarda só o tamanho.
- `GET /me/members`: nome e função da equipe da organização ativa, sem e-mail, para qualquer membro
  (o corretor edita lead e não tem `member:read`). Usa o `meMembersResponseSchema` que já existia.
- Interface: o detalhe usa a rota própria; "Editar lead" com responsável, canal, fonte, orçamento e
  observações.

## ADR-085 — Troca e recuperação de senha (P2-04) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Decisões:

- `POST /auth/change-password`: exige a senha atual (401 se errada), recusa a igual à atual e
  encerra as outras sessões do usuário — a sessão que trocou continua.
- `POST /auth/forgot-password`: resposta única com ou sem conta (sem enumeração). Token opaco de
  32 bytes; o banco guarda só o SHA-256 (`password_reset_tokens`), validade de 30 minutos, e um
  pedido novo invalida os anteriores.
- `POST /auth/reset-password`: uso único com trava na linha do token (`FOR UPDATE`) — provado em
  PostgreSQL real: um segundo uso em paralelo espera e recebe 404. Encerra todas as sessões.
- Token vencido, usado, revogado ou inexistente: o mesmo 404. O token nunca entra na auditoria.
- Interface: "Trocar senha" em Configurações; "Esqueci minha senha" no login leva a
  `/esqueci-senha`, e o link leva a `/redefinir-senha`.

## ADR-086 — Convite de membro por e-mail e caixa de saída local (P2-04) (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: `POST /organizations/:orgId/members` exigia o `userId` de quem já tinha conta. Não há
provider de e-mail no produto, e nenhuma trilha do G3 pode ter efeito externo.

Decisões:

- `POST /organizations/:orgId/invites` (`member:manage`): e-mail normalizado, função, token opaco
  com hash e validade de 72 horas. Quem já é membro ou já tem convite pendente → 409. O limite de
  usuários do plano é conferido no convite e de novo no aceite.
- `GET …/invites` (situação derivada: pendente, aceito, revogado, expirado) e `DELETE
…/invites/:inviteId` (revoga).
- `POST /invites/describe` e `POST /invites/accept` sem sessão, com o token no corpo (não na URL da
  API). Sem conta, o aceite cria o usuário com o nome e a senha que a própria pessoa escolhe e abre
  a sessão; com conta, só acrescenta o vínculo — a senha existente não muda e nenhuma sessão é
  aberta. Aceitar é usar o token (`accepted_at`); o reuso responde 404. Trava na linha do convite,
  provada em PostgreSQL real (sem ela o segundo aceite criava outra conta).
- Caixa de saída local `email_outbox` (tipo e status com CHECK): a recuperação de senha e o convite
  **gravam a mensagem e não enviam nada**. `GET /email-outbox` exige `org:manage` e só mostra a
  própria organização; a mensagem de senha nasce sem organização e não aparece para ninguém da
  imobiliária. `GET /dev/email-outbox?to=` existe só fora de produção (como `/dev/fake-payments`)
  para o E2E abrir o link.
- Interface: "Convidar membro" por e-mail e função, lista de convites com revogação, "Caixa de
  saída" (avisa que nenhum e-mail é enviado) e a tela `/convite`.

Consequências: sem provider de e-mail, em produção a pessoa convidada ou que esqueceu a senha não
recebe nada — o link só existe na caixa de saída. Enviar de verdade exige escolher um provider e uma
credencial (decisão de produto, fora do G3). O convite pendente não conta no limite do plano até
ser aceito.

## ADR-087 — Ordem das camadas do design system (Gate G3, trilha D, 2026-09-22)

Status: Aceito com o merge do PR #18 (`0d9e352`) e implantado na homologação.

Contexto: o drawer (140) ficava por cima do modal (130), e o modal por cima do toast (120). Um
diálogo aberto a partir do detalhe em drawer (cancelar visita, recusar proposta) ficava escondido.

Decisão: `--peg-z-drawer: 130`, `--peg-z-modal: 140`, `--peg-z-toast: 150` — a mesma ordem do design
system de referência (Kal El: drawer, modal, toast). Teste em `packages/ui/src/styles/z-order.test.ts`.

## ADR-088 — Prova de posse do número do WhatsApp (P1-18, segunda parte) (Gate G3, trilha E2, 2026-09-22)

Status: Aceito com o merge do PR #20 (`bef9660`) e implantado na homologação.

Contexto: qualquer organização com `org:manage` reivindicava qualquer `phoneNumberId` com
`POST /whatsapp/connections`, e o webhook entregava as mensagens daquele número à organização que
reivindicou primeiro — inclusive as dos clientes de outra imobiliária. A credencial da Meta era uma
só para a plataforma, então não havia com o que provar a posse. A tela de integrações ainda tinha o
botão "Conectar (teste)", que reivindicava o número fixo `fake-phone-1` sem token.

Decisões:

- **Credencial por conexão.** `POST /whatsapp/connections` exige `accessToken`: o token da conta do
  WhatsApp Business da própria imobiliária (usuário do sistema da WABA). O token é cifrado com o
  mesmo helper e a mesma chave do token da Meta Ads (`encryptSecret`, AES-256-GCM,
  `META_TOKEN_ENCRYPTION_KEY`, formato `keyId:iv:ciphertext` e `token_key_id`, ADR-028). Sem a
  chave, o pedido é recusado (400) — o token nunca é guardado em claro. O token não volta em
  nenhuma resposta nem na auditoria (a auditoria já redige chaves `token`, e o payload nem as
  contém). `phoneNumberId` e `businessAccountId` passam a aceitar só dígitos.
- **Status com CHECK.** `PENDING | VERIFIED | DISABLED` (`whatsapp_connections_status_valid`), com
  `VERIFIED` exigindo `verified_at` e `PENDING` exigindo `claim_expires_at`. O padrão da coluna
  passa a `PENDING`. O `ACTIVE` antigo deixa de existir: a 0021 converte as conexões antigas em
  `PENDING` já vencidas e sem token — elas nunca provaram a posse. A organização informa o token e
  verifica de novo; enquanto isso, o número não recebe mensagens.
- **Só VERIFIED recebe webhook.** O webhook resolve a conexão pelo número e, se o status não passa
  em `canReceiveWhatsAppWebhook` (domínio), ignora com 200 e registra só o número e o status no log
  — nada é enfileirado, nenhum conteúdo é gravado, e nada chega a outra organização. Não há
  dead-letter: guardar a mensagem de um número sem dono comprovado seria justamente reter dado de
  cliente de terceiro.
- **Quem pode reivindicar** (`decideWhatsAppClaim`, domínio): número livre cria a reivindicação
  `PENDING` com prazo de 24 h; a própria organização troca o token (e renova o prazo) enquanto
  pendente ou desativada; número `VERIFIED` responde 409 para todos (a própria dona também, porque
  trocar o token de um número verificado sem nova prova o devolveria a um estado sem prova);
  pendente de outra organização responde 409 no prazo; **vencida, só é tomada por quem provar a
  posse no próprio pedido** — a reivindicação antiga continua até alguém provar. Assim quem só
  reivindica sem token válido bloqueia o número por no máximo 24 h, uma vez.
- **Concorrência.** A decisão roda com a linha do número travada (`SELECT … FOR UPDATE`); duas
  criações simultâneas do mesmo número esbarram no `UNIQUE (phone_number_id)`, e a segunda
  responde 409. Na tomada, a prova (chamada externa) fica fora da transação, e a confirmação trava
  a linha de novo e confere que é a mesma reivindicação, ainda vencida: um único vencedor
  (`whatsapp-claim-concurrency.pg.test.ts`). A tomada apaga a linha antiga e grava uma nova (id
  novo): a organização que perdeu recebe 404 no id antigo.
- **Verificação.** `POST /whatsapp/connections/:id/verify` (`org:manage`, 404 fora da
  organização) decifra o token e chama o `WhatsAppNumberVerifier`: em `live`,
  `MetaWhatsAppNumberVerifier` reusa `MetaWhatsAppAdapter.testConnection()`
  (`GET /<PHONE_NUMBER_ID>`) com o token da conexão — nunca com `WHATSAPP_ACCESS_TOKEN`; em `dry_run`,
  `FakeWhatsAppNumberVerifier` (sem rede) aceita `fake-wa-owner:<phoneNumberId>` e falha com
  qualquer outro como a Graph API (400, código 100). Sem modo, não há verificador e a rota responde
  502 "WhatsApp não configurado". Erro não transitório ou número diferente do pedido → 409 "Não foi
  possível comprovar a posse"; erro transitório (429/5xx, timeout, rede) → 502. A gravação de
  `VERIFIED` é compare-and-set (continua `PENDING`, da organização e com o mesmo token conferido).
  Verificar um número já verificado devolve a conexão sem chamar a Meta.
- **Auditoria** (`entity_type = WHATSAPP_CONNECTION`): `whatsapp.connection_claimed` (com
  `renewed` e `takeover`), `whatsapp.connection_claim_refused` (na organização que tentou, com o
  motivo e sem dado da dona), `whatsapp.connection_claim_expired` (na organização que perdeu a
  reivindicação vencida, sem dizer quem tomou), `whatsapp.connection_verified` e
  `whatsapp.connection_verification_failed` (motivo, status e código da Meta; sem token).
- **Tela** (`/app/admin/integrations`): "Conectar número" (ID do número, ID da conta opcional e
  token em campo de senha), situação "Aguardando verificação" com o prazo ou o aviso de vencida,
  "Verificar posse", "Trocar token" e, verificada, o número exibido pela Meta e "Recebe mensagens
  desde". As regras ficam em `apps/web/src/lib/whatsapp-connection-rules.ts`, comparadas com o
  domínio e com o contrato da API no teste. `GET /whatsapp/connections` informa o verificador
  (`FAKE`, `META` ou null) para a tela mostrar a dica do token FAKE só em ambiente de teste.

Consequências: a homologação (META_MODE=dry_run) verifica com o token FAKE, sem chamada real. As
conexões existentes param de receber mensagens até a organização informar o token e verificar —
aviso necessário no deploy da 0021. O envio continua pela credencial da plataforma
(`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`); enviar pelo token de cada conexão, remover e
desativar conexão pela tela e revalidar o token periodicamente ficam fora desta trilha (ver
"Pendências").

## ADR-089 — Uma concessão ativa do portal garantida pelo banco (pendência do ADR-061) (Gate G3, trilha E2, 2026-09-22)

Status: Aceito com o merge do PR #20 (`bef9660`) e implantado na homologação.

Contexto: `portal_access_org_party_kind_active_unique` incluía `revoked_at`, e o PostgreSQL trata
nulos como distintos: o banco aceitava duas concessões ativas da mesma pessoa e tipo. A garantia
era só a trava da rota (`SELECT … FOR UPDATE` na pessoa, ADR-061).

Decisões:

- O índice passa a ser parcial: `UNIQUE (org_id, party_id, kind) WHERE revoked_at IS NULL`. Mesmo
  nome, para as consultas e a documentação que o citam.
- Pré-voo na 0021, no padrão das 0013/0014: se já houver duplicata ativa, a migração para com a
  lista (organização, pessoa, tipo e quantidade) e a dica de revogar a sobra, sem aplicar nada (o
  runner aplica as migrations pendentes numa transação só). A limpeza não é automática: escolher
  qual link continua valendo é decisão da imobiliária.
- A trava da rota continua: ela reaproveita a concessão ativa (troca o token) em vez de gravar
  outra, e o índice é a segunda linha de defesa para qualquer caminho futuro que esqueça a trava.

Consequências: provado em PostgreSQL real (`g3-e2-migration-0021.pg.test.ts`): pré-voo aborta com a
duplicata e conclui depois da revogação; segunda ativa recusada com 23505; duas transações
simultâneas sem a trava da rota confirmam uma só; pedidos simultâneos pela rota deixam uma ativa
por tipo.

## ADR-090 — CHECK nas colunas de domínio fechado, preso ao domínio (P2-12, DB-4) (Gate G3, trilha G, 2026-09-22)

Status: Aceito com o merge do PR #22 (`761f2a3`) e implantado na homologação.

Contexto: o banco tinha 35 CHECKs, 13 deles de vocabulário; as outras colunas `text` de status,
tipo e papel aceitavam qualquer texto. A validação existia só nas rotas e nas máquinas de estado do
domínio: uma rota nova, um job ou um script que gravasse `'TERMINATED'` numa locação, `'CASH'` num
pagamento ou `'CONTACTED'` num lead gravava sem erro, e a leitura seguinte quebrava no contrato da
API ou caía num `switch` sem caso.

Decisões:

- **Um CHECK por coluna, com nome fixo** `<tabela>_<coluna>_valid` e a forma
  `coluna in (...)` (coluna anulável: `coluna is null or coluna in (...)`). O helper
  `domainCheck` (`packages/db/src/schema/checks.ts`) monta a expressão; a lista fica escrita no
  schema do drizzle, ao lado da coluna, e o `db:generate` gera o SQL.
- **A lista é a do domínio.** Fonte, nesta ordem: a constante de `packages/domain` (máquinas de
  estado: `LEASE_STATUSES`, `CHARGE_STATUSES`, `PAYMENT_STATUSES`, `CONTRACT_STATUSES`,
  `INSPECTION_STATUSES`, `FUNNEL_STATUSES`, `LISTING_STATUSES`, canais, conversa, candidatura...);
  sem constante no domínio, o enum do contrato da API em `packages/contracts`. O `@aluguei/db` não
  passa a depender do domínio: quem prende as três cópias é o teste
  `tests/integration/src/g3-g-schema-domain.test.ts`, que lê cada CHECK no banco migrado
  (`pg_get_constraintdef`) e compara com a constante. Mudou o domínio sem migration (ou o
  contrário), o teste falha. O mesmo teste recusa um CHECK `_valid` novo que não esteja mapeado.
- **Só entra coluna cujo vocabulário o domínio ou o contrato já fecham.** Colunas cujo valor vem
  de fora (nome do provider, status devolvido pela Meta), cujo contrato é `z.string()` ou cujo
  vocabulário vive só no código da API ficam sem CHECK e listadas no README com o motivo — pôr um
  CHECK sem fonte única criaria uma quarta cópia sem teste. O domínio ganhou uma constante,
  `SPLIT_ALLOCATION_ROLES` (`LANDLORD`, `AGENCY`), que antes era só um tipo.
- **Pré-voo no padrão das 0013/0014/0021.** Antes de qualquer `ALTER`, um bloco `DO` percorre a
  lista de cada CHECK novo e, se houver linha fora do domínio, aborta com
  `Migracao 0022 abortada: dados fora do dominio fechado -- tabela.coluna <id> = <valor>; ...`
  (até 20 por coluna, com a contagem do resto). Nada é aplicado: o runner aplica as pendentes
  numa transação só. A correção dos dados não é automática — o valor certo de uma linha antiga é
  decisão de quem opera. Um teste confere que o pré-voo e os `ADD CONSTRAINT` da 0022 têm as mesmas
  colunas e as mesmas listas.

Consequências: 52 CHECKs novos (65 de vocabulário ao todo). Provado em PostgreSQL real
(`g3-g-migration-0022.pg.test.ts`): o pré-voo nomeia cada linha inválida e não aplica nada;
corrigidos os dados, a 0022 conclui; valores fora do domínio passam a dar `23514` em lead, tarefa,
imóvel, papel da pessoa, portal, locação, cobrança e pagamento. A suíte de integração inteira
(342 testes) e o Playwright passam sem mudar nenhum dado de teste: nenhum caminho do código grava
valor fora do vocabulário. Acrescentar um status passa a exigir migration — de propósito.

## ADR-091 — `bigint` nos totais que somam muitas linhas (P2-12, DB-5) (Gate G3, trilha G, 2026-09-22)

Status: Aceito com o merge do PR #22 (`761f2a3`) e implantado na homologação.

Contexto: todas as 34 colunas `*_cents` eram `int4` (teto de R$ 21.474.836,47). Por linha isso
basta (uma cobrança, um repasse, um orçamento). Mas `reconciliations.local_total_cents` recebe a
soma de **todas** as cobranças pagas da organização e `provider_total_cents` a soma do provider:
com o histórico acumulado, o total passa desse teto (por exemplo, 1.000 locações de R$ 2.000 em 11
meses), e daí em diante o job de conciliação terminava em erro (`integer out of range`) a cada
execução, sem gravar a conciliação.

Decisões:

- Só as duas colunas de total viram `bigint`, no schema com `bigint(..., { mode: 'number' })`: o
  drizzle devolve `number` (o driver entrega o `int8` como texto e o drizzle converte), exato até
  2^53 − 1 centavos; o contrato da API (`z.number().int()`) e quem lê não mudam. Alargar o tipo
  não perde valor e não precisa de pré-voo.
- As demais colunas `*_cents` continuam `int4`: cada uma guarda um valor de uma linha (cobrança,
  pagamento, repasse, lançamento, orçamento ou teto de orçamento), e nenhuma é soma. Saldos do
  ledger, totais do painel e do portal são calculados na consulta (`sum` do PostgreSQL devolve
  `bigint`, lido com `mapWith(Number)`) ou em JavaScript, sem coluna que estoure. Converter tudo às
  cegas mudaria o tipo lido pelo código em outras 32 colunas sem ganho.

Consequências: provado em PostgreSQL real: duas cobranças pagas de R$ 15 milhões (cada uma cabe em
`int4`) fazem a conciliação gravar e ler `3.000.000.000` centavos como número; um total de
`Number.MAX_SAFE_INTEGER` volta exato pelo drizzle. Antes da correção, o mesmo teste falhava com
`value "3000000000" is out of range for type integer`.

## ADR-092 — O schema do drizzle é a fonte de índices e CHECKs (P2-12, DB-6) (Gate G3, trilha G, 2026-09-22)

Status: Aceito com o merge do PR #22 (`761f2a3`) e implantado na homologação.

Contexto: `party_consents_active_unique` (um consentimento ativo por pessoa e finalidade,
`WHERE revoked_at IS NULL`) foi criado à mão na 0007 e nunca entrou em `crm.ts`: o gate de drift
(`db:generate` sem diferença) não o via, e um `db:generate` futuro podia gerar migration que o
ignorasse.

Decisões:

- O índice passa a ser declarado em `crm.ts` (`uniqueIndex(...).where(revoked_at is null)`). A
  0022 faz `DROP INDEX IF EXISTS` e recria pelo schema (a grafia da 0007 era outra); o pré-voo
  também recusa consentimento ativo duplicado, caso algum ambiente não tivesse o índice.
- Um teste permanente compara o banco migrado com o schema: o conjunto de índices e UNIQUE do
  `pg_indexes` tem de ser igual ao declarado (`getTableConfig`: índices, UNIQUE de tabela e de
  coluna, chaves primárias), e o conjunto de CHECKs do `pg_constraint` igual ao dos `check()` do
  schema. Índice ou CHECK escrito só no SQL faz o teste falhar.
- Fica fora do schema, por limite do drizzle, o que ele não modela: as funções e gatilhos de
  imutabilidade do contrato da 0014 (`contracts_guard_immutable`, `contract_versions_guard_immutable`)
  e o enum `role`, que já é declarado (`pgEnum`). Os gatilhos continuam cobertos pelos testes da
  trilha A do G2.

Consequências: com a 0022, o inventário encontrou um único objeto fora do schema (o índice acima);
depois dela, `db:generate` não gera nada e o teste de paridade passa.

## ADR-093 — Vocabulário da timeline e da conciliação igual ao que a API e o worker gravam (pendências da trilha G, 2026-09-22)

Status: Aceito.

Contexto: o inventário da trilha G (ADR-090) deixou sem CHECK duas colunas em que o contrato não
descrevia o que o código grava, e achou um filtro com o vocabulário errado:

- `timeline_events.entity_type`: o contrato (`timelineEntityTypeSchema`) listava só LEAD, PARTY,
  PROPOSAL, VISIT e TASK, mas a devolução da conversa e o gateway do WhatsApp gravam
  `CONVERSATION`, a troca de status do anúncio grava `LISTING` e a decisão do screening
  (`apps/worker/src/screeningJobs.ts`) grava `RENTAL_APPLICATION` — este último fora do inventário
  da G. A timeline dessas entidades respondia 400 na leitura.
- `GET /reconciliations?status=`: aceitava `PENDING | RUNNING | COMPLETED | FAILED`, mas a coluna
  guarda `PENDING | MATCHED | DISCREPANCY`. As opções do filtro da tela são as da coluna, então
  "Conciliado" e "Divergência" respondiam 400, e `RUNNING` devolvia lista vazia.
- `reconciliations.provider`: o job grava o nome do provider de pagamento (FAKE ou ASAAS) ou `NONE`
  quando roda sem provider; o contrato descrevia o campo como `z.string()`.

O histórico do código (`git log -p`) confirma que nenhuma versão gravou outro valor nessas duas
colunas.

Decisões:

- **Timeline:**
  - `timelineEntityTypeSchema` passa a ser o vocabulário fechado do que a timeline registra: LEAD,
    PARTY, PROPOSAL, VISIT, TASK, CONVERSATION, LISTING e RENTAL_APPLICATION. Vale para o DTO do
    evento e para a leitura (`GET /timeline`).
  - A criação manual (`POST /timeline`) continua só nas entidades do CRM, pelo subconjunto
    `timelineManualEntityTypeSchema`. Os eventos de conversa, anúncio e candidatura vêm das
    próprias transições.
  - O mapa de tabelas da conferência de dono é tipado contra esse subconjunto, então uma entidade
    nova no lançamento manual não compila sem a tabela.
- **Conciliação:**
  - `reconciliationStatusSchema` (`PENDING | MATCHED | DISCREPANCY`) é o mesmo no DTO e no filtro.
    Status que a coluna não guarda são recusados (400), não viram lista vazia.
  - `NONE` faz parte do vocabulário do provider (`reconciliationProviderSchema`: `FAKE | ASAAS |
NONE`). É um fato da rodada ("conciliada sem provider de pagamento"), não ausência de dado: o
    total do provider fica 0 e a linha diverge sempre que houver cobrança paga.
  - A tela mostra "Sem provedor".
- **Banco:**
  - Migration 0023 com `timeline_events_entity_type_valid` e `reconciliations_provider_valid`,
    pelo `domainCheck`.
  - Pré-voo como o da 0022: aborta sem aplicar nada e lista `tabela.coluna <id> = <valor>`.
  - As duas listas entram no teste que prende os CHECKs ao contrato
    (`g3-g-schema-domain.test.ts`).
- **Tela:** um teste do web prende as opções do filtro e as labels do provider ao contrato.

Consequências:

- **Entidade nova na timeline:** gravar evento de outra entidade exige mudar o contrato, o CHECK
  (nova migration) e o teste.
- **Conciliação sem provider:** continua registrada como divergência com total do provider 0. Se
  isso confundir a operação, a mudança é de comportamento do job, não de vocabulário.
- **Evidência:** `docs/audits/2026-09-10/evidence/g3/vocabulario/`.

## ADR-094 — Teto de R$ 1.000.000,00 por valor em centavos na API, no domínio e no painel (pendência da trilha G, 2026-09-22)

Status: Aceito; o valor do teto é revisável (uma constante em cada camada, presas por teste).

Contexto: as colunas `*_cents` por linha são `integer` (int4, até R$ 21.474.836,47), e o contrato da
API só exigia inteiro não negativo. Acima do int4, o INSERT estourava e a API respondia 500 (termos
do imóvel, lead, proposta, cobrança avulsa, renovação, reajuste). Abaixo dele entravam valores sem
sentido para aluguel, e a cobrança — soma de aluguel, condomínio e impostos com multa e juros —
podia estourar depois, no job do scheduler ou no pagamento. Duas entradas não digitadas tinham o
mesmo problema:

- **Reajuste por índice:** calculava um aluguel sem limite.
- **Orçamento de mensagem do WhatsApp:** "até R$ 50.000.000" virava 5 bilhões de centavos, pelas
  regras e pela IA, e estourava o INSERT da intenção, derrubando o job da mensagem.

O campo de dinheiro do painel tinha teto no int4.

Decisões:

- **Teto único:** R$ 1.000.000,00 (100.000.000 centavos) por valor que a API recebe.
  - Com aluguel, condomínio e impostos no teto, a cobrança somada com multa de até 10% e juros de
    1% ao mês fica abaixo do int4 por mais de duas décadas de atraso.
  - Constantes: `MAX_AMOUNT_CENTS` em `packages/domain` e em `packages/contracts`, e
    `MONEY_INPUT_MAX_CENTS` no campo de dinheiro do painel. Os testes prendem as três ao mesmo
    número.
- **Contrato:** `amountCentsSchema` e `positiveAmountCentsSchema` em todos os campos de dinheiro das
  requisições: termos do imóvel, orçamento do lead, proposta, cobrança avulsa, renovação, reajuste,
  orçamentos da Meta (API e meta-mcp). Acima do teto, 400 com "O valor máximo é R$ 1.000.000,00".
- **Webhook de pagamento:** o valor vem do provider, não é digitado, e fica limitado ao int4
  (`INT4_MAX`), que é o que a coluna aceita.
- **Domínio:**
  - `assertAmountWithinCeiling` no reajuste por índice (400 acima do teto).
  - O orçamento acima do teto numa mensagem vira "sem orçamento", e a intenção continua.
  - Na IA, o mesmo valor deixa a resposta fora do schema, e o gateway usa as regras.
- **Painel:** o campo de dinheiro recusa acima do mesmo teto, no próprio campo, antes do envio.

Consequências:

- **Aluguel acima de R$ 1 milhão:** exige subir o teto nas três constantes e rever a folga da soma
  da cobrança (ou passar as colunas da cobrança para `bigint`).
- **Valores gravados antes:** nenhum dado é alterado; linhas acima do teto continuam lidas. Só novas
  entradas são recusadas.
- **Evidência:** `docs/audits/2026-09-10/evidence/g3/teto-centavos/`.

## ADR-095 — Módulos por plano com 403 PLAN_MODULE_NOT_INCLUDED (Onda 1A do AchouImóvel, 2026-09-23)

Status: Aceito.

Contexto: a entrega de design do AchouImóvel (`design-source/achouimovel/`) exige menu com cadeado
nos módulos fora do plano e uma tela "Fora do seu plano". O sistema só tinha limites de uso
(`maxUsers`, `maxProperties`, `maxPublishedListings`) e gating de interface por papel (RBAC). Plano
não dizia o que a imobiliária pode abrir, e o painel não tinha como saber.

Decisão:

- **Vocabulário fechado** `PLAN_MODULES` no domínio: CRM, ATENDIMENTO, LOCACAO, FINANCEIRO, VENDAS,
  MARKETING. O banco repete a lista no CHECK `plans_modules_valid`, e o teste da trilha G compara as
  duas (`tests/integration/src/g3-g-schema-domain.test.ts`).
- **Base de todo plano, sem módulo:** imóveis, anúncios e canais, leads, contatos, tarefas,
  relatórios, configurações e administração da própria imobiliária — é o que o plano Anunciante
  compra.
- **Um gate por grupo de rotas**, não por rota: cada arquivo de rota é plugin comum (sem
  `fastify-plugin`), então `registerBehindModule` em `apps/api/src/app.ts` registra o grupo num
  escopo com o hook do módulo. O `requirePermission` de cada rota continua igual — RBAC e plano são
  perguntas diferentes.
- **Resposta:** 403 com `details.reason = PLAN_MODULE_NOT_INCLUDED` e `details.module`, no mesmo
  formato de `ORG_NOT_ACTIVE` (ADR-060). É o `reason` que faz o painel abrir a tela de upgrade em
  vez do erro genérico.
- **Sessão:** `request.auth.planModules` vem do join com `plans` no plugin de sessão, normalizado
  pelo domínio — código desconhecido no banco não vira módulo.

Consequências:

- Trocar o plano da imobiliária vale na requisição seguinte (a sessão lê o plano a cada pedido).
- Migration 0024 dá a todos os planos que já existiam os cinco módulos de hoje: **ninguém perde
  acesso ao que já usava**. VENDAS fica só no ILIMITADO, porque o módulo ainda não existe no produto
  — é o que dá um estado bloqueado real para a interface da Onda 1B.
- Módulo novo no futuro exige: constante do domínio, CHECK do banco (migration), e decisão explícita
  de em quais planos ele entra.

## ADR-096 — Locações em vigor viram limite de plano; preço mensal é só exibição (Onda 1A, 2026-09-23)

Status: Aceito; os números de cada plano são pendência do dono.

Contexto: o HANDOFF pede o diálogo "100 de 100 contratos" ao ativar uma locação e a página pública
de planos com preço. Os planos não tinham nem o limite nem o preço, e o admin da plataforma foi
desenhado sem cobrança (ADR-060).

Decisão:

- `plans.max_active_leases` (nulo = ilimitado) e o recurso `activeLeases` contam as locações em
  `ACTIVE`, `DELINQUENT` ou `TERMINATING` (`BILLABLE_LEASE_STATUSES`): encerrar libera a vaga.
- A checagem entra na transação que cria a locação, com a trava da linha da imobiliária que já
  serializa os outros limites (`assertPlanAllowsOneMore`), e recusa com 409 `PLAN_LIMIT_REACHED`
  antes de qualquer escrita.
- `plans.monthly_price_cents` é **só exibição**: nulo vira "Fale com a gente". Nada aqui cobra, e o
  teto por valor em centavos é o mesmo do resto do sistema (ADR-094).

Consequências: os planos semeados ficam com limite nulo e preço nulo — nenhum comportamento muda até
o dono definir os números. A tela "Plano e uso" (Onda 4) lê esses mesmos campos.

## ADR-097 — Decisões de rumo do frontend do AchouImóvel (Onda 0, 2026-09-23)

Status: Aceito, por delegação explícita do usuário ("siga, você decide o que for melhor").

Contexto: o diagnóstico da Onda 0 (`docs/frontend/ACHOUIMOVEL_PLAN.md`) deixou quatro pontos em
aberto que mudam o rumo da execução.

Decisão:

1. **Portais parceiros (R1).** A interface mostra o estado real vindo da API: "Conectado" só com
   adapter e evidência de sandbox; sem adapter, "Em preparação". Hoje Canal Pro, OLX e Imovelweb
   estão registrados sem adapter, então nenhum deles aparece como integrado. Escrever "Integrado"
   sem evidência contraria `AGENTS.md`, e o material de marketing segue a mesma regra.
2. **`PROMPT_apps-portal.md` (pendência 1).** O arquivo não existe no repositório. Em vez de
   esperar, a Onda 2 escreve `docs/frontend/PORTAL_SPEC.md` a partir do que já é regra escrita: as
   telas de referência, os limiares do prompt orquestrado (≥5 para estatística, ≥3 para indexar) e
   os padrões de cache e SEO do repositório. Nada de número ou limiar inventado; o que faltar vira
   pendência no documento.
3. **Vendas (R6).** Deixa de ser "Onda 5" e vira fase própria depois da Onda 4, com ADRs e
   migrations próprios: são tabelas, domínio, rotas e regras de comissão do zero.
4. **Rotas legadas do site (R7).** `/`, `/imoveis` e `/imoveis/[slug]` em `apps/web` passam a
   redirecionar (301) para o portal quando a Onda 2B subir, no mesmo PR que atualiza
   `tests/e2e/src/g2-b2-crawler.spec.ts`. Nenhum teste é removido.

Consequências: a ordem das ondas muda (Vendas sai do caminho crítico) e o portal ganha uma
especificação escrita no repositório em vez de um arquivo ausente.

## ADR-098 — Marca num lugar só, tokens neutros e portal como app separado (Onda 1B, 2026-09-23)

Status: Aceito.

Contexto: o produto virou AchouImóvel. "Aluguei.app" estava escrito à mão em ~60 arquivos de
`apps/web` (título de página, sidebar, mensagens de conta), e os tokens da gestão carregavam o nome
antigo (`--aluguei-brand*`). O portal, por sua vez, tem outra fonte (Guton), outra paleta e outro
público.

Decisão:

- **`BRAND` em `apps/web/src/lib/brand.ts`**: `name` ("AchouImóvel", consumidor final) e `b2bName`
  ("AchouImóvel Gestão", lado pago). O `<title>` sai de template de layout — raiz com
  `%s | AchouImóvel`, `/app` e `/plataforma` com `%s | AchouImóvel Gestão` — e cada página declara
  só o próprio nome. Um teste varre `apps/web/src` e falha se o nome antigo voltar escrito à mão.
- **Tokens neutros**: `--aluguei-brand*` → `--brand*`, com os valores intactos (o verde `#41945D`
  continua o mesmo) e **alias temporário** `--aluguei-brand*: var(--brand*)` no claro e no escuro,
  para não quebrar nada que ainda use os nomes antigos. O alias sai quando não houver mais uso.
- **`apps/portal` não depende de `packages/ui`**: os componentes do portal vivem no próprio app.
  O design system da gestão é denso, com `--peg-*` e Inter; o portal é branco, com Guton e uma cor
  de acento. Misturar os dois colocaria dois conjuntos de tokens no mesmo escopo (R2 do plano).
  Os nomes não colidem hoje (`--brand` na gestão, `--brand-accent` no portal), e as telas de conta
  que a Onda 3B leva para `apps/web` com o visual do portal vão carregar os tokens sob um escopo
  próprio.
- **Cadeado na navegação**: cada item do menu declara o módulo que o abre; sem o módulo no plano da
  sessão (`/auth/me`), o item vira cadeado e leva para `/app/plano`, a tela "Fora do seu plano".
  Item de tela ainda não construída (Vendas) usa o mesmo caminho com o texto "em preparação" — nunca
  um 404.

Consequências: trocar o nome do produto de novo é mexer em um arquivo; o alias de tokens é dívida
declarada, com prazo até a próxima onda que tocar a gestão; e o portal pode divergir do design
system da gestão sem risco de contaminar o painel que já está no ar.

## ADR-099 — URL, indexação e ciclo de vida das páginas do portal (SEO, 2026-09-23)

Status: Aceito. Detalhamento em `docs/frontend/PORTAL_SEO.md`.

Contexto: o portal é um caso de SEO programático — cidade × bairro × tipo × quartos gera dezenas de
milhares de endereços a partir do mesmo template. Publicar tudo dá index bloat e esbarra na política
de conteúdo em escala do Google; publicar de menos joga fora a cauda longa de bairro, que é onde está
a intenção de quem procura imóvel. Some-se a isso que o texto do anúncio costuma ser o mesmo
publicado no ZAP, no OLX e no Imovelweb: no anúncio individual somos conteúdo não original.

Decisão:

- **Caminho indexa, query string não.** `/{alugar|comprar}/[cidade-uf]/[bairro]/[tipo]/[n]-quartos`,
  nessa ordem, com o único salto cidade → tipo. Ordenação, faixa de preço e paginação vivem em query
  string, sempre `noindex, follow` e canônica para a URL sem query.
- **Indexação calculada, não fixa**: ≥3 anúncios para indexar e entrar no sitemap, ≥5 para mostrar
  estatística, ≥5 para indexar recorte com modificador. Abaixo disso a página continua viva e
  navegável, mas com `noindex, follow`. São os mesmos limiares que o `AGENTS.md` já exige para não
  publicar estatística sem amostra.
- **O que diferencia cada página é dado, não texto**: lista real, mediana e faixa do recorte, mediana
  por quartos, bairros vizinhos com contagem e FAQ calculado. Nada de parágrafo gerado em escala.
- **Slug do anúncio é único no país** (hoje é `UNIQUE (org_id, slug)`), com histórico para 301.
- **Fim de vida da URL**: anúncio pausado, arquivado, alugado ou vendido responde **410** com imóveis
  parecidos e sai do sitemap na hora; slug trocado responde 301.
- **Título estável, sem contagem** (a contagem fica no H1); canônica própria em toda página.
- **Lançamento por cidade, em lotes de 50 a 100 páginas**, com revisão humana de uma amostra e duas a
  quatro semanas entre lotes.
- **Foto pública por URL estável** que não expõe `storage_key`: `GET /public/media/:mediaId` responde
  302 para uma URL assinada de vida curta, e o endereço que fica no HTML em cache nunca muda. Isso
  resolve o R3 do plano sem CDN nova nem URL que vence dentro da página.

Consequências: a Onda 2A ganha requisitos concretos (slug global, contagem do recorte, `page_stats`,
vizinhos, fonte do sitemap, status de remoção legível no público, URL de foto), e a Onda 2B já nasce
com a régua de quando uma página pode ser indexada.

## ADR-100 — Domínio próprio achouimovel.online e endereço público como configuração de execução (2026-09-24)

Status: Aceito.

Contexto: até aqui a homologação vivia em endereços `sslip.io`, que derivam do IP do servidor. Isso
serve para testar, mas não para SEO: o domínio é do provedor, muda se o IP mudar, e os servidores do
Let's Encrypt limitam emissão para esse domínio compartilhado. O portal é o produto de busca — sem
domínio próprio ele não tem como acumular autoridade.

Decisão:

- **Zona no Cloudflare, registro na Hostinger.** `achouimovel.online` continua registrado na
  Hostinger; os nameservers apontam para o Cloudflare (`meera`/`rick.ns.cloudflare.com`), que passa a
  ser o DNS autoritativo.
- **Registros em Somente DNS, proxy desligado.** `@`, `api`, `app`, `s3` e `www` respondem direto no
  servidor. O proxy do Cloudflare quebraria o desafio HTTP-01 do Let's Encrypt que o Traefik do
  Coolify usa para emitir certificado. Ligar o proxy exige antes trocar o desafio ou subir certificado
  de origem — decisão futura, não pré-requisito.
- **Um subdomínio por superfície**: portal em `achouimovel.online` (e `www`), painel em
  `app.`, API em `api.`, objetos em `s3.`. Superfície pública e painel em hosts separados mantêm
  cookie e CORS do painel fora do domínio que o buscador rastreia.
- **Os endereços `sslip.io` continuam no ar**, somados e não substituídos. São a porta de serviço
  quando o DNS ou o certificado do domínio próprio falha — foi por não ter essa porta que a queda de
  2026-09-24 ficou difícil de diagnosticar.
- **O endereço público entra no build e na execução.** ~~Endereço público é configuração de
  execução, nunca de build.~~ **Corrigido em 2026-09-24 (ver ADR-101).** A primeira versão desta
  decisão tornava dinâmicas as rotas que escrevem URL absoluta, o que contraria o critério de
  aceite do prompt orquestrado ("nenhuma página pública com `force-dynamic`"). A divisão correta
  segue o que cada coisa é: **página pública** é gerada no build e recebe o endereço pelo
  `ARG PORTAL_BASE_URL` do Dockerfile; **rota** (`robots.txt`, `sitemap.xml`) renderiza por
  requisição e lê a variável de ambiente, porque o conteúdo depende do que a API tem agora.

Consequência: trocar de domínio é mudar variável e reimplantar — com rebuild, porque o endereço
participa das páginas geradas. A CI exercita as duas metades: constrói a imagem com um endereço e
sobe o contêiner com outro, exigindo o do build na canônica e o do ambiente no `robots.txt`.

## ADR-101 — Planos na vitrine, plano pedido no cadastro e endereço no build (Onda 3, 2026-09-24)

Status: Aceito. Corrige um ponto do ADR-100.

Contexto: as telas B2B (`/para-imobiliarias`, `/anunciar`, `/gestao`, `/planos`) e o cadastro em
etapas precisavam falar de plano. Escrever preço e recurso na página seria a forma mais rápida — e a
que o `AGENTS.md` proíbe, porque vira número inventado assim que o plano muda.

Decisão:

- **A vitrine lê plano de verdade.** `GET /public/plans` devolve uma view reduzida: sem `id`, sem
  `organizationCount` e sem `isActive`; só plano ativo, ordenado pelo preço publicado com os sem
  preço no fim. Cada campo exposto numa rota pública é uma decisão, não um `select *`.
- **A tabela é derivada, não escrita.** As colunas vêm da API e o "Incluído / —" de cada célula sai
  dos módulos do plano (`PLAN_MODULES`, ADR-095). Criar um plano novo no painel já preenche a tabela
  certa, sem ninguém editar o portal.
- **Preço nulo é "Fale com a gente", nunca zero.** A tela precisa distinguir "sem preço publicado" de
  "de graça"; e lista vazia é estado de tela, porque a página não pode afirmar que a empresa não tem
  plano só porque a API não respondeu.
- **Pedir não é contratar.** O cadastro guarda `requested_plan_code` (o código, não o id — é ele que
  viaja no `?plano=` público, e plano apagado não apaga o pedido). O plano vigente continua sendo
  decidido pelo admin na aprovação (ADR-060). Código que a API não conhece não é pré-selecionado: a
  etapa pergunta de novo em vez de a tela afirmar um plano que não existe.
- **Endereço público: build para página, ambiente para rota** — corrige o bullet correspondente do
  ADR-100. Página pública volta a ser gerada no build, recebendo `PORTAL_BASE_URL`, `APP_BASE_URL` e
  `API_BASE_URL` por `ARG` do Dockerfile; `robots.txt` e `sitemap.xml` continuam por requisição.
  As três variáveis entram no `env` da tarefa de build do Turbo: no **modo estrito do Turbo 2**,
  variável que a tarefa não declara não chega nela — foi por isso que o defeito não apareceu no teste
  local (`pnpm --filter … build` executa `next build` direto e herda o shell) e apareceu na imagem.

Consequência: o portal não tem número de plano no código, e o painel sabe o que cada imobiliária
pediu antes mesmo de existir cobrança. Trocar o domínio passa a exigir rebuild, o que a CI cobre.
