# Agent E1 — Threat Review Prático (Estático) — ALUGUEI.APP

Data: 2026-09-10. Fonte de verdade: código atual. Worktree:
`C:\Users\pablo\Documents\OpenCode\Aluguei-app\.claude\worktrees\aluguei-technical-audit-6cea11`

Legenda: **CONFIRMADO** = provado por leitura de código. **SUSPEITA** = requer prova HTTP do orquestrador.
Severidade: P0 (cross-tenant/auth-bypass/dinheiro/PII grave/operação externa involuntária), P1, P2, P3.

---

## Sumário executivo

O código é maduro em segurança: sessão opaca hasheada, argon2id, RBAC estático aplicado em quase todas as rotas de escrita, escopo `orgId` em praticamente toda query, webhooks com HMAC/token + dedup, tokens de segredo criptografados AES-256-GCM, redação de logs. Os controles descritos em `docs/THREAT_MODEL.md` correspondem em geral ao código.

Os achados relevantes concentram-se em:

1. **Webhook de pagamento sem enforce de segredo em produção** (assimetria vs. outros webhooks) — potencial crédito forjado com provider FAKE/default (P1, requer prova).
2. **IDOR-por-referência na criação** de vários recursos (leads, visits, proposals, tasks, rental-applications, inspections) — FKs para partyId/propertyId/leadId não validam pertencimento à org (P2).
3. Rate-limit de endpoints não autenticados colapsado num único bucket atrás do proxy Next (XFF não repassado) — DoS/brute-force scoping fraco (P3, documentado).
4. Higiene: MIME real nunca validado no confirm de upload; escalonamento admin→owner (mesmo conjunto de permissões); artefato `achouimovel-ai.zip` versionado contendo repositório `.git` de terceiro.

Nenhum vazamento cross-tenant de LEITURA foi encontrado por leitura de código (todas as queries de leitura filtram `orgId` / associação de portal).

---

## 1. Sessão backoffice

**CONFIRMADO — forte.**

- Token: `randomBytes(32).toString('base64url')` — 256 bits de entropia. `apps/api/src/plugins/session.ts:27-29`.
- Armazenamento: **hash SHA-256** (`token_hash` UNIQUE), nunca em claro. `session.ts:31-33`, schema `packages/db/src/schema/identity.ts:60-76`.
- Expiração: `expiresAt` verificado (`gt(userSessions.expiresAt, now)`), `revokedAt` nulo exigido. `session.ts:73-86`. TTL default 30 dias (`SESSION_TTL_SECONDS=2_592_000`, `packages/config/src/env.ts:15`).
- Revogação no logout: `update ... set revokedAt` filtrando por `userId + activeOrgId`. `apps/api/src/routes/auth.ts:191-212`.
- **Não há renovação/rotação** de token de sessão (sem sliding expiration) — aceitável; sem invalidação em troca de senha porque **não existe endpoint de troca de senha** (ver §2).
- Cookie: `httpOnly:true, sameSite:'lax', secure`, `path:'/'`, `maxAge`. `session.ts:35-49`. `secure` = true em produção ou `COOKIE_SECURE=true` (`apps/api/src/app.ts:110-113`). Sem `domain` (host-only, correto). Nome `aluguei_session`.
- Leitura: aceita **cookie OU `Authorization: Bearer`** (mobile). `session.ts:60-67`. O Bearer usa o MESMO token opaco (não é JWT) — hash e lookup idênticos, ok.
- Validação de sessão revalida usuário `status==='ACTIVE'` e membership ativa na `activeOrgId` a cada request — bom (revogação de membership derruba sessão). `session.ts:88-104`.

Observação (P3): não há binding de sessão a IP/UA (armazenados mas não conferidos) — aceitável.

## 2. Senhas

**CONFIRMADO.**

- Algoritmo: **argon2id** via `@node-rs/argon2`, `memoryCost:19456, timeCost:2, parallelism:1` (OWASP 2024/2026). `packages/domain/src/auth/password.ts:1-13`.
- Política mínima: `password: z.string().min(8).max(128)` no registro. `packages/contracts/src/auth.ts:26`. Login só exige `min(1)`. Sem requisito de complexidade (aceitável).
- Anti-enumeração login: dummy hash pré-computado (`DUMMY_PASSWORD_HASH`) verificado quando o e-mail não existe → tempo uniforme; erro genérico `UNAUTHORIZED "Credenciais inválidas"`. `apps/api/src/routes/auth.ts:38-39,131-137`.
- Anti-enumeração registro: **PARCIAL** — retorna `CONFLICT "E-mail ou organização já cadastrados"` em violação de UNIQUE (`auth.ts:96-100`). A mensagem é ambígua (e-mail OU org), mas ainda revela que o par existe. P3.
- Rate limit login/registro: `max:10, timeWindow:'1 minute'` por rota. `auth.ts:47,126`. **Não há lockout por conta** nem contador de tentativas persistido — apenas o rate limit por chave (IP/user). Ver §14 para o problema de chave atrás do proxy. P3.
- **Não existe endpoint de troca/reset de senha** no código (grep `password` em rotas só acha login/register). Portanto "invalidar outras sessões ao trocar senha" é N/A. Registrar como gap funcional, não vulnerabilidade.

## 3. CORS / CSRF / Headers

