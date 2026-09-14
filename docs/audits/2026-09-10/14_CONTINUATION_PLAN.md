# 14 — Plano de continuação (executável por uma nova sessão)

> Instrução de uso: **"Leia integralmente a auditoria (`docs/audits/2026-09-10/00`–`13`) e execute o plano até o próximo gate."** O próximo gate é o **G1** (§5). Não pergunte sobre decisões técnicas reversíveis; registre as relevantes em `docs/DECISIONS.md` (ADR) e o progresso em `docs/EXECUTION_STATE.md`.

## 0. Ponto de partida (fatos desta auditoria)

- Produto: Operating System de locação (imóvel → anúncio → lead → atendimento → visita → proposta → crédito → contrato → assinatura → vistoria → locação → cobrança → pagamento → split → repasse → conciliação/ledger), monorepo pnpm/turbo, Fastify 5 + Drizzle/PostgreSQL 17 + Next 16/React 19 + Expo 57 + worker de fila em Postgres + MCP Meta.
- Números atuais: 72 tabelas · 11 migrations · **154 endpoints** · 306 schemas zod · 12 máquinas de estado · 17 tools MCP · **44 páginas web** + 7 handlers · **418 testes vitest + 3 Playwright, todos verdes**.
- Veredito: **PARTIALLY_FUNCTIONAL**. A API executa a jornada até a cobrança com fakes; a liquidação só fecha in-process; há **7 P0** (dinheiro, tenant, contrato, dependências, entrada monetária), **24 P1**, 23 P2. Nenhuma integração em sandbox/live; Asaas, Clicksign e Redis quebrados.
- Git: branch `main` local **11 commits à frente** de `origin/main`; a auditoria está no worktree `claude/aluguei-technical-audit-6cea11` (docs não commitados até decisão do usuário).

## 1. Regras permanentes para quem continuar

1. Fonte de verdade = código + migrations + testes executados + HTTP executado. Docs antigos (inclusive `FINAL_READINESS_REPORT`, `EXECUTION_STATE`, `10_FRONTEND_STATE`) contêm afirmações falsas (ver 11 §2) — não confie neles.
2. **Não reconstrua** módulos existentes; corrija com teste que reproduz o defeito antes do fix (controle negativo) e passa depois.
3. **Sem efeitos externos reais**: nada de cobrança/Pix/boleto/repasse reais, WhatsApp real, consulta de crédito, envio de contrato, publicação Meta/portais, e-mail real. Sandbox só com credenciais explicitamente de sandbox fornecidas pelo usuário; `live` só com autorização explícita.
4. Nenhum segredo em código, log, fixture, commit ou evidência.
5. Gates por fase: `pnpm format:check && pnpm lint --force && pnpm typecheck --force && pnpm test --force && pnpm build --force && pnpm security:scan && pnpm security:audit --audit-level=critical && pnpm db:generate` (sem drift) + Playwright (após a Fase 0).
6. Commits pequenos; sem reset destrutivo, force-push ou reescrita de histórico sem autorização do usuário.
7. **Frontend — regra de referência Kal El** (usar exatamente assim): _"Use a pasta do Kal El como referência visual e técnica de frontend. Reaproveite componentes, tokens, padrões de layout, navegação, tabelas, formulários, modais, estados, responsividade e estrutura de UI quando forem compatíveis. Não copie cegamente código de domínio, APIs, schemas, rotas, autenticação, banco ou regras de negócio do Kal El. O Aluguei.app continua sendo a fonte de verdade funcional."_ Fatos úteis (agente F): Kal El usa Next 14/React 18 e o mesmo PEG Product Design System (36/36 arquivos de especificação iguais aos de `design-source/`), CSS puro com `--peg-*`/`.peg-*`; **61 classes `.peg-*` homônimas com regras diferentes** (não carregar os dois CSS juntos) e 17 componentes homônimos com APIs diferentes. Candidatos a referência: Shell com drawer acessível, Modal com foco estável (`closeRef`), FieldShell, tabela com área rolável focável, FilterBar, SaveState, TokenPicker, CreatableSelect, DateTimeDialog, CalendarGrid, padrão breadcrumb+status, gate axe com matriz de viewports. **Não trazer**: `status.ts`, catálogo de permissões, diálogos editoriais de `Patterns.tsx`, `Editor.tsx`, nada de `apps/cms` (api/auth/middleware/AppShell/navegação/marca).

