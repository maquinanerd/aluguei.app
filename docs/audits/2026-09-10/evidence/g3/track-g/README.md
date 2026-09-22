# Evidências — G3, trilha G (banco: CHECK de domínio fechado, bigint nos totais, índices no schema)

Escopo (linha G do `G3_PLAN.md`, P2-12 em `02_DATABASE_AUDIT.md` — DB-4, DB-5 e DB-6 — e em
`10_TECH_DEBT_AND_BUGS.md`): CHECK nas colunas de domínio fechado, `bigint` nos totais em centavos
e índices parciais declarados no schema, tudo na migration **0022**
(`packages/db/drizzle/0022_domain_checks_bigint_totals.sql`). Rascunhos de decisão em
`docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_G.md`.

Já estava feito e **não foi refeito**: o runner com trava consultiva (trilha F, G3F-10), o índice
parcial da concessão ativa do portal e os CHECKs do WhatsApp (trilha E2, 0021), e os CHECKs das
trilhas C e D (locação, pessoa, visita, proposta, caixa de saída) e do G2 (candidatura, sugestão
de IA, documento).

Logs desta máquina (Windows 11, Node 24, pnpm 11.15.1), sem cores ANSI. Sem efeito externo:
providers FAKE, IA mock, nenhuma credencial real; o banco de homologação **não** foi consultado.
Cada arquivo começa com o comando, a árvore e a data (UTC) e termina com `# exit=<código>` (o
código do processo que rodou o comando). Um `*-red` é o teste permanente rodando **sem** a
correção e precisa falhar; o `*-green` é o mesmo teste com ela.

Base: `origin/main` em `bef9660` (última migration 0021). Commits: `293ebf0` testes RED →
`f88130e` correção (schema, migration 0022, domínio) → `6f6af3e` rascunhos de ADR → este
commit de evidências.

PostgreSQL real: cluster descartável `initdb -A trust -E UTF8 --locale=C` em `tmp/pgdata` do
worktree (ignorado pelo git), porta 54337, parado e removido ao final. Playwright com
`WEB_PORT=3370 API_PORT=4370 PG_PORT=5603`.

## Inventário

Levantado no banco migrado do zero até a 0021 (`information_schema`, `pg_constraint`,
`pg_indexes`) e conferido contra `packages/domain`, `packages/contracts` e o que o código grava.

### CHECK de domínio fechado — 52 novos na 0022

Nome `<tabela>_<coluna>_valid`, montado por `domainCheck` (`packages/db/src/schema/checks.ts`).
Fonte da lista: **D** = constante de `packages/domain`; **C** = enum de `packages/contracts`
(usado quando o domínio não tem a constante). O teste `g3-g-schema-domain.test.ts` compara cada
CHECK do banco migrado com a fonte.

