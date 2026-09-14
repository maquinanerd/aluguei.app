# G1 — Relatório de execução (Fases 0, 1 e 2)

Auditoria de referência: `docs/audits/2026-09-10/`. Plano: `14_CONTINUATION_PLAN.md` (§4 Fases, §5 Gates).
Execução: 2026-09-11, branch `claude/aluguei-technical-audit-6cea11`, **sem push**.
Máquina: Windows 11 Pro, Node 24.19, pnpm 11.15.1, PostgreSQL 17.10 local.
Evidências: `docs/audits/2026-09-10/evidence/g1/`.

Escopo executado: **Fases 0, 1 e 2**. As Fases 3–10 não foram iniciadas — nenhuma mudança em
contratos/assinatura (P0-04), entrada monetária (P0-07), redesign, frontend, Storage, Asaas,
Clicksign, WhatsApp, Places, Meta, mobile ou piloto.

Sem efeito externo: providers FAKE, Meta em dry-run, IA mock. Nenhuma cobrança, Pix, boleto,
estorno, mensagem, consulta de crédito, assinatura ou publicação real. Nenhuma credencial de
sandbox foi usada.

## 1. Baseline

| Item                  | Estado em 2026-09-10                                                  |
| --------------------- | --------------------------------------------------------------------- |
| Veredito da auditoria | PARTIALLY_FUNCTIONAL                                                  |
| P0 abertos            | 7 (P0-01 … P0-07)                                                     |
| CI                    | vermelho (P1-22); `format:check` quebrado em checkout Windows (P2-21) |
| Dependências          | Next 16.3.0 com 2 RCE críticas (P0-06)                                |
| E2E                   | fora do CI, boot manual                                               |
| Suíte de integração   | 93 testes                                                             |
| Commit base           | `a6683bf`                                                             |

## 2. Fase 0 — Higiene, dependências e CI verde

| Entrega                                                                                                                                                                             | Evidência                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `.gitattributes` (`* text=auto eol=lf` + binários) — corrige `format:check` em checkout Windows (P2-21)                                                                             | gate `format` verde          |
| Next 16.3.0 → 16.3.4 (2 RCE críticas), Fastify → 5.12.3, overrides `fast-uri@3`/`@4`                                                                                                | `pnpm audit` sem critical    |
| `eslint-plugin-react-hooks` com `rules-of-hooks: error` em `**/*.{ts,tsx}`                                                                                                          | gate `lint` verde            |
| `tests/e2e/scripts/stack.mjs` (novo): cluster PostgreSQL descartável por execução, `pg_ctl -w` com saída em arquivo, sondagem de porta IPv4+IPv6, `killTree`, limpeza de stack órfã | `final-e2e.log`              |
| Playwright por `webServer` + `globalTeardown` (o `globalSetup` trava ao importar `.mjs` no Node 24)                                                                                 | `final-e2e.log`              |
| CI: serviço `postgres:17` no job `check` + step de concorrência real; novo job `e2e` com upload de artefato                                                                         | `.github/workflows/ci.yml`   |
| Zips de outro produto removidos                                                                                                                                                     | `git ls-files '*.zip'` vazio |

**Estado: DONE.**

Ressalva registrada: o critério do plano é "CI verde no GitHub **ou execução local equivalente
registrada**". O pipeline não foi executado no GitHub — isso exigiria push, que não foi
autorizado. Vale a execução local, com os mesmos comandos do `ci.yml` (§9).

## 3. Fase 1 — Integridade financeira (P0-01, P0-02, P0-03)

Método: RED → FIX → GREEN. Cada defeito virou teste permanente que **falha** na árvore anterior.

### 3.1 Controle negativo (RED)

`fase1-red-pglite.log`: **13 dos 14 testes falharam**. `fase1-red-postgres.log`: **3 dos 4**.
O teste que passa em cada arquivo é o controle positivo (fluxo feliz), que nunca deveria quebrar.