**CONFIRMADO.**

- CORS API: `origin: config.corsOrigins, credentials:true`. `app.ts:149`. `corsOrigins` = `CORS_ORIGINS` (split) ou `[APP_BASE_URL]`. `app.ts:100-107`. Não é wildcard. Bom.
- Helmet registrado (`app.register(helmet)`, defaults). `app.ts:147`. CSP forte no Next: `apps/web/next.config.ts:3-21` (`default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`) — porém `script-src` inclui `'unsafe-inline' 'unsafe-eval'` (Next necessita) — P3.
- CSRF: cookie `SameSite=Lax` (bloqueia envio em POST cross-site) + o BFF Next valida `Origin` contra `APP_BASE_URL` em todo método ≠ GET. `apps/web/src/lib/api-server.ts:13-17`, aplicado em `apps/web/src/app/api/backend/[...path]/route.ts:37-42` e nas rotas `auth/login|logout|register`, `portal/auth/*`, `leads/[id]/status`. Boa mitigação de login-CSRF.
- **A API em si não valida Origin/CSRF token** — depende de SameSite=Lax + topologia (API só acessível via proxy). Se a API for exposta diretamente, um POST cross-site com cookie é bloqueado por SameSite=Lax (não enviado em POST cross-site) e por CORS (credenciais). Aceitável, mas frágil se a API ficar pública. P3.

## 4. RBAC

**CONFIRMADO.** Implementação: mapa estático `ROLE_PERMISSIONS` em `packages/domain/src/authz/rbac.ts:79-155`; `hasPermission` (`rbac.ts:157-159`); hook `requirePermission` (async, lança 403) em `apps/api/src/plugins/authz.ts:20-28`.

Matriz role→permissões (rbac.ts):

- `owner` e `admin` = `ALL_PERMISSIONS` (idênticos).
- `agent`: lead/party/task/visit/proposal/timeline/property/listing/conversation/inspection/screening/contract(read+write) + meta(read+write) + portal:manage. **NÃO** tem finance:_, member:_, org:manage, report:*, audit:read.
- `inspector`: leituras + task:write, visit:write, inspection:write.
- `finance`: leituras amplas + finance:read/write + report:read/export + meta:read.
- `viewer`: apenas `*:read` de CRM/property/listing/conversation.

Tabela completa de rotas × guarda no anexo A. **Todas as rotas de escrita (POST/PUT/PATCH/DELETE) de negócio têm `requirePermission`**, exceto:

- `auth/*`, `me/memberships` — sem RBAC por design (autenticação simples via `requireAuth`).
- **`organizations/:orgId/members` (GET/POST/PATCH/DELETE) — SEM `requirePermission` no hook**, mas validam via `assertOrgMemberPermission(db, orgId, userId, 'member:read'|'member:manage')` no corpo (`apps/api/src/routes/organizations.ts:21-38,52-198`). Equivalente a RBAC + escopo por org — **CONFIRMADO seguro** (checa membership NA org do path e a permissão). Não é gap.
- `webhooks/*`, `public/*`, `health/*` — públicos por design (auth por HMAC/token nos webhooks).

Escalonamento:

- **Agent NÃO se promove**: `member:manage` não está em `agent` → 403 em qualquer rota de membros. CONFIRMADO.
- **Convite pode atribuir `owner`**: `createMemberRequestSchema.role = roleSchema` aceita `owner` (`packages/contracts/src/org.ts:6-9`); `POST /organizations/:orgId/members` insere com o role dado sem restrição de valor. Só quem tem `member:manage` (owner/admin) chega lá. `organizations.ts:77-116`. P3.
- **Admin rebaixa owner?** Sim, `PATCH .../members/:userId` permite mudar role de um owner, salvo **guarda do último owner** (`countOwners <= 1` bloqueia rebaixar/remover o último). `organizations.ts:118-198`. CONFIRMADO: último owner protegido contra rebaixamento (`:134-141`) e remoção (`:182-186`).
- **Admin se auto-promove a owner**: `PATCH .../members/:userId` com `userId` = próprio id e `role:'owner'` é permitido (admin tem `member:manage`). Como admin já possui `ALL_PERMISSIONS` (idêntico a owner), o impacto é nulo em permissões; só muda o rótulo e a contagem de owners. **P3** (privilege escalation cosmética admin→owner). Evidência: sem checagem de "não elevar acima do próprio papel" em `organizations.ts:118-161`.
- Auto-remoção bloqueada: `if (auth.userId === userId) CONFLICT`. `organizations.ts:170-172`.

## 5. Multi-tenancy / IDOR

**Org ativa** vem SEMPRE da sessão (`session.activeOrgId` → `request.auth.orgId`), nunca de header/body. `session.ts:104`. Troca de org (`POST /auth/switch-org`) **valida membership** antes de setar `activeOrgId` (`auth.ts:235-249`) — cliente não escolhe org sem membership. CONFIRMADO.

**Leitura cross-tenant**: revisadas todas as rotas — cada query de leitura filtra `eq(table.orgId, auth.orgId)` (ou associação de portal). Não encontrei `eq(table.id, ...)` de leitura sem escopo de org que retorne dados de outra org. Exemplos representativos: leads (`leads.ts:137-141`), charges (`charges.ts:147-159`), contracts (`contracts.ts:63-70`), meta (`meta.ts:180-184`), portal (§6). CONFIRMADO sem IDOR de leitura.