| Área       | Coluna                                              | Fonte                                                          |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------- |
| CRM        | `leads.status`                                      | D `FUNNEL_STATUSES`                                            |
| CRM        | `party_roles.role`                                  | C `partyRoleSchema`                                            |
| CRM        | `tasks.status`                                      | C `taskStatusSchema`                                           |
| Imóveis    | `properties.status`, `properties.property_type`     | C `propertyStatusSchema`, `propertyTypeSchema`                 |
| Imóveis    | `property_media.kind`                               | C `mediaKindSchema`                                            |
| Imóveis    | `listings.status`                                   | D `LISTING_STATUSES`                                           |
| Portal     | `portal_access.kind`                                | C `portalKindSchema`                                           |
| Canais     | `listing_channel_publications.channel`, `.status`   | D `CHANNEL_TYPES`, `CHANNEL_PUBLICATION_STATUSES`              |
| Canais     | `channel_sync_jobs.channel`, `.job_type`, `.status` | D `CHANNEL_TYPES`, `CHANNEL_JOB_TYPES`, `CHANNEL_JOB_STATUSES` |
| WhatsApp   | `conversations.status`                              | D `CONVERSATION_STATUSES`                                      |
| WhatsApp   | `messages.direction`, `.sender_type`                | C `messageSchema`                                              |
| WhatsApp   | `conversation_intents.intent`, `.extracted_by`      | C `conversationIntentSchema`                                   |
| Locação    | `rental_applications.status`                        | D `RENTAL_APPLICATION_STATUSES`                                |
| Locação    | `screening_results.decision`                        | C `screeningResultSchema`                                      |
| Contrato   | `contract_templates.status`                         | C `contractTemplateSchema`                                     |
| Contrato   | `contracts.status`                                  | D `CONTRACT_STATUSES`                                          |
| Contrato   | `contract_parties.role`                             | C `contractPartySchema`                                        |
| Assinatura | `signature_envelopes.status`                        | C `signatureEnvelopeSchema`                                    |
| Assinatura | `signature_events.event_type`                       | C `signatureWebhookEventSchema`                                |
| Vistoria   | `inspections.type`, `inspections.status`            | C `inspectionTypeSchema`; D `INSPECTION_STATUSES`              |
| Vistoria   | `inspection_media.kind`                             | C `inspectionMediaKindSchema`                                  |
| Vistoria   | `inspection_transcripts.status`                     | C `inspectionTranscriptSchema`                                 |
| Vistoria   | `inspection_ai_suggestions.kind`                    | C `suggestionKindSchema`                                       |
| Vistoria   | `inspection_observations.category`, `.severity`     | C `observationCategorySchema`, `severitySchema`                |
| Vistoria   | `inspection_observations.source`, `.status`         | C `inspectionObservationSchema`                                |
| Vistoria   | `inspection_comparisons.status`                     | C `inspectionComparisonSchema`                                 |
| Financeiro | `leases.status`                                     | D `LEASE_STATUSES`                                             |
| Financeiro | `lease_amendments.index_name` (anulável)            | C `leaseIndexNameSchema`                                       |
| Financeiro | `charges.status`                                    | D `CHARGE_STATUSES`                                            |
| Financeiro | `payments.method`, `payments.status`                | C `paymentMethodSchema`; D `PAYMENT_STATUSES`                  |
| Financeiro | `split_allocations.role`                            | D `SPLIT_ALLOCATION_ROLES` (novo: antes era só um tipo)        |
| Financeiro | `payouts.status`                                    | C `payoutSchema`                                               |
| Financeiro | `ledger_accounts.type`                              | C `ledgerAccountSchema`                                        |
| Financeiro | `reconciliations.status`                            | C `reconciliationSchema`                                       |
| Financeiro | `party_bank_accounts.status`                        | C `bankAccountSchema`                                          |
| Meta Ads   | `meta_connections.status`                           | C `metaConnectionStatusSchema`                                 |
| Meta Ads   | `meta_assets.kind`                                  | C `metaAssetKindSchema`                                        |
| Meta Ads   | `meta_ad_profiles.objective`, `.status`             | C `metaObjectiveSchema`, `metaAdProfileStatusSchema`           |
| Meta Ads   | `meta_campaign_links.objective`, `.status`          | C `metaObjectiveSchema`, `metaCampaignStatusSchema`            |
| Meta Ads   | `meta_sync_jobs.job_type`                           | C `metaJobTypeSchema`                                          |

Os 13 CHECKs de vocabulário que já existiam (`organizations.status`, `email_outbox.kind/status`,
`parties.type/status`, `party_identities.kind`, `party_documents.kind`, `visits.status`,
`proposals.status`, `rental_applications.decision_source`, `inspection_ai_suggestions.status`,
`lease_amendments.kind`, `whatsapp_connections.status`) não mudaram e também entram na comparação
com o domínio: 65 colunas presas ao domínio no total.

### Colunas de texto que ficaram sem CHECK, e por quê

Não há fonte única para a lista (nem constante no domínio, nem enum no contrato), ou o valor vem de
fora. Um CHECK aqui seria uma quarta cópia sem teste; cada uma pede antes a constante no domínio.