## 2. Como subir o ambiente local (receita validada)

Ver `evidence/README.md`. Pontos que custaram tempo nesta auditoria:

- `pg_ctl start` com saída canalizada **não retorna** no Windows → rode com `-l arquivo` e sem pipe (ou em background).
- Dois `next dev` no mesmo `apps/web` não coexistem; `next start` exige `API_BASE_URL` https (P1-15) — em dev use `next dev`.
- A vitrine precisa de `PUBLIC_ORG_SLUG`.
- `REDIS_URL` derruba a API (P1-14) — não defina até a Fase 6.
- Turbo reproduz logs do cache: use `--force` para evidência.
- Checkout Windows: adicionar `.gitattributes` (Fase 0) para o prettier.
- O E2E aceita stack já no ar (`reuseExistingServer`); o boot automático falha neste ambiente até a Fase 0.

## 3. Backlog priorizado (IDs detalhados em 10)

- **P0**: P0-01 duplo crédito/repasse · P0-02 estorno forjável · P0-03 dinheiro recebido sem registro · P0-04 contrato assinado regenerável · P0-05 isolamento por referência + consentimento cross-org · P0-06 dependências críticas (Next RCE) · P0-07 entrada monetária "3.500" → R$ 3,50.
- **P1**: P1-01 `limit=200` · P1-02 content-type do BFF · P1-03 logout · P1-04 hooks/vistoria · P1-05 `ACCEPT` · P1-06 bypass de crédito · P1-07 juros 1%/dia · P1-08 coproprietários · P1-09 estorno/cancelamento locais · P1-10 Asaas · P1-11 Clicksign · P1-12 defaults inseguros/fakes · P1-13 liquidação entre processos · P1-14 Redis · P1-15 web exige https · P1-16 portais sem acesso · P1-17 fluxos sem UI · P1-18 WhatsApp handoff/claim · P1-19 transcrição fabricada · P1-20 scheduler alfabético · P1-21 MCP/Meta sem auth/confirmação · P1-22 CI vermelho · P1-23 zip de outro produto · P1-24 evidência de vistoria apagável.
- **P2**: P2-01..P2-23 (ver 10) — destaque: pessoas sem edição/CPF sem validação; visitas/propostas sem ciclo; senha/convite; portal (extrato/vistorias); vitrine sem fotos/lead; worker/observabilidade; banco (CHECK/int4); storage; mobile; E2E fora do CI; `main` não publicado.
- **P3**: ver 10.

## 4. Fases (ordem de dependência)

### Fase 0 — Higiene, dependências e CI verde

- **OBJETIVO**: pipeline confiável e sem vulnerabilidade crítica antes de qualquer mudança funcional.
- **POR QUE AGORA**: CI vermelho (P1-22) e RCE crítico no Next (P0-06) invalidam qualquer ambiente exposto; sem gates confiáveis não há como provar as fases seguintes.
- **ARQUIVOS/MÓDULOS**: `apps/web/package.json` (next ≥ 16.3.3), `apps/api/package.json` (fastify ≥ 5.12.1), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (overrides: `fast-uri`, `sharp` se necessário), `.gitattributes` (novo: `* text=auto eol=lf`), `docs/production-readiness/SESSION_REPORT.md` (formatar), `eslint.config.mjs` (+ `eslint-plugin-react-hooks` com `rules-of-hooks` error), `tests/e2e/scripts/boot-stack.mjs`, `.github/workflows/ci.yml`.
- **DEPENDÊNCIAS**: nenhuma.
- **IMPLEMENTAÇÃO**: upgrades mínimos com lockfile; `pnpm audit --prod --audit-level=critical` = 0; formatar; `.gitattributes`; habilitar regra de hooks (vai acusar P1-04 — corrigir aqui ou marcar como falha esperada até a Fase 4); `boot-stack.mjs`: `pg_ctl` com `stdio: 'ignore'` + `-w` e log em arquivo, detectar diretório de dados parcial, logar saída dos filhos em arquivo, abortar se já houver `next dev` no projeto; job de CI com serviço Postgres para Playwright (pode ficar `continue-on-error` até a Fase 4). **Remoção dos zips** (`achouimovel-ai.zip`, `aluguei-app-frontend-autopilot-complete.zip`) com `git rm` — **reescrever histórico só com autorização do usuário**. Publicar `main` (push) somente com autorização.
- **TESTES DE ACEITE**: todos os gates do §1.5 verdes com `--force`; E2E 3/3 com boot automático numa máquina limpa; `pnpm audit` sem critical.
- **CRITÉRIO DE DONE**: CI verde no GitHub (ou execução local equivalente registrada); `git ls-files '*.zip'` vazio.
- **RISCO**: baixo-médio (upgrade de Next pode exigir ajustes de build).
- **PARALELIZÁVEL**: não — é pré-requisito (curta).