**IDOR-por-referência NA CRIAÇÃO (P2 — SUSPEITA, requer prova):** vários POST inserem FKs vindos do body **sem verificar** que o recurso referenciado pertence à org do autor. A linha criada recebe `orgId = auth.orgId`, mas aponta para ids potencialmente de outra org:

- `POST /leads` — `partyId` e `interestedPropertyIds[]` inseridos sem checar `parties.orgId`/`properties.orgId`. `apps/api/src/routes/leads.ts:50-74`.
- `POST /visits` — `leadId/partyId/propertyId` sem validação. `apps/api/src/routes/visits.ts:38-51`.
- `POST /proposals` — `leadId/partyId/propertyId` sem validação. `apps/api/src/routes/proposals.ts:42-56`.
- `POST /tasks` — `assigneeUserId` e `relatedEntityId` (texto livre) sem validação. `apps/api/src/routes/tasks.ts:43-57`.
- `POST /rental-applications` — `partyId`, `propertyId`, `leadId`, `proposalId` inseridos sem checar pertencimento à org. `apps/api/src/routes/rental-applications.ts:135-146`. (Consequência de screening é mitigada: `screeningJobs.ts:68-79` filtra `partyIdentities` por `orgId` do job → CPF de outra org NÃO é lido; cai em `normalizeDocument(partyId)`.)
- `POST /inspections` — `propertyId` sem checar `properties.orgId`. `apps/api/src/routes/inspections.ts:154-165`.

Contraste POSITIVO (validam pertencimento): `POST /properties/:id/owners` valida `parties.orgId` (`properties.ts:497-503`); `POST /contracts` valida `applicationId.orgId` e `templateId.orgId` (`contracts.ts:157-186`); `POST /charges` valida `leases.orgId` (`charges.ts:64-71`); `POST /leases` valida `contracts.orgId` (`leases.ts:106-113`); `POST /bank-accounts` valida a parte por org + confere `holderDocument` contra CPF/CNPJ da parte (`payments.ts:173-202`).

Impacto: sem vazamento direto de leitura (a linha só guarda o id), mas permite poluir a própria org com referências a recursos de outra org (integridade / possível vazamento indireto via agregados que fazem join sem re-filtrar orgId da entidade referenciada). Requer prova HTTP para confirmar impacto real (ex.: um agregado que exponha o título do imóvel de outra org).

## 6. Portal externo

**CONFIRMADO — forte.**

- Token one-time: gerado 32B base64url; armazenado como **hash** (`oneTimeTokenHash`), com `oneTimeTokenExpiresAt` (TTL 7 dias, `portal.ts:58`). `apps/api/src/routes/portal.ts:114-119,151-158`. Schema `packages/db/src/schema/portal.ts:21-23`.
- **Consumo único**: `consume` zera o hash ANTES de criar a sessão (`portal.ts:230-234`) e exige `isNull(revokedAt)` + não expirado (`portal.ts:221-228`). Rate limit 20/min (`portal.ts:216`).
- Sessão de portal **separada** da backoffice: cookie `aluguei_portal`, tabela `portal_sessions`, plugin próprio. `apps/api/src/plugins/portal-session.ts`. Valida sessão E concessão (`portal_access.revokedAt IS NULL`) a cada request (`portal-session.ts:73-99`).
- Revogação: `POST /portal/access/:id/revoke` zera hash e revoga TODAS as sessões da concessão. `portal.ts:190-200`.
- Escopo party+kind por rota: `requirePortalKind('TENANT'|'LANDLORD')` (`plugins/authz.ts:38-47`) + escopo por associação **derivada do servidor** (nunca do client): tenant via `leases.tenantPartyId` (`portal.ts:312-317`), landlord via `property_owners.partyId` (`portal.ts:552-557`). Rotas por id revalidam pertencimento (`/portal/tenant/contracts/:id` checa `contractIds.includes(id)`, `portal.ts:428-432`; `/portal/tenant/charges/:id/payment` checa `charges.leaseId IN leaseIds`, `portal.ts:479-486`; landlord statement valida `ownedIds.includes(query.propertyId)`, `portal.ts:596-598`). CONFIRMADO sem IDOR de portal.
- PII: `content` do contrato só é devolvido quando `status==='SIGNED'` (`portal.ts:766`); vistoria no portal só CHECKIN/CHECKOUT, observações só CONFIRMED, sem mídia bruta (`portal.ts:770-819`, regra `packages/domain/src/portal/portal.ts:95-101`). Bom.

Nota: entrega do one-time token ao titular é manual (sem provedor de e-mail) — gap funcional documentado, não vulnerabilidade.

## 7. Webhooks

Arquivo: `apps/api/src/routes/webhooks.ts`. Raw body capturado em `preParsing` para `/webhooks/whatsapp` e `/webhooks/meta` (`webhooks.ts:98-109`).