| Coluna                                                                                                                                                                                                 | Motivo                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `webhook_inbox.status`, `meta_sync_jobs.status`                                                                                                                                                        | Fila; vocabulário só em comentário e nos jobs (a do Meta tem `CANCELLED`, a do canal não)                                                 |
| `split_allocations.status`, `screening_requests.status`, `screening_requests.purpose`                                                                                                                  | Sem constante nem enum de contrato                                                                                                        |
| `ledger_accounts.code`, `ledger_entries.reference_type`                                                                                                                                                | Vocabulário só em `apps/api/src/ledger.ts` (`LEDGER_ACCOUNTS`) e `finance/settlement.ts`; o contrato expõe `z.string()`                   |
| `ledger_entries.entry_type`                                                                                                                                                                            | Já fechado por `ledger_entries_sign_matches_type` (só `DEBIT` positivo ou `CREDIT` não positivo passam)                                   |
| `meta_adset_links.status`, `meta_creative_links.status`, `meta_ad_links.status`                                                                                                                        | Contrato `z.string()` (`metaCampaignDetailSchema`)                                                                                        |
| `meta_assets.status`                                                                                                                                                                                   | Vem do provider (`MetaAssetInfo.status`)                                                                                                  |
| `party_bank_accounts.kind`                                                                                                                                                                             | Contrato `z.string()`                                                                                                                     |
| `*.provider` (`reconciliations`, `screening_*`, `signature_*`, `webhook_inbox`, `payments`)                                                                                                            | Nome de integração; `reconciliations.provider` recebe `NONE` sem provider (o contrato é `z.string()`)                                     |
| `timeline_events.entity_type`                                                                                                                                                                          | **Divergência**: o código grava `CONVERSATION` e `LISTING`, que `timelineEntityTypeSchema` não lista; CHECK pelo contrato quebraria rotas |
| `audit_events.action`, `audit_events.entity_type`, `meta_audit_events.*`                                                                                                                               | Trilha de auditoria: não pode recusar registro nem reescrever o histórico quando uma ação muda de nome                                    |
| `timeline_events.event_type`, `meta_webhook_events.*`, `tasks.related_entity_type`, `email_outbox.related_entity_type`, `leads.source`, `leads.channel`, `leases.end_reason`, `party_consents.purpose` | Texto aberto (origem, finalidade, motivo, referência genérica)                                                                            |
| `users.status`, `conversations.channel`, `messages.message_type`                                                                                                                                       | Só um valor gravado hoje (`ACTIVE`, `whatsapp`, `TEXT`) e nenhuma constante                                                               |
| `payment_attempts.status`, `fake_provider_charges.status`                                                                                                                                              | Tabela órfã (DB-8) e tabela só do provider FAKE                                                                                           |
| `*.mime_type`                                                                                                                                                                                          | Lista de upload validada no contrato; muda com o produto, não é estado                                                                    |

`memberships.role` e `member_invites.role` já são o enum `role` do PostgreSQL (`pgEnum`).

### `bigint` nos totais em centavos — 2 colunas

As 34 colunas `*_cents` eram `int4`. Viram `bigint` (drizzle `bigint(..., { mode: 'number' })`, lido
como `number`, exato até 2^53 − 1) só as que guardam **soma de muitas linhas**:

| Coluna                                 | Por que estoura                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `reconciliations.local_total_cents`    | `processReconcileJob` soma **todas** as cobranças `PAID` da organização (`paymentJobs.ts`) |
| `reconciliations.provider_total_cents` | Soma das cobranças do provider                                                             |

As outras 32 continuam `int4`: cada uma é o valor de uma linha — cobrança e suas parcelas, pagamento,
split, repasse, lançamento do ledger, aluguel, orçamento de lead/intenção, orçamento e teto de
orçamento de anúncio (`meta_org_settings.max_lifetime_budget_cents` padrão R$ 1.000.000). Saldos do
ledger, totais do painel (`sum(...)`, `bigint` no PostgreSQL, lido com `mapWith(Number)`) e do
portal (soma em JavaScript) não têm coluna. Nenhuma coluna guarda gasto (spend): os insights ficam
em `jsonb`.

### Índices e CHECKs declarados no schema

O teste de paridade compara o banco migrado com o schema do drizzle (`getTableConfig`). Até a 0021,
um único objeto existia só no SQL escrito à mão:

| Objeto                                                                                 | Antes                                  | Depois                                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `party_consents_active_unique` (`UNIQUE (party_id, purpose) WHERE revoked_at IS NULL`) | Só em `0007_parallel_ma_gnuci.sql:151` | Declarado em `crm.ts`; a 0022 faz `DROP INDEX IF EXISTS` e recria com a definição do schema |