| Cenário                                               | Comportamento antes do fix                             |
| ----------------------------------------------------- | ------------------------------------------------------ |
| S1/S1c — confirmação concorrente                      | **dois créditos e dois repasses** do mesmo pagamento   |
| S3 — webhook `PAYMENT_REFUNDED` forjado               | **estorno executado** sem confirmar no provider        |
| S4 — cobrança `SCHEDULED` paga pelo portal            | não liquidava (ficava `OPEN`)                          |
| S9 — pagamento após cancelamento                      | dinheiro recebido **sem registro contábil**            |
| S5 — reemissão no mesmo mês                           | segunda cobrança duplicada aceita                      |
| Fila                                                  | job expirado reciclado sem limite, sem estado terminal |
| Webhook de produção                                   | aceito **sem segredo**                                 |
| PostgreSQL real — 2 workers                           | duplo crédito; 6 iniciações simultâneas → 6 tentativas |
| PostgreSQL real — API e worker em processos separados | liquidação **impossível** (FAKE em memória, P1-13)     |

### 3.2 Correção

- `apps/api/src/finance/settlement.ts` (novo): `applyProviderConfirmation` trava cobrança e
  pagamento **numa ordem global fixa (charge → payment)**, aplica compare-and-set e só então
  liquida; `applyProviderRefund` (alocações canceladas, reversão de repasse ou clawback),
  `applyProviderFailure`, `markChargeOverdue`; recebimento sem cobrança aplicável vira
  `UNAPPLIED_RECEIPTS` em vez de sumir.
- `apps/api/src/finance/initiation.ts` (novo): iniciação idempotente — reusa tentativa `PENDING`
  equivalente (200) e recusa com 409 quando já houve recebimento no provider ou há tentativa em
  voo; a chamada ao provider acontece **fora** da transação.
- `apps/api/src/ledger.ts` (reescrito): `postLedgerTransaction` com business key, id de transação
  determinístico (UUID v8), verificação de balanço e de conta duplicada, inserção única.
- `packages/db/drizzle/0012_finance_integrity.sql`: uniques parciais
  (`payments(provider, provider_payment_id)`, `charges(provider_charge_id)`, pagamento `PENDING`
  por cobrança), `payouts(payment_id, party_id)`, `ledger_entries(org, business_key, account)`,
  CHECKs de sinal/valor, `charges.paid_payment_id`, tabela `fake_provider_charges`.
- Máquina de estado: `SCHEDULED → PAID`, `OVERDUE → PAID`, `CANCELLED → CONFIRMED` (recebimento
  indevido registrado), `PAYMENT_STATUSES` com `CANCELLED`.
- Webhook de pagamentos: `enforceProductionSecret`, organização resolvida por
  `findPaymentByProviderId`, chave de inbox `PAY:<provider>:<eventId>`; **o webhook não estorna**.
- Fila: tentativas por provider, estado terminal `DEAD` com log estruturado, claim com marca
  (`started_at`) — só quem detém a marca conclui o job.
- FAKE com estado em tabela (`createDbFakePaymentStore`) + rota de simulação do pagador
  `POST /dev/fake-payments/:id/confirm`, registrada apenas fora de produção (fecha P1-13).

**Defeito encontrado durante a própria correção:** seis iniciações simultâneas geravam deadlock
`40P01` (2×500, zero 201) — a Fase A travava charge→payment e a Fase C atualizava payment→charge.
Corrigido invertendo a Fase C para charges→payments. **Invisível no PGlite**, que serializa
transações num mutex: só apareceu na suíte de PostgreSQL real.

### 3.3 GREEN

- `finance-integrity.test.ts`: **14/14** (PGlite) — `fase1-green-pglite.log`.
- `finance-concurrency.pg.test.ts`: **4/4** em PostgreSQL real — dois workers com provider travado,
  disputa de claim ×30, seis iniciações simultâneas e worker como **processo de SO separado**.
- E2E: liquidação até `PAID` com API e worker em processos distintos, repasse 225000, extrato.

Critério do plano ("nenhuma escrita financeira fora de transação") verificado por inspeção: todos
os `postLedgerTransaction` recebem o executor de uma transação aberta pelo chamador
(`charges.ts:108` e `:258`, `settlement.ts:284/330/444/465`, `initiation.ts:117/178`).

**Estado: DONE.**

## 4. Fase 2 — Isolamento multi-tenant (P0-05)

### 4.1 Controle negativo (RED)

`fase2-red.log`: **27 dos 28 testes falharam** — 27 casos de referência entre organizações
aceitos (lead, visita, proposta, candidatura, vistoria, ambiente, mídia, ativos Meta, tarefa,
timeline) e **vazamento de consentimento LGPD**: a organização B lia o consentimento da A.