| Webhook                    | Verificação                                                                 | Raw body p/ HMAC  | Constant-time                                     | Dedup                                                          | Sem-secret em prod                             |
| -------------------------- | --------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| WhatsApp POST              | X-Hub-Signature-256 (HMAC-SHA256, app secret)                               | **Sim** (rawBody) | `timingSafeEqual` (`webhooks.ts:38-42`)           | `UNIQUE(provider,event_id)` + onConflictDoNothing (`:191-199`) | **500** via `enforceProductionSecret` (`:149`) |
| Meta POST                  | X-Hub-Signature-256                                                         | **Sim**           | `timingSafeEqual`                                 | `metaWebhookEvents` UNIQUE + inbox UNIQUE (`:391-408`)         | **500** (`:353`)                               |
| Signature POST             | Bearer token compartilhado                                                  | N/A (token)       | `isValidSharedToken`/`timingSafeEqual` (`:46-53`) | UNIQUE inbox (`:257-265`)                                      | **500** (`:223`)                               |
| **Payments POST**          | `asaas-webhook-token`/`asaas-access-token` header **apenas SE configurado** | N/A               | `timingSafeEqual` (`:295`)                        | UNIQUE inbox (`:315-323`)                                      | **NÃO enforce** (só valida se token presente)  |
| Verify GET (whatsapp/meta) | hub.verify_token constant-time                                              | —                 | sim                                               | —                                                              | 403 sem token                                  |

**Timestamp/replay window**: nenhum webhook valida timestamp/janela — dependem só do dedup por `provider_event_id`. Aceitável (dedup impede replay processado 2×), mas um evento nunca-visto forjado com assinatura válida seria aceito (só possível com o secret).

**ACHADO P1 (SUSPEITA — requer prova HTTP): `/webhooks/payments` não exige segredo em produção.** Diferente dos outros três, não chama `enforceProductionSecret`; se `ASAAS_WEBHOOK_TOKEN` estiver ausente, aceita POST **não autenticado** (`webhooks.ts:276-324`). Cadeia até o dinheiro:

1. Sem token → aceita. Resolve `charge` por `providerChargeId` (do payload) → org derivada de `charge.orgId` (não confia em payload). `:300-308`.
2. **Se o provider expõe `confirmCharge`** (o `FakePaymentProvider` expõe — `packages/integrations/src/payments/fake.ts:32-36`), o webhook chama `provider.confirmCharge(providerChargeId)` marcando a cobrança CONFIRMED no provider. `webhooks.ts:311-314`.
3. Enfileira PAYMENT no inbox. O worker (`apps/worker/src/paymentJobs.ts:70-141`) para `eventType==='PAYMENT_CONFIRMED'` chama `getChargeStatus`; com FAKE já retorna CONFIRMED → **credita**: marca charge PAID, posta ledger CASH/AR, cria split + payout.
4. `providerChargeId` do FAKE é **determinístico e adivinhável**: `pc.fake.${sha256("amountCents:dueDate")[:12]}` (`fake.ts:14-18`).

Pré-condições: `NODE_ENV=production` + `PAYMENT_PROVIDER` ausente/`FAKE` (o worker faz default para `FAKE` quando ausente — `apps/worker/src/inboxJobs.ts:177-179`; a API idem via `getPaymentProvider`) + `ASAAS_WEBHOOK_TOKEN` ausente. Com **ASAAS real** o ataque é bloqueado (Asaas não expõe `confirmCharge`; `getChargeStatus` real retorna PENDING → worker lança e não credita — defesa em profundidade em `paymentJobs.ts:76-82`). Ainda assim a **assimetria de hardening** é um risco real de money-integrity sob configuração default/misconfig. Recomendação: aplicar `enforceProductionSecret` também no payments.

`eventType` é controlado pelo atacante (`paymentWebhookEventSchema`, `packages/contracts/src/finance.ts:243-250`) — pode enviar `PAYMENT_REFUNDED` para forçar estorno de charge de outra org (idem, mitigado por provider real via `refundPayment`).

## 8. Uploads / Storage

**CONFIRMADO — bom, com 1 gap.**

- MIME whitelist na solicitação: `mimeTypeSchema` = jpeg/png/webp/pdf (`packages/contracts/src/media.ts:7-14`); inspeção = +audio/video (`inspections.ts:35-43`).
- Tamanho: `assertSizeAllowed` no request E **revalidado com o tamanho real** via `headObject` no confirm (`properties.ts:729-734`, `inspections.ts:327-332`). Presigned PUT não limita, por isso a revalidação. Bom.
- Key com prefixo de org: `buildStorageKey` sempre gera server-side `orgs/${orgId}/properties/${propertyId}/${kind}/${uuid}.${ext}` (`apps/api/src/media-rules.ts:14-22`). O confirm **rejeita** key que não começa com `orgs/${auth.orgId}/properties/${property.id}/` (`properties.ts:725-727`; inspeção `inspections.ts:324`). Sem path traversal (uuid gerado, ext de mapa fixo). CONFIRMADO.
- HEAD de confirmação: sim (`headObject`, `properties.ts:729`).
- URLs presignadas com expiração: PUT default 300s (`packages/storage/src/s3.adapter.ts:128-137`); GET presign existe (`:140-145`) mas **não há rota de download autorizado** que o exponha (grep não achou caller de `getPresignedDownloadUrl` em rotas). Mídia pública é listada por metadados; download real de objeto privado não é servido por endpoint — provável gap funcional, não vulnerabilidade.