Os demais índices parciais (`charges_provider_charge_unique`, `payments_provider_payment_unique`,
`payments_charge_pending_unique`, `payouts_payment_party_unique`,
`ledger_entries_org_business_key_account_unique`, `inspection_observations_suggestion_unique`,
`portal_access_org_party_kind_active_unique`) e todos os CHECKs já estavam no schema. Ficam fora,
porque o drizzle não os modela: as funções e gatilhos de imutabilidade do contrato da 0014.

## RED

Árvore = conteúdo de `293ebf0` (testes novos, sem a correção, sem 0022).

| Arquivo          | O que prova                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema-red.txt` | PGlite, **57 de 72 falham**: falta o CHECK em cada uma das 52 colunas; `leads` aceita `CONTACTED`; o banco tem `party_consents_active_unique` e o schema não; os dois totais da conciliação são `integer`. Passam os 13 CHECKs que já existiam (iguais ao domínio), a paridade de CHECKs e o teste de CHECK não mapeado                                                                        |
| `pg-red.txt`     | PostgreSQL real, **4 de 5 falham**: não há 0022 (o pré-voo não aborta com dado fora do domínio); `CONTACTED`, `TODO`, `FLAT`, `OWNER_X`, `GUEST`, `TERMINATED`, `PAID_LATE`, `CASH` e `SETTLED` são aceitos; a conciliação quebra com `value "3000000000" is out of range for type integer`; o total `9007199254740991` também. Passa o consentimento ativo único (o índice já existia no SQL) |

## GREEN

Árvore = `f88130e`.

| Arquivo                      | O que prova                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema-green.txt`           | PGlite 73/73: 65 CHECKs iguais ao domínio/contrato (nulo aceito só em `index_name` e `decision_source`); nenhum CHECK de lista sem mapeamento; `leads` recusa `CONTACTED` (23514) e aceita os 8 status do funil; pré-voo da 0022 com as mesmas colunas e listas dos `ADD CONSTRAINT`; índices, UNIQUE e CHECKs do banco = schema; totais em `bigint`                                                                        |
| `pg-green.txt`               | PostgreSQL real 5/5: pré-voo aborta sem aplicar nada e nomeia `properties.property_type <id> = FLAT`, `leads.status <id> = CONTACTED`, `tasks.status <id> = TODO`, `leases.status <id> = TERMINATED` (a linha válida não aparece); corrigidos os dados, migra; 9 valores fora do domínio → 23514; conciliação grava e lê 3.000.000.000 como `number`; `MAX_SAFE_INTEGER` volta exato; consentimento ativo duplicado → 23505 |
| `integration-regression.txt` | Integração completa (PGlite) 342/342 em 42 arquivos — **nenhum dado de teste precisou mudar** para os CHECKs novos                                                                                                                                                                                                                                                                                                          |
| `domain-regression.txt`      | Domínio 217/217 (com `SPLIT_ALLOCATION_ROLES`)                                                                                                                                                                                                                                                                                                                                                                              |
| `pg-regression.txt`          | `pnpm test:pg` em `f88130e`: 37/37 em 12 arquivos                                                                                                                                                                                                                                                                                                                                                                           |

## Gates (sem cache, commit `6f6af3e`)

| Arquivo                                 | Resultado                                                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gates-summary.txt`                     | install, format, lint, typecheck, test, build, secret scan, audit critical e `db:generate`: todos exit 0; `db-drift=NO`                                                                                                                                      |
| `gates-install.txt` … `gates-dbgen.txt` | Saída de cada gate                                                                                                                                                                                                                                           |
| `gates-test-counts.txt`                 | 1165 testes em 14 pacotes (1092 antes da trilha + 73), nenhum ignorado                                                                                                                                                                                       |
| `gates-audit-critical.txt`              | 22 high e 9 moderate de antes da trilha, nenhum critical                                                                                                                                                                                                     |
| `testpg.txt`                            | `pnpm test:pg` (`TEST_DATABASE_URL=postgresql://postgres@localhost:54337/postgres`): **37/37** em 12 arquivos (32 antes + 5)                                                                                                                                 |
| `e2e-full.txt`                          | Playwright completo, **43/43**, exit 0 (web 3370, API 4370, PostgreSQL 5603)                                                                                                                                                                                 |
| `testpg-run1-sem-pg_dump-no-PATH.txt`   | Primeira execução do `test:pg` em `f88130e`: 34/37, exit 1 — só a suíte de backup falhou com `spawn pg_dump ENOENT` porque o `bin` do PostgreSQL não estava no `PATH` do processo. Com ele no `PATH`, 37/37 (`pg-regression.txt`). Nada foi mudado no código |