### Fase 1 — Integridade financeira (P0-01, P0-02, P0-03, P1-09, P1-13, parte de P2-09/P2-17)

- **OBJETIVO**: nenhum centavo duplicado, perdido ou estornado sem confirmação.
- **POR QUE AGORA**: é o risco de maior impacto e bloqueia Asaas sandbox.
- **ARQUIVOS/MÓDULOS**: `apps/worker/src/paymentJobs.ts`, `inboxJobs.ts`, `index.ts`; `apps/api/src/ledger.ts`; `apps/api/src/routes/charges.ts`, `portal.ts`, `webhooks.ts`, `payments.ts`; `packages/domain/src/finance/stateMachines.ts`, `split.ts`; `packages/db/src/schema/finance.ts` + nova migration; `packages/integrations/src/payments/*`.
- **DEPENDÊNCIAS**: Fase 0.
- **IMPLEMENTAÇÃO**:
  1. Migration: UNIQUE `payments(provider, provider_payment_id)` (parcial, não nulo), `charges(provider_charge_id)` (parcial), `split_allocations(payment_id, role, party_id)`, `payouts(payment_id, party_id)` (adicionar `payment_id`), coluna `ledger_entries.idempotency_key`/`business_key` única por (org, key, account); CHECKs de sinal/valor (`amount_cents >= 0` onde aplicável). Deduplicar dados existentes antes.
  2. `processPaymentJob` em `db.transaction`, com compare-and-set (`UPDATE payments SET status='CONFIRMED' WHERE id=$1 AND status='PENDING' RETURNING *`) e só então split/payout/ledger; `transactionId` determinístico derivado de (evento, payment); gravar `provider_payment_id`.
  3. Máquina de cobrança: permitir `SCHEDULED → PAID` e `OVERDUE → PAID`; pagamento após `CANCELLED` vira evento de "recebimento indevido" com registro contábil (conta transitória) em vez de falha silenciosa.
  4. Iniciação idempotente: reusar payment PENDING da mesma cobrança/método; ao reemitir, cancelar a cobrança anterior no provider; webhook resolve por `provider_payment_id`/`provider_charge_id` único.
  5. Webhook de pagamentos: `enforceProductionSecret` obrigatório; `PAYMENT_REFUNDED`/`FAILED`/`OVERDUE` só após confirmar no provider; **o webhook nunca executa estorno** — apenas registra estorno confirmado.
  6. Estorno pelo backoffice: chama o provider, lança reversão (REFUND), trata repasse (bloquear se PENDING; clawback/registro se PAGO); cancelamento: `cancelCharge` no provider + reversão do lançamento CHARGE.
  7. Reaper respeita `attempts`; fila com DLQ (status terminal + alerta via log estruturado).
  8. FAKE compartilhável entre processos para dev/E2E (estado em tabela ou stub HTTP) — fecha P1-13 sem precisar de credencial.
- **TESTES DE ACEITE**: transformar o harness (`evidence/scripts/zz-audit-races.tmp.test.ts.archived`) em testes permanentes com expectativas corretas: S1/S1c → 1 crédito, 1 repasse; S3 → 0 estornos executados por webhook, 1 estorno confirmado no máximo; S4 → cobrança SCHEDULED paga pelo portal fica PAID; S5 → segunda cobrança no mesmo mês rejeitada (409); S9 → recebimento após cancelamento registrado; ledger balanceado; + teste com 2 workers reais em PostgreSQL. E2E: liquidação ponta a ponta na stack (API e worker separados) chegando a PAID.
- **CRITÉRIO DE DONE**: todos os cenários acima verdes no CI; nenhuma escrita financeira fora de transação (grep `postLedgerTransaction` só dentro de `transaction`).
- **RISCO**: alto (dinheiro, migration com unicidade em dados existentes).
- **PARALELIZÁVEL**: sim com Fases 2 e 4 (módulos distintos); coordenar numeração de migrations.

### Fase 2 — Isolamento multi-tenant (P0-05)