**ACHADO P2 (CONFIRMADO): o MIME real do objeto nunca é validado.** No confirm, `mimeType` é gravado como **`null`** e o `kind` é inferido do segmento da key (`inferKindFromKey`, `properties.ts:836-848`; `inspections.ts:331`). `headObject` só retorna `{key,size}` (`s3.adapter.ts:110-126`) — não lê Content-Type nem magic bytes. Ou seja, a "validação de MIME real server-side no confirm" afirmada em `docs/THREAT_MODEL.md:58` **não ocorre**: um cliente pode subir bytes arbitrários (ex.: HTML/SVG/EXE) numa key `.../photo/uuid.jpg`. Como a mídia pública pode ser servida ao site/canais, há risco de conteúdo malicioso se o storage/CDN servir com sniffing. Mitigado por CSP e por os downloads não serem servidos por endpoint próprio ainda. Requer prova HTTP (subir conteúdo não-imagem e confirmar aceitação).

## 9. SSRF

**CONFIRMADO — baixo risco.** `grep fetch(` em `apps/api/src`: **nenhum fetch com URL controlada por usuário** na API. Integrações usam URLs fixas: OpenAI `api.openai.com` (`packages/integrations/src/ai/openai.ts:65`), Gemini fixo, Google Maps/Places host fixo, Asaas base fixa por env, Meta Graph fixo (`meta-ads/graph.ts:50`). `landingUrl` de anúncio exige `https://` mas **não é fetchada** pela API (vai como dado para a Meta) — sem SSRF. O BFF Next (`api/backend/[...path]`) monta o path a partir da URL mas o host destino é **fixo** (`API_BASE_URL`), só repassa path/query — sem SSRF (não há host arbitrário). `apps/web/src/lib/api-server.ts:82-99`. Mídia por URL: não há ingestão por URL (upload é presigned PUT). OK.

## 10. SQL injection

**CONFIRMADO — sem injeção.** Todo acesso é via drizzle parametrizado. Os únicos `sql\`\``são template tags parametrizadas com`${limit}`/`${jobId}`/`${safe}` (bind, não interpolação de string): `apps/worker/src/inboxJobs.ts:92-108,222-227`, `channelJobs.ts:39-55,147-152`, `metaJobs.ts:59-75`, `health.ts:25`. Nenhum `sql.raw()` com input de usuário. `${limit}`vem de`RunInboxJobsOptions.limit` (default 10, não exposto a usuário). CONFIRMADO seguro.

## 11. XSS / CSV injection

- **dangerouslySetInnerHTML / innerHTML / eval**: `grep` não encontrou nenhum em `apps/web/src` nem `apps/mobile`. React escapa por padrão. CONFIRMADO.
- Conteúdo de contrato renderizado em `<pre>{contract.content}</pre>` (texto, escapado) — `apps/web/src/app/app/contracts/[id]/contract-detail-client.tsx:307-318`. Sem HTML injection.
- Template de contrato: `renderTemplate` substitui `{{var}}` por `String(value)` e grava como texto; render é `<pre>` (não HTML). `packages/domain/src/contract/template.ts:10-33`. Sem sink HTML.
- **CSV injection (P3 — CONFIRMADO): export CSV não neutraliza fórmulas.** `toCsv` (`apps/api/src/routes/reporting.ts:379-404`) faz escape de `"`,`,`,`\n` mas **não prefixa** células que iniciam com `= + - @` (fórmula). Colunas exportadas são whitelisted e majoritariamente ids/enums/números (`packages/domain/src/portal/portal.ts:105-113`) — campos de texto livre (nome/notes) NÃO estão na whitelist, reduzindo muito o risco. Ainda assim, valores como `status`/`channel` são controlados internamente. Baixo. Registrar como P3.

## 12. Segredos

**CONFIRMADO — bom.**

- Nenhum segredo hardcoded no código de app. `.env.example` só tem placeholders vazios/URLs locais. Schema de env **não tem defaults inseguros**: `META_TOKEN_ENCRYPTION_KEY`, `ASAAS_WEBHOOK_TOKEN`, `SIGNATURE_WEBHOOK_TOKEN`, `META_APP_SECRET` são todos `optional()` **sem default** (`packages/config/src/env.ts:29-54`). Não há "chave de criptografia default" nem "session secret default" (sessão não usa secret; é token aleatório+hash).
- Criptografia de token Meta: AES-256-GCM, chave hex-64 obrigatória validada, IV aleatório 12B, tag GCM. `packages/config/src/secrets.ts:19-54`. Token nunca em claro; MCP só recebe IDs (`apps/meta-mcp/src/index.ts:8-12`). CONFIRMADO.
- `scripts/security-scan.mjs`: cobre AWS/Stripe/GitHub PAT/private key/Meta EAAG/Google AIza/OpenAI sk-/Anthropic/Slack xox/SendGrid/Brevo/atribuição genérica `secret=`/connection strings; allowlist por **valor exato** de fakes; ignora localhost e `process.env.X`. Roda no CI (bloqueante). `.github/workflows/ci.yml`. Sólido.
- Logger pino com `redact` de password/token/secret/authorization/apiKey/access_token/etc. `packages/observability/src/logger.ts:7-38`. `writeAudit` redige chaves sensíveis do payload antes do jsonb (`apps/api/src/plugins/audit.ts:14-32`). `sanitizeError`/`toToolError` removem URLs e tokens EAAG em worker/MCP.