### 4.2 Correção — aplicação

Helper canônico em `apps/api/src/routes/helpers.ts` (`assertOwnedByOrg`, `assertAllOwnedByOrg`,
`assertOrgMember`) aplicado a **todo id vindo do corpo**, antes de qualquer escrita; resposta
uniforme `404 NOT_FOUND` para id de outra organização e para id inexistente (sem oráculo de
existência); `first()` lança `NOT_FOUND`; consentimento e screening sempre filtrados por
organização; ids polimórficos só aceitam tipos conhecidos. ADR-044.

### 4.3 Correção — banco (defesa em profundidade)

Migration `0013_tenant_composite_fks.sql` (editada à mão): `UNIQUE (org_id, id)` em nove tabelas e
**22 referências convertidas em FK composta** `(org_id, ref_id) → alvo (org_id, id)`.
`ON DELETE SET NULL` lista a coluna, porque `org_id` é `NOT NULL`. Pré-voo aborta a migração com
`RAISE EXCEPTION` se o banco já tiver referência entre organizações. ADR-045.

RED da defesa no banco (`fase2-db-red.log`): com a 0013 desabilitada, o `INSERT` direto de
`leads.party_id` com id de outra organização **é aceito** e a verificação SQL encontra a linha.
GREEN (`fase2-db-green.log`): os 10 inserts diretos são recusados com **23503**.

### 4.4 GREEN

`cross-org-reference.test.ts`: **30/30** — 27 casos de rota (404), consentimento, defesa no banco
(23503), controle positivo dentro da própria organização e a verificação SQL
`CROSS_ORG_VERIFY_SQL` ("zero linhas com referência a outra org"), que fica permanente.

**Estado: DONE.**

## 5. Dependências

| Item                                       | Resultado                                               |
| ------------------------------------------ | ------------------------------------------------------- |
| Next.js                                    | 16.3.0 → 16.3.4 (2 RCE críticas — P0-06)                |
| Fastify                                    | → 5.12.3                                                |
| Overrides                                  | `fast-uri@3: ^3.1.6`, `fast-uri@4: ^4.1.3`              |
| `pnpm audit --prod --audit-level=critical` | **exit 0 — 0 critical**                                 |
| Residual conhecido                         | 2 `high` de tooling Expo (image-size), NO_FIX_AVAILABLE |

## 6. Migrations

| Item                            | Resultado                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Novas nesta execução            | `0012_finance_integrity.sql` e `0013_tenant_composite_fks.sql` (ambas editadas à mão)                                                             |
| Aplicadas do zero               | sim — cluster descartável do E2E e banco criado/derrubado pelo `test:pg`                                                                          |
| `db:generate` (drift)           | **exit 0, sem drift** (`db-drift=NO`: nenhum arquivo novo nem alteração em `packages/db`)                                                         |
| Guardas de dados pré-existentes | 0012 (duplicatas de split e de provider id, pagamentos `PENDING` duplicados) e 0013 (referência entre organizações) abortam com `RAISE EXCEPTION` |

## 7. Financeiro

Dinheiro é liquidado **uma vez só** (trava + compare-and-set + business key no ledger), **só com
confirmação do provider** (o webhook registra, não decide) e **nada recebido se perde** (cobrança
cancelada, `SCHEDULED` ou `OVERDUE` tem destino contábil; recebimento sem cobrança aplicável vai
para conta transitória). Estorno e cancelamento passam pelo provider antes de qualquer lançamento.
Fila com tentativas por provider e estado terminal `DEAD`.

Provado em PostgreSQL real: **4/4** (`final-testpg.log`). Provado na stack integrada, com API e
worker em processos separados: **3/3** (`final-e2e.log`), incluindo liquidação até `PAID`.

## 8. Multi-tenant

Duas linhas de defesa: a aplicação responde `404` para id de outra organização (sem revelar
existência) e o banco recusa o vínculo com `23503`. A query `CROSS_ORG_VERIFY_SQL` cobre 42
relações e roda como teste permanente.