Depois do Playwright, `apps/web/next-env.d.ts` foi restaurado antes do commit.

## Ajustes nos testes

Nenhuma asserção foi removida ou afrouxada, e nenhum teste existente mudou.

- Antes do `pg-red.txt` gravado: a primeira execução falhou por preparação (os `insert` crus não
  passavam `id`, e a coluna não tem default no banco — o id vem do `$defaultFn` do drizzle). Os
  inserts passaram a gerar o id; o `pg-red.txt` é a segunda execução, já falhando pelo motivo certo.
- Em `f88130e`: o teste do pré-voo verificava que `QUALIFIED` não aparecia na falha, mas o erro do
  driver traz o texto da query junto com a mensagem, e o SQL do pré-voo lista `QUALIFIED` como
  permitido. A asserção passou a exigir que o **id** da linha válida não apareça — o que o teste
  queria provar. No mesmo commit entrou o teste de paridade entre o pré-voo e os `ADD CONSTRAINT`
  da 0022, e ajustes de tipo e lint no teste novo do schema.
- `tests/integration` passou a depender de `@aluguei/contracts` (fonte do vocabulário); o
  `pnpm-lock.yaml` ganhou 3 linhas.

## Risco no deploy da 0022

- **A 0022 pode abortar** se o banco de homologação tiver alguma linha com valor fora do
  vocabulário em uma das 52 colunas (ou consentimento ativo duplicado). Não foi verificado: o banco
  de homologação não foi consultado. Por que é improvável: as listas são as constantes que as
  próprias rotas e jobs usam para validar; a integração inteira (342), o `test:pg` (37) e o
  Playwright (43) passam sem mudar dado; nas buscas no código não apareceu gravação de valor fora
  das listas; os dois vocabulários que já mudaram (sugestão de IA, 0017; WhatsApp `ACTIVE`, 0021)
  foram convertidos nas próprias migrations. O que ainda pode existir: linha gravada à mão por SQL
  ou por uma versão antiga do código com outro valor.
- **Se abortar, nada é aplicado** (as pendentes rodam numa transação só, sob a trava consultiva do
  runner): o banco fica na 0021 e a mensagem lista `tabela.coluna <id> = <valor>` de cada linha (até
  20 por coluna, com a contagem do resto). Corrige-se com `UPDATE` para um valor do domínio e
  aplica-se de novo.
- **Travas**: cada `ADD CONSTRAINT ... CHECK` lê a tabela inteira sob `ACCESS EXCLUSIVE`, e o
  `ALTER COLUMN ... TYPE bigint` reescreve `reconciliations`. Com o volume da homologação, é
  instantâneo; num banco grande, pediria `NOT VALID` + `VALIDATE CONSTRAINT` em janela separada.
- **Depois da 0022**, acrescentar um valor a qualquer dessas listas exige migration (o teste de
  paridade falha se o domínio mudar sozinho).

## Verificação do orquestrador (`orquestrador/`)

Refeita pelo orquestrador em `7596a0a`, sem mudança de código.

| Arquivo             | Resultado                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `gates-summary.txt` | 9 gates sem cache com exit 0; `db-drift=NO`. `gates-test-counts.txt`: 1165 testes em 14 pacotes, nenhum ignorado |
| `testpg.txt`        | `pnpm test:pg` num cluster PostgreSQL 17 descartável na porta 54337, com `pg_dump` 17 no PATH: 37/37             |
| `e2e-full.txt`      | Playwright completo: 43/43 (web 3370, API 4370, PostgreSQL 5603)                                                 |

Conferido também que as três colunas dos achados paralelos (`timeline_events.entity_type`,
`reconciliations.provider` e o filtro de `reconciliations.status`) não recebem CHECK que recuse o
que o código grava: as duas primeiras ficaram sem CHECK, e o único ponto que grava
`reconciliations.status` (`apps/worker/src/paymentJobs.ts`) usa `MATCHED` ou `DISCREPANCY`, que
estão na lista.