- **OBJETIVO**: nenhuma referência ou leitura entre organizações.
- **POR QUE AGORA**: isolamento é pré-requisito de qualquer piloto com mais de uma imobiliária.
- **ARQUIVOS/MÓDULOS**: `apps/api/src/routes/{leads,visits,proposals,tasks,rental-applications,inspections,meta,contracts,leases}.ts`, `apps/api/src/routes/helpers.ts` (novo helper), `packages/db` (FKs compostas ou RLS).
- **DEPENDÊNCIAS**: Fase 0.
- **IMPLEMENTAÇÃO**: `assertOwnedByOrg(db, table, id, orgId)` para **todo** id vindo do corpo (party, property, lead, proposal, application, template, connection, page/instagram asset, room, media, checkout inspection, assignee → membership); consentimento filtrado por `org_id` (`rental-applications.ts:74-84`); owners/variáveis de contrato com filtro de org; defesa em profundidade: `UNIQUE(org_id,id)` nas tabelas-alvo + FKs compostas `(org_id, ref_id)` (preferível a RLS pela simplicidade com drizzle) — decisão via ADR; `first()` lançando NOT_FOUND.
- **TESTES DE ACEITE**: nova suíte `cross-org-reference.test.ts` cobrindo cada rota de criação/atualização com IDs de outra org → 404/422; SQL de verificação "zero linhas com referência a outra org".
- **CRITÉRIO DE DONE**: todos os passos `REF:` de `probe.mjs` retornam 4xx; leitura de consentimento cross-org → 404.
- **RISCO**: médio.
- **PARALELIZÁVEL**: sim (com 1 e 4).

### Fase 3 — Contratos, assinatura e crédito (P0-04, P1-06, P1-11 parte interna, P2-08)

- **OBJETIVO**: contrato assinado imutável e decisão de crédito auditável.
- **ARQUIVOS/MÓDULOS**: `apps/api/src/routes/contracts.ts`, `contract-templates.ts`, `rental-applications.ts`, `webhooks.ts`; `apps/worker/src/signatureJobs.ts`; `packages/domain/src/contract/*`, `rental/*`; schema de contratos (versões/snapshot).
- **DEPENDÊNCIAS**: Fase 0 (e Fase 2 para as consultas com org).
- **IMPLEMENTAÇÃO**: `generate` só de DRAFT (ou re-geração explícita de GENERATED antes do envio, com nova versão); bloqueio de qualquer escrita de conteúdo a partir de `SENT_FOR_SIGNATURE`; tabela/coluna de versões com hash; gravar `signature_events`; envelope com provider real (não `'FAKE'` fixo) e documento PDF gerado do conteúdo; valores formatados (R$) no corpo; candidatura: `SCREENING` só via endpoint de screening, `APPROVED/REJECTED` exigem `decisionReason` + `decidedBy`; `CONTRACTING` ao criar contrato.
- **TESTES DE ACEITE**: regenerar SIGNED → 409; PATCH que pula screening → 409; aprovação sem motivo → 400; evento de assinatura persistido.
- **CRITÉRIO DE DONE**: testes acima + E2E de contrato.
- **RISCO**: médio. **PARALELIZÁVEL**: sim.

### Fase 4 — Frontend: desbloquear fluxos (P1-01, P1-02, P1-03 web, P1-04, P0-07, P1-16, P1-17 parcial, P3 `/dev`)

- **OBJETIVO**: todas as criações e ações essenciais funcionando pela UI, sem dado falso.
- **ARQUIVOS/MÓDULOS**: `apps/web/src/lib/api-server.ts`, `api-client.ts`, `use-query.ts`; 37 chamadas `limit=200` (grep); `app/app/page.tsx` (KPIs via endpoint agregado novo `GET /dashboard/summary` na API); `inspections/[id]/inspection-detail-client.tsx` e as 18 páginas com hooks após return; `properties/[id]/property-detail-client.tsx` (componente `MoneyInput` pt-BR em `packages/ui`); `screening` (criar candidatura); `channels` (1ª publicação); portal (tela de concessão de acesso + link/QR para o token; entrega por e-mail/WhatsApp fica para a Fase 7); `app/dev/calibration` fora de produção; export CSV passthrough.
- **DEPENDÊNCIAS**: Fase 0 (regra de hooks); endpoints agregados podem depender da Fase 2.
- **IMPLEMENTAÇÃO**: selects com busca/paginação (≤ 100) ou comboboxes assíncronos; BFF só envia `content-type` quando há corpo e repassa corpo/headers não-JSON; `MoneyInput` que interpreta "3.500" = R$ 3.500,00 e "3.500,50" = R$ 3.500,50, com testes; "Remover imóvel" → arquivar; aplicar a regra Kal El (§1.7) para componentes que faltam (Shell/drawer, combobox, date dialog).
- **TESTES DE ACEITE**: Playwright para: criar anúncio, proposta, vistoria, contrato; gerar/enviar contrato; cancelar cobrança; logout (sessão revogada); export CSV; digitar "3.500" → R$ 3.500,00; abrir detalhe de vistoria; crawler sem nenhuma resposta 4xx inesperada.
- **CRITÉRIO DE DONE**: crawler do `evidence/scripts/crawl.mjs` sem 400/pageerror; dashboard com números iguais ao banco.
- **RISCO**: baixo-médio. **PARALELIZÁVEL**: sim (web isolado).