Cobertura residual — só aplicação + query de verificação, sem FK: ids polimórficos
(`tasks.related_entity_id`, `timeline_events.entity_id`), ids dentro de `jsonb`
(`meta_ad_profiles.media_selection`, `meta_creative_links.media_refs`,
`meta_sync_jobs.payload.mediaRefs`) e referências cujo alvo não ganhou `UNIQUE (org_id, id)`
(`listings`, `property_media`, `party_consents`, `contract_templates`).

## 9. Gates

Execução final sem cache, árvore limpa, no commit **`247c7eb`** (`final-gates-summary.txt`):

| Gate              | Comando                                      | Resultado                  | Duração |
| ----------------- | -------------------------------------------- | -------------------------- | ------- |
| Formatação        | `pnpm format:check`                          | **exit 0**                 | 34 s    |
| Lint              | `pnpm lint --force`                          | **exit 0** (26/26 tarefas) | 171 s   |
| Typecheck         | `pnpm typecheck --force`                     | **exit 0** (26/26 tarefas) | 141 s   |
| Testes            | `pnpm test --force`                          | **exit 0 — 462 testes**    | 304 s   |
| Build             | `pnpm build --force`                         | **exit 0**                 | 101 s   |
| Secret scan       | `pnpm security:scan`                         | **exit 0**                 | 3 s     |
| Audit critical    | `pnpm security:audit --audit-level=critical` | **exit 0 — 0 critical**    | 4 s     |
| Migrations        | `pnpm db:generate`                           | **exit 0 — sem drift**     | 5 s     |
| Concorrência real | `pnpm test:pg` (PostgreSQL 17.10)            | **4/4**                    | —       |
| E2E               | Playwright (stack e banco descartáveis)      | **3/3**                    | 1,1 min |

Testes por pacote: domain 96 · integrations 154 · tests-integration **137** · tests-contract 10 ·
web 10 · worker 9 · storage 8 · contracts 7 · meta-mcp 7 · ui 6 · api 5 · mobile 5 · config 4 ·
observability 4. `test:pg` (4) e Playwright (3) ficam fora do `pnpm test` por desenho: exigem
servidor PostgreSQL e navegador.

Contra a baseline, a suíte de integração foi de 93 para 137 testes: **+44 testes permanentes**,
mais os 4 de concorrência real — 48 no total, todos nascidos de defeito reproduzido.

### 9.1 O que a própria validação final encontrou

A validação foi repetida quatro vezes. Não por instabilidade: cada rodada expôs um defeito que a
anterior não alcançava, porque o turbo aborta o lint no primeiro pacote que falha — cada execução
revelava o pacote seguinte. Na quarta, o lint rodou com `--continue`, que executa todos os pacotes
mesmo com falha, e fechou 26/26. Os quatro achados foram corrigidos; nenhum foi silenciado nem
contornado com `skip`, `continue-on-error` ou asserção relaxada.

| Gate | Achado                                                                                                                                                        | Correção                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| lint | `charges` importado e nunca usado em `webhooks.ts` — resíduo da Fase 1, quando o webhook deixou de confirmar a cobrança                                       | import removido (`9ce5a39`)                |
| lint | `String(failed.rows[0]?.status ?? 'FAILED')` sobre `Record<string, unknown>`: o log de dead-letter podia gravar `[object Object]` no lugar de `FAILED`/`DEAD` | linha tipada na leitura (`fc30978`)        |
| lint | initializer de `body` nunca lido em `finance-fixtures.ts`                                                                                                     | initializer removido (`247c7eb`)           |
| test | `metaJobs.test.ts`: `beforeAll` estourou o timeout padrão de 10 s ao subir PGlite sob carga — a suíte falhou e **os 5 testes não chegaram a executar**        | `apps/worker/vitest.config.ts` (`247c7eb`) |

O último achado é o que mais afeta a confiança na suíte: `apps/worker` **não tinha
`vitest.config.ts`**, então rodava suítes que sobem PGlite no `beforeAll` com o timeout padrão de
10 s, enquanto `tests/integration` já documentava no próprio arquivo que PGlite é pesado e exige
`hookTimeout: 120_000` e execução sequencial. Na mesma rodada, `channelJobs.test.ts` fechou em
9 736 ms — a suíte vivia na borda do limite. O worker recebeu a acomodação já convencionada no
repositório; nenhuma asserção foi alterada. Verificação: worker isolado passa 4 arquivos /
9 testes em duas execuções seguidas.