**ACHADO P2 (CONFIRMADO — higiene de repo, não segredo vivo): `achouimovel-ai.zip` (15MB) está versionado e contém um repositório `.git` completo de OUTRO produto** (305 objetos, `achouimovel-ai/.git/`), incluindo `.git/config` com remotes `origin=https://github.com/maquinanerd/achouimovel-ai` e `gitsafe-backup` (`git://gitsafe:5418`). Também contém `backend/.env.example`. Não vi tokens em claro no `.git/config` (não há credenciais embutidas na URL). Risco: distribuição de código/histórico de terceiro e superfície para segredos ocultos em blobs do `.git` empacotado (o `security-scan.mjs` NÃO varre dentro de `.zip` — `.git` só é ignorado como diretório, não como conteúdo de zip; e o scan pula por extensão apenas alguns binários, mas lê o zip? Não — zip é lido como binário e provavelmente falha o `readFileSync utf8` silenciosamente, então NÃO é varrido). Recomendação: remover os dois `.zip` do versionamento. (O `aluguei-app-frontend-autopilot-complete.zip` só tem design-tokens, benigno.)

## 13. PII / LGPD

**CONFIRMADO — bom, com nuances.**

- Redação de logger cobre credenciais mas **não CPF/telefone/e-mail** — PII pessoal não é redigida em logs. Como o código evita logar corpos, o risco é baixo, mas não há redaction de PII pessoal por design. P3.
- Audit events: `writeAudit` grava payloads pequenos e redige só credenciais; alguns payloads incluem `email` (registro: `auth.ts:91`) — PII em `audit_events.payload`. Aceitável (finalidade de auditoria), mas é PII persistida. P3.
- PII em querystring: **não encontrei** CPF/token em query. Portal statement usa `propertyId` (uuid) em query — ok. Token de portal vai no **body** do consume (`consumePortalTokenRequestSchema`), não em URL. Bom.
- PII para IA/Meta: prompt de intenção não injeta PII além do texto do usuário (`packages/integrations/src/ai/extract.ts:26-42`); material de anúncio valida ausência de CPF/telefone/nome no copy antes de enviar à Meta (`packages/domain/src/meta/adMaterial.ts:34-99`). MCP só recebe IDs. Bom.
- Mascaramento de CPF: **não há mascaramento** — CPF é normalizado (só dígitos) e armazenado/retornado em claro em `party_identities.value` e devolvido no DTO de party (`apps/api/src/routes/parties.ts:91`). Portal e reporting não expõem CPF (whitelist de export não inclui identities). O backoffice (com permissão `party:read`) vê CPF completo. Sem mascaramento parcial. P3 (decisão de produto).
- Exportação sanitiza colunas por whitelist + role (`sanitizeExportColumns`, `portal/portal.ts:116-139`) — só owner/admin/finance, colunas fixas sem PII sensível. Bom.
- Consentimento LGPD: screening exige `partyConsents` ativo (`rental-applications.ts:284-287`); import de lead registra consentimento `LEAD_IMPORT` (`channelJobs.ts:166-190`). Bom.

## 14. Rate limit

**CONFIRMADO parcialmente + 1 achado.**

- Global 300/min + específicos (login/register 10, portal consume 20, export 10, upload 60, mensagens 60, webhooks 300-600). `app.ts:150-165` e configs por rota (anexo A).
- Store: memória por processo; **Redis quando `REDIS_URL`** presente (`createRedisClient` → `RedisStore`). `app.ts:161-165`. Multi-instância OK com Redis.
- `keyGenerator`: `user:${userId}` se autenticado, senão `ip:${request.ip}`. `app.ts:95-98`. O hook do rate-limit é anexado por rota (via `onRoute`), rodando **após** o hook de sessão (app-level) → em rotas autenticadas `request.auth` já existe e a chave é por usuário. CONFIRMADO (não é o bug de ordering que se poderia supor).
- `trustProxy:'loopback'` (`app.ts:140`) — não confia em XFF arbitrário. Bom contra spoofing de IP se a API for acessada diretamente.

**ACHADO P3 (CONFIRMADO — documentado): endpoints NÃO autenticados atrás do proxy compartilham um único bucket de IP.** O BFF Next **deliberadamente não repassa** `X-Forwarded-For` (`apps/web/src/lib/api-server.ts:88-94`), e `trustProxy:'loopback'` faz a API ver sempre o IP do proxy. Logo `/auth/login`, `/auth/register`, `/portal/auth/consume`, `/public/*` e webhooks têm chave `ip:<proxyIP>` única para TODOS os clientes. Consequências: (a) brute-force de login não é isolável por atacante (todos somam no mesmo balde de 10/min); (b) um atacante pode **negar login a todos** consumindo o balde (DoS). Explicitamente aceito em `docs/THREAT_MODEL.md:45` ("em produção o LB deve inserir XFF"). Recomendação: em produção, LB/CDN deve setar XFF confiável e `trustProxy` ajustado; ou o BFF repassar XFF original. Mantido como P3 por ser documentado e dependente de topologia.

- `X-Forwarded-For` spoofing: com `trustProxy:'loopback'`, XFF de um cliente direto (não-loopback) é ignorado → não há spoofing de IP para furar rate limit. CONFIRMADO seguro nesse ponto.

