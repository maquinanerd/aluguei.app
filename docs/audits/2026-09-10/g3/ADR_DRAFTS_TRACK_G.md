# G3 — Rascunhos de ADR da trilha G (banco: CHECK de domínio, bigint nos totais e schema como fonte)

Rascunhos para consolidar em `docs/DECISIONS.md` no fechamento do G3. Evidência em
`docs/audits/2026-09-10/evidence/g3/track-g/` (o `README.md` de lá tem o inventário coluna por
coluna). A trilha G fecha o que restava do P2-12 (`02_DATABASE_AUDIT.md`, DB-4, DB-5 e DB-6), tudo
na migration **0022**. O runner com trava consultiva (G3F-10, trilha F), o índice parcial do portal
e os CHECKs do WhatsApp (0021, trilha E2) e os CHECKs das trilhas C e D já existiam e não foram
refeitos.

## Rascunho G-1 — CHECK nas colunas de domínio fechado, preso ao domínio (P2-12, DB-4)

Status: Proposto.

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

## Rascunho G-2 — `bigint` nos totais que somam muitas linhas (P2-12, DB-5)

Status: Proposto.

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

## Rascunho G-3 — O schema do drizzle é a fonte de índices e CHECKs (P2-12, DB-6)

Status: Proposto.

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

## Pendências (fora da trilha G)

- Colunas de domínio que ficaram sem CHECK por falta de fonte única (lista e motivo no README):
  statuses das filas (`webhook_inbox`, `meta_sync_jobs`), `split_allocations.status`,
  `screening_requests.status`, códigos e tipos de referência do ledger (vocabulário só em
  `apps/api/src/ledger.ts` e `finance/settlement.ts`), statuses dos links de anúncio (contrato
  `z.string()`), `meta_assets.status` (vem do provider), providers e tabelas órfãs. Cada uma pede
  primeiro a constante no domínio.
- Divergências encontradas no inventário e não corrigidas aqui (código fora do escopo do banco):
  `timeline_events.entity_type` recebe `CONVERSATION` e `LISTING`, que o contrato
  (`timelineEntityTypeSchema`) não lista; `reconciliations.provider` recebe `NONE` sem provider
  configurado, e o contrato não descreve o campo além de `z.string()`; o filtro
  `listReconciliationsQuerySchema.status` aceita `PENDING | RUNNING | COMPLETED | FAILED`, mas a
  coluna guarda `PENDING | MATCHED | DISCREPANCY`.
- As colunas `*_cents` por linha não têm teto no contrato da API: valor acima de R$ 21 milhões numa
  cobrança ou num aluguel chega ao banco e falha no `int4` (não verificado como a API responde).