### Fase 5 — Regras de negócio e ciclos de vida (P1-05, P1-07, P1-08, P1-18, P1-20, P1-24, P2-01..P2-05)

- **OBJETIVO**: regras corretas e ciclos completos das entidades operacionais.
- **IMPLEMENTAÇÃO**: juros/multa configuráveis por contrato/locação (padrão 1% a.m. pro rata die + multa 2%, teto), dia útil/UTC-3; split por coproprietário (`ownership_share_pct`, soma = 100, `splitAmong`); ciclo de locação (renovar, reajustar, encerrar → `ENDED`) e scheduler com lista explícita de status; visitas (confirmar/reagendar/cancelar/no-show/realizada); propostas (enviar/aceitar/recusar/expirar + job de expiração); pessoas (detalhe/edição/arquivamento, validação CPF/CNPJ, documentos); lead (detalhe/edição/responsável); senha (troca/recuperação) e convite de membro; extrato do portal sem canceladas e vistorias só permitidas (`canPortalReadInspection`); enum de sugestão de IA; evidência de vistoria imutável após COMPLETED com audit; handoff WhatsApp persistente e prova de posse do número.
- **TESTES DE ACEITE**: unitários de domínio (juros, split N partes) + integração por endpoint novo + E2E dos ciclos.
- **DEPENDÊNCIAS**: Fases 1–3. **RISCO**: médio. **PARALELIZÁVEL**: parcialmente (por domínio).

### Fase 6 — Configuração, operação e observabilidade mínimas (P1-12, P1-14, P1-15, P2-10, P2-11, P2-12, backup)

- **OBJETIVO**: poder operar e investigar um ambiente de homologação com segurança.
- **POR QUE AQUI**: precisa existir **antes** de qualquer sandbox com dinheiro (ordem histórica colocava por último — rejeitado).
- **IMPLEMENTAÇÃO**: `NODE_ENV` obrigatório e _fail-fast_ em produção (proibir providers FAKE, exigir segredos de webhook, cookie Secure); `.env.example` completo; Redis store correto; flag explícita para API interna http no web; worker com log por job, health HTTP, shutdown gracioso; OTEL com instrumentação HTTP/pg em API e worker; captura de erros (Sentry ou equivalente — ADR); redact de CPF/e-mail/telefone/cookie; `audit_events.payload` com diff sem PII; backup agendado (pg_dump + retenção + criptografia) e script de restore testado; runner de migration com advisory lock e sem imprimir segredo; Dockerfile/manifesto de deploy (plataforma a decidir — reversível).
- **TESTES DE ACEITE**: boot de produção sem variável obrigatória falha com mensagem clara; restore automatizado passa; spans visíveis num coletor local; job falho gera log de erro.
- **DEPENDÊNCIAS**: Fase 0. **RISCO**: baixo. **PARALELIZÁVEL**: sim.

### Fase 7 — Integrações em sandbox (ordem revalidada)

Cada subfase só avança com credenciais **de sandbox** fornecidas pelo usuário; critério de done = smoke test gravado com evidência (IDs de sandbox, sem segredos) → `SANDBOX_VERIFIED`.