## 15. Erros

**CONFIRMADO — bom.** `setErrorHandler` (`apps/api/src/errors.ts`): DomainError→status mapeado + `code`/`message`/`details` (details é estruturado intencional, não interno); ZodError→400 com path/message; erros de framework 4xx preservam status/message (429/413 não viram 500); **qualquer outro → 500 genérico `"Erro interno"`** sem stack/SQL. `errors.ts:60-66`. Não vaza `DrizzleQueryError` (que contém a query) para o cliente — cai no 500 genérico; a query só vai para `request.log.error` (log interno). CONFIRMADO sem vazamento de stack/SQL ao cliente.

## 16. Dependências

`pnpm-workspace.yaml`: override `uuid: '>=11.1.1'` (corrige moderate). Comentário documenta que `image-size` tem 2 highs sem fix público (última 2.0.2; 2.x quebra metro/Expo) — mantido 1.2.1, monitorado. Só afeta tooling Expo/mobile, não runtime API. `minimumReleaseAgeExclude` lista fastify/pglite/argon2 (supply-chain: exclui do atraso mínimo). Versões atuais: next 16.3.0, fastify 5.12.0, drizzle 0.45.2, react 19.2.3, @node-rs/argon2 2.1.0, zod 4.4.3, @aws-sdk/client-s3 3.1109.0. CI roda `pnpm audit --prod` informativo + step bloqueante para `--audit-level=critical`. Não rodei audit (regra). Sem override perigoso.

---

## Achados por severidade

**P0** — nenhum confirmado por leitura de código.

**P1**

- **Webhook `/webhooks/payments` sem enforce de segredo em produção** → crédito/estorno forjado de cobrança com provider FAKE/default (money-integrity). `apps/api/src/routes/webhooks.ts:276-324` (compare `:149,:223,:353`). Mitigado por ASAAS real + re-confirmação do worker (`apps/worker/src/paymentJobs.ts:76-82`), mas assimétrico e explorável sob config default. SUSPEITA — requer prova HTTP.

**P2**

- **IDOR-por-referência na criação**: leads/visits/proposals/tasks/rental-applications/inspections inserem FKs (partyId/propertyId/leadId/proposalId) sem validar pertencimento à org. `leads.ts:50-74`, `visits.ts:38-51`, `proposals.ts:42-56`, `tasks.ts:43-57`, `rental-applications.ts:135-146`, `inspections.ts:154-165`. SUSPEITA — requer prova.
- **MIME real nunca validado no confirm de upload** (`mimeType` gravado null; só inferência por key). `apps/api/src/routes/properties.ts:729-767,836-848`, `inspections.ts:327-345`, `packages/storage/src/s3.adapter.ts:110-126`. Contradiz `docs/THREAT_MODEL.md:58`. CONFIRMADO.
- **`achouimovel-ai.zip` versionado** contém `.git` completo de outro produto + `.env.example`; fora do alcance do secret scan. CONFIRMADO (higiene/superfície).

**P3**

- Admin pode se auto-promover a owner (permissões idênticas; cosmético). `organizations.ts:118-161`.
- Convite pode atribuir `owner` (só quem já tem member:manage). `organizations.ts:77-116`.
- Rate limit de endpoints não autenticados = bucket único de IP atrás do proxy (XFF não repassado) — brute-force/DoS de login. `api-server.ts:88-94` + `app.ts:140`. Documentado.
- CSV export sem neutralização de fórmula (`= + - @`). `reporting.ts:379-404`.
- Sem mascaramento de CPF no DTO de party (backoffice vê completo). `parties.ts:91`.
- Logs/audit não redigem PII pessoal (CPF/telefone/e-mail). `logger.ts:7-27`, `audit.ts:14-32`.
- Mensagem de conflito no registro ambígua mas ainda reveladora. `auth.ts:96-100`.
- CSP com `unsafe-inline`/`unsafe-eval` no script-src. `next.config.ts:11`.
- API não valida Origin/CSRF token própria (depende de SameSite=Lax + proxy). `session.ts:42-48`.

---

## Provas HTTP que o orquestrador deve executar

Setup: 2 orgs. Registrar owner A (org A) e owner B (org B) via `POST /auth/login` (BFF ou API direta com cookie). Guardar cookies/sessões. Criar em cada org: uma party, um property, um lead. IDs cruzados: `partyB`, `propertyB`, `leadB` (org B) usados por A.

### IDOR-por-referência (P2)

1. **Lead referenciando recurso de outra org**
   `POST /leads` como **A** com body `{ "partyId": "<partyB>", "interestedPropertyIds": ["<propertyB>"] }`.
   Esperado seguro: 400/404 (validação de pertencimento). Se **201** → IDOR-write confirmado. Em seguida `GET /leads` como A e verificar se algum agregado/join expõe dados de `propertyB` (título) → se sim, escala para vazamento de leitura.
2. **Visit/Proposal cross-ref**
   `POST /visits` (A) `{ "propertyId":"<propertyB>","partyId":"<partyB>","scheduledAt":"2026-10-01T10:00:00Z" }` → esperar 400/404; 201 = IDOR-write.
   `POST /proposals` (A) `{ "propertyId":"<propertyB>","partyId":"<partyB>","monthlyRentCents":100000 }` → idem.