## 10. P0

| P0        | Descrição                                 | Status         | Prova                                                               |
| --------- | ----------------------------------------- | -------------- | ------------------------------------------------------------------- |
| **P0-01** | duplo crédito/repasse                     | **FECHADO**    | `finance-integrity` 14/14; `finance-concurrency.pg` 4/4 (2 workers) |
| **P0-02** | estorno forjável por webhook              | **FECHADO**    | webhook não estorna; estorno só com confirmação do provider         |
| **P0-03** | dinheiro recebido sem registro            | **FECHADO**    | `SCHEDULED`/`OVERDUE`/cancelada com destino contábil                |
| **P0-05** | isolamento por referência + consentimento | **FECHADO**    | 30/30 + FKs compostas (23503) + verificação SQL permanente          |
| **P0-06** | dependências críticas (Next RCE)          | **FECHADO**    | Next 16.3.4; `pnpm audit` sem critical                              |
| P0-04     | contrato assinado regenerável             | FORA DE ESCOPO | Fase 3 / G2                                                         |
| P0-07     | entrada monetária "3.500" → R$ 3,50       | FORA DE ESCOPO | Fase 4 / G2                                                         |

## 11. Gate

**G1: PASSED.**

Critério do plano (§5): "CI verde sem cache; audit sem critical; P0-01, P0-02, P0-03, P0-05, P0-06
fechados com testes permanentes; E2E automático 3/3 + liquidação PAID na stack com API e worker
separados". Os quatro itens foram cumpridos e estão medidos em §9 e §10, com a ressalva de §2
sobre o CI (execução local registrada em vez de execução no GitHub, por falta de autorização para
push).

## 12. Bloqueadores restantes

| Bloqueador                                                                                  | Natureza                      | Impacto no G1            |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------ |
| Branch não publicada — nenhum push foi feito                                                | decisão do usuário            | nenhum                   |
| CI do GitHub não executado (execução local equivalente registrada, permitida pelo critério) | decorre do item acima         | nenhum                   |
| Cobertura residual do isolamento sem FK: ids polimórficos e ids em `jsonb` (§8)             | risco conhecido e documentado | nenhum                   |
| 2 `high` de tooling Expo (image-size), NO_FIX_AVAILABLE                                     | dependência externa           | nenhum (gate é critical) |
| P0-04 e P0-07 abertos                                                                       | fora do escopo do G1          | nenhum (G2)              |

Nenhum item foi classificado como "aceitável" para fechar o gate: os quatro achados da validação
final foram corrigidos, e o que permanece aberto está fora do escopo do G1 ou depende de decisão
do usuário.

## 13. Próximo passo

**G2 (Fases 3 e 4).** Fase 3: contrato assinado imutável e decisão de crédito auditável (P0-04,
P1-06, P1-11 interno, P2-08). Fase 4: desbloquear fluxos no frontend, incluindo a entrada
monetária (P0-07, P1-01..05, P1-16, P1-17).

Antes disso, duas decisões do usuário: **publicar a branch** (nenhum push foi feito) e se o CI do
GitHub deve rodar para substituir a execução local registrada.

## 14. Commits

| Commit    | Assunto                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `ebea513` | docs: add 2026-09-10 technical audit                                     |
| `5def4aa` | chore: harden CI and dependency gates (Fase 0 / G1)                      |
| `ca7c92b` | test: reproduce financial integrity defects (P0-01/P0-02/P0-03)          |
| `ab4fff2` | test: reproduce cross-org references and consent leak (P0-05)            |
| `c7d3802` | fix: enforce organization ownership on foreign references (P0-05)        |
| `bf9426c` | fix: make money settlement atomic, idempotent and provider-authoritative |
| `0ac53f8` | merge: isolamento multi-tenant por referência (Fase 2 / P0-05)           |
| `212e2af` | fix: enforce tenant isolation with composite foreign keys (P0-05)        |
| `9ce5a39` | fix: remove unused charges import from payments webhook                  |
| `fc30978` | fix: type inbox dead-letter status and drop dead imports                 |
| `247c7eb` | test: stabilize worker PGlite suite and fix lint in finance fixtures     |

ADRs registrados nesta execução: **ADR-037 … ADR-045** (`docs/DECISIONS.md`).