1. **Storage** (R2/MinIO): upload/download presignados, MIME real, órfãos, CSP de imagens → desbloqueia mídia no web, vitrine com fotos, vistoria e mobile.
2. **Asaas** (após Fases 1 e 6): cliente/pagador, cobrança Pix/boleto, webhook nativo (`mapAsaasPaymentWebhook`), `ASAAS_ENV` no worker, estorno pelo backoffice, conciliação real; split Asaas (se adotado) via ADR.
3. **Clicksign**: PDF, signatários com ordem, HMAC do webhook, reconciliação de status, `signature_events`.
4. **WhatsApp**: credencial por conexão/org, templates, status de entrega.
5. **Google Places/Geocoding**: chave, cache.
6. **Crédito (Serasa/SPC)**: depende de contrato comercial; até lá, decisão humana obrigatória (Fase 3).
7. **Meta Ads**: OAuth por org, resolvers de page/image_hash, confirmação humana para publish/budget, **ingestão de Lead Ads → CRM**, autenticação do MCP.
8. **Portais**: OLX (API) → feed VRSync (ZAP/Viva).
9. **IA real**: intenção (com política de PII e confirmação humana para visita) e vistoria (`fetchMedia` + storage).

- **DEPENDÊNCIAS**: Fases 1–6. **PARALELIZÁVEL**: 7.3–7.9 entre si, após 7.1/7.2.

### Fase 8 — Mobile de campo (P2-14)

SecureStore + logout + restauração de sessão; câmera/fotos com upload (Storage); áudio e envio para transcrição; fila offline e retomada de vistoria; agenda ordenada; funcionalidades do corretor por prioridade (leads, visitas, tarefas). Aceite: fluxo de vistoria completo em device/emulador com mídia. Depende de 7.1.

### Fase 9 — Aquisição e vitrine

Endpoint público de captação de lead (rate limit, validação, consentimento), mídia pública com URL, vitrine multi-org (slug/domínio). Depende de 7.1 e 2.

### Fase 10 — Piloto

Seguir `docs/production-readiness/PILOT_PLAN.md` (1 org, 5–10 imóveis) somente após G4.

## 5. Gates

| Gate             | Fases          | Critério objetivo                                                                                                                                                                   |
| ---------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1 (próximo)** | 0, 1, 2        | CI verde sem cache; audit sem critical; P0-01, P0-02, P0-03, P0-05, P0-06 fechados com testes permanentes; E2E automático 3/3 + liquidação PAID na stack com API e worker separados |
| G2               | 3, 4           | P0-04, P0-07, P1-01..05, P1-16, P1-17 fechados; crawler sem 4xx inesperado; Playwright dos fluxos de UI                                                                             |
| G3               | 5, 6           | regras/ciclos + operação mínima (fail-fast, logs de job, OTEL, backup automatizado)                                                                                                 |
| G4               | 7.1–7.3        | Storage, Asaas e Clicksign `SANDBOX_VERIFIED`                                                                                                                                       |
| G5               | 7.4–9 + piloto | demais integrações conforme contratos; mobile de campo; piloto                                                                                                                      |

Ao fechar cada gate: atualizar `docs/EXECUTION_STATE.md` com evidência, registrar ADRs, e acrescentar um anexo em `docs/audits/2026-09-10/` (ou nova pasta datada) com o que mudou.

## 6. Decisão sobre a ordem histórica (1 estabilização · 2 Storage · 3 Asaas · 4 WhatsApp · 5 assinatura · 6 crédito · 7 Meta · 8 portais · 9 Maps · 10 produção/obs/mobile)

**ALTERADA**, com justificativa:

1. "Estabilização interna" é muito maior do que o previsto: vira as Fases 0–5 (P0 de dinheiro, tenant, contrato, dependências, UI e regras). Integrar provedores reais sobre esses defeitos amplificaria o dano (ex.: estorno forjado vira estorno real).
2. **Produção/observabilidade sobe do 10º para antes de qualquer integração com dinheiro** (Fase 6).
3. Storage (1º) e Asaas (2º) entre as integrações: **confirmados** — Storage destrava mídia/vistoria/mobile/vitrine; Asaas é o ciclo financeiro.
4. **Assinatura antes de WhatsApp** (alterado): a assinatura está no caminho crítico da locação (contrato SIGNED → lease) e o Clicksign está quebrado; o WhatsApp inbound já funciona com fake e um piloto opera sem ele.
5. **Google Places antes de crédito/Meta** (alterado): custo baixo, melhora a qualidade do cadastro.
6. Crédito depende de contrato comercial; o piloto usa decisão humana auditável.
7. Mobile permanece após Storage (depende de mídia).