3. **Rental application cross-ref**
   `POST /rental-applications` (A) `{ "partyId":"<partyB>","propertyId":"<propertyB>" }` → esperar 400/404; 201 = IDOR-write. (Depois `POST /rental-applications/:id/screening` deve exigir consentimento; confirmar que NÃO lê CPF de partyB.)
4. **Inspection cross-ref**
   `POST /inspections` (A) `{ "propertyId":"<propertyB>","type":"CHECKIN" }` → esperar 400/404; 201 = IDOR-write.

### Cross-tenant de leitura (esperado NEGATIVO — confirmar 404)

5. `GET /leads/<leadB_id or any>/status`... na verdade use: `PATCH /leads/<leadB>/status` como A → esperar 404. `GET /properties/<propertyB>` como A → 404. `GET /contracts/<contractB>` → 404. `GET /organizations/<orgB>/members` como A → 404. Confirmar ausência de enumeração.

### Escalonamento RBAC (P3)

6. Criar user admin em org A (owner A: `POST /organizations/<orgA>/members` com `{userId, role:"admin"}`). Logar como esse admin. `PATCH /organizations/<orgA>/members/<selfUserId>` com `{ "role":"owner" }` → se 200, auto-promoção admin→owner confirmada. Depois tentar rebaixar o último owner original → esperar 409 (guarda do último owner).
7. Como `agent` (criar membership role agent): `POST /organizations/<orgA>/members` → esperar 403 (agent sem member:manage).

### Webhook de pagamento forjado (P1) — ambiente com `PAYMENT_PROVIDER=FAKE`/ausente e `ASAAS_WEBHOOK_TOKEN` ausente

8. Como tenant/portal de org B, iniciar um pagamento para gerar `providerChargeId` (`POST /portal/tenant/charges/:id/payment` ou backoffice `POST /charges/:id/payment`). Anotar `providerChargeId` (formato `pc.fake.<12hex>`).
9. **Sem nenhum header de autenticação/token**, `POST /webhooks/payments` com body:
   `{ "provider":"FAKE","eventType":"PAYMENT_CONFIRMED","providerEventId":"forged-1","providerChargeId":"<providerChargeId>","amountCents":<valor>,"paidAt":"2026-09-10T00:00:00Z" }`
   Esperar: se **200 `{status:"queued"}`** sem token → falta de enforce confirmada. Rodar o worker (`--run-once`) e verificar se a charge vira `PAID` e se `payments`/`payouts`/`ledger_entries` foram criados **sem pagamento real** → crédito forjado (P1).
10. Repetir §9 com `NODE_ENV=production`: confirmar que payments **ainda** aceita sem token (contraste com whatsapp/signature/meta que devem responder 500). `POST /webhooks/signature` sem `Authorization` em prod → esperar 500 (enforce); `POST /webhooks/meta` sem assinatura em prod → 500. Isso evidencia a assimetria.
11. Cross-tenant do webhook: forjar §9 com `providerChargeId` de **org A** enquanto não autenticado → confirmar que credita charge de A (org derivada do charge, não do payload) sem consentimento de A.

### Upload MIME (P2)

12. `POST /properties/<propId>/media/upload-url` (A) `{ "kind":"PHOTO","mimeType":"image/jpeg","sizeBytes":1024 }` → obter `url,key`. Fazer PUT de **bytes não-imagem** (ex.: `<script>alert(1)</script>` ou um binário) na `url` presignada. Depois `POST /properties/<propId>/media/confirm` `{ "key":"<key>" }` → se **201** (aceita apesar do conteúdo não ser JPEG) → validação de MIME real ausente confirmada.

### Rate limit / bucket compartilhado (P3)

13. Via BFF (`/api/auth/login`), disparar 11 logins inválidos de "usuários" distintos a partir de **IPs de cliente diferentes** → se o 11º já receber 429 (balde único do proxy), confirma bucket compartilhado e DoS de login. Comparar com chamada direta à API (IP distinto) para ver isolamento.

### Portal (esperado NEGATIVO)

14. Consumir token one-time 2×: `POST /portal/auth/consume` `{token}` → 200 na 1ª, **401** na 2ª (consumo único). Após revogar acesso, sessão do portal → 401. Tenant tentando `GET /portal/landlord/properties` → 403 (kind). Tenant acessando `/portal/tenant/contracts/<contractDeOutroTenant>` → 404.

---

Caminho deste relatório: `C:\Users\pablo\AppData\Local\Temp\claude\C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11\57b60008-7a72-4aed-be9f-ad6fb81a7cff\scratchpad\agent_E1_security.md`

## Anexo A — Rotas × guarda (resumo)

Todas as rotas de negócio de escrita têm `requirePermission`. Rotas sem `requirePermission`: `auth/*`, `me/memberships` (só requireAuth), `organizations/:orgId/members/*` (RBAC via `assertOrgMemberPermission` no corpo — seguro), `webhooks/*` (HMAC/token), `public/*` e `health/*` (públicos). Rotas de portal usam `requirePortalKind`. Tabela completa gerada em varredura: ver seções §4-§7. Nenhuma rota de escrita autenticada ficou sem guarda de permissão/associação.
