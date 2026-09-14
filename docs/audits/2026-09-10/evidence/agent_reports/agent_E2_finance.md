# Auditoria E2 — Integridade financeira (ALUGUEI.APP)

- Data: 2026-09-10 · Worktree `aluguei-technical-audit-6cea11` · HEAD `a6683bf`
- Método: leitura estática do código atual (Read/Grep/Glob). Nenhum build/test/servidor executado. `docs/` citado apenas como evidência histórica.
- Legenda de status:
  - **CONFIRMADO (leitura)**: o comportamento é determinado sem ambiguidade pelas linhas citadas.
  - **SUSPEITA (requer prova)**: depende de concorrência, timing ou comportamento de provider externo. A prova correspondente está em §11.
- Severidade: **P0** perda, corrupção ou duplicação de dinheiro / double-credit · **P1** alto risco financeiro ou funcional com impacto monetário · **P2** inconsistência contábil ou operacional · **P3** qualidade.
- Caminhos relativos à raiz do worktree.

---

## 0. Sumário executivo e estado de ativação

**Nenhum caminho do código atual processa dinheiro real de ponta a ponta.** Isso torna vários P0 _latentes_: eles ativam no instante em que a integração real for consertada.

| Configuração                                                               | O que acontece hoje                                                                                                                                                                                                                           | Evidência                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENT_PROVIDER=ASAAS` + `ASAAS_API_KEY`                                 | `createCharge` é chamado sem `payerName`/`payerDocument` e o adapter lança `CUSTOMER_REQUIRED`. O registry não injeta `customerId`. Resultado: toda iniciação de pagamento gera 500.                                                          | `apps/api/src/routes/charges.ts:235-239`, `apps/api/src/routes/portal.ts:508-512`, `packages/integrations/src/payments/asaas.ts:333-344`, `packages/integrations/src/payments/registry.ts:24-25`, `apps/api/src/errors.ts:60-65` |
| ASAAS: webhook real                                                        | A rota valida o schema _interno_ `{provider,eventType,providerEventId,providerChargeId,amountCents}`. O corpo real do Asaas (`{id,event,payment{...}}`) falha no zod e recebe 400. `mapAsaasPaymentWebhook` existe mas não é usado pela rota. | `apps/api/src/routes/webhooks.ts:280`, `packages/contracts/src/finance.ts:243-250`, `packages/integrations/src/payments/asaas.ts:449-467`, `packages/integrations/src/index.ts:54` (único uso fora de testes)                    |
| `PAYMENT_PROVIDER=FAKE`, API e worker em processos separados (deploy real) | O worker usa outra instância em memória, recriada a cada ciclo. `getChargeStatus` devolve `PENDING` e o crédito **nunca** ocorre.                                                                                                             | `apps/worker/src/index.ts:75`, `apps/worker/src/inboxJobs.ts:173-185`, `packages/integrations/src/payments/fake.ts:28-30`, `tests/e2e/src/main-journey.spec.ts:9-14`, `tests/e2e/scripts/boot-stack.mjs:88,111,115`              |
| In-process com a mesma instância FAKE (testes)                             | O fluxo chega a PAID, ledger e payout, e **qualquer webhook sem autenticação credita**.                                                                                                                                                       | `tests/integration/src/helpers.ts:20,56`, `tests/integration/src/finance.test.ts:53-55,237-249`                                                                                                                                  |

Problemas **ativos hoje**, independentes do provider:

- ledger lançado na criação de cobrança com 10% fixo;
- cancelamento sem reversão contábil, inflando a receita;
- cobrança duplicada no mesmo mês via `periodStart` livre;
- juros de 1% ao dia sem teto, persistidos na cobrança;
- entrada de aluguel "3.500" gravada como R$ 3,50;
- cobrança mensal perpétua, porque não existe encerramento de locação;
- pagamentos órfãos quando o provider falha;
- webhook de pagamentos sem segredo obrigatório em produção;
- estorno pela UI que não estorna no provider.

Transações de banco: **não existe `db.transaction` em nenhum fluxo financeiro**. O único uso no repositório é `apps/api/src/routes/auth.ts:58`. Também não existe `FOR UPDATE` em linhas de charge ou payment (os únicos `FOR UPDATE SKIP LOCKED` estão nos claims de fila: `apps/worker/src/inboxJobs.ts:105`, `channelJobs.ts:52`, `metaJobs.ts:72`).

---

## 1. Representação de dinheiro

### 1.1 Tipos no DB

CONFIRMADO (leitura): `packages/db/drizzle/0008_youthful_diamondback.sql:1-191` e `packages/db/src/schema/finance.ts`.

- Todas as colunas monetárias são `integer` (int4, máximo 2.147.483.647 centavos, ou R$ 21.474.836,47 por linha):
  - `charges.amount_cents/rent_cents/condo_fee_cents/late_fee_cents/interest_cents/taxes_cents/discount_cents` (`finance.ts:60-66`; SQL `0008:8-14`)
  - `payments.amount_cents` (`finance.ts:89`)
  - `split_allocations.amount_cents` (`finance.ts:154`)
  - `payouts.amount_cents` (`finance.ts:172`)
  - `ledger_entries.amount_cents`, com sinal (`finance.ts:211`)
  - `reconciliations.provider_total_cents/local_total_cents` (`finance.ts:236-237`)
  - `leases.monthly_rent_cents/condo_fee_cents` (`finance.ts:35-36`)
  - `property_financial_terms.*_cents` (`packages/db/src/schema/properties.ts:86-89`)
- Percentuais em bps `integer`: `split_rules.agency_share_bps` (default 1000) e `landlord_share_bps` (default 9000) (`finance.ts:132-133`). `property_owners.ownership_share_pct` é `integer` percentual (`properties.ts:110`).
- **Não há nenhum `CHECK`** (valor ≥ 0, status válido, Σ ledger = 0) nas migrations. Status são `text` livres (`finance.ts:32,59,91,155,173`).
- **P2, int4 em total acumulado:** `reconciliations.local_total_cents` recebe a soma de **todas** as cobranças PAID da org, desde sempre (`apps/worker/src/paymentJobs.ts:243-247,256`). Ao passar de R$ 21,47 mi acumulados, o INSERT falha com *integer out of range* e a reconciliação quebra todo dia. Por exemplo, 500 contratos × R$ 2.500 × 18 meses já estoura. CONFIRMADO (leitura).

### 1.2 Tipos TS

CONFIRMADO (leitura).

- `number` em todo o domínio, sem tipo "branded".
- Checagem `Number.isSafeInteger` só existe em `add`, `sub` e `mulBpsFloor` (`packages/domain/src/finance/money.ts:4-30`).
- Aritmética crua fora do helper:
  - `packages/domain/src/finance/split.ts:22` (`amountCents - commission`)
  - `apps/api/src/routes/charges.ts:107,111`
  - `apps/worker/src/paymentJobs.ts:213` (`monthlyRentCents + condoFeeCents`)
- Contratos zod: centavos `int().nonnegative()` nos DTOs (`packages/contracts/src/finance.ts:32-33,45-51,61,73`). `amountOverrideCents` e `monthlyRentCents` são `int().positive()` **sem limite superior** (`finance.ts:156`; `packages/contracts/src/property.ts:131`). Valores acima de int4 geram 500 no INSERT (P3).

### 1.3 Float, `Math.round`, divisões e percentuais

CONFIRMADO (leitura).

| Local                                                                                                  | Operação                                                                       | Avaliação                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/finance/money.ts:29`                                                              | `Math.floor((cents*bps)/10_000)`                                               | Divisão em float. É exata enquanto `cents*bps < 2^53`. O comentário "sem float" (`money.ts:24`) é impreciso (P3).                                                                                                                                    |
| `money.ts:41,45`                                                                                       | `Math.floor((total*w)/sum)`, `%`                                               | Mesma observação (P3).                                                                                                                                                                                                                               |
| `apps/api/src/routes/charges.ts:107,111`                                                               | `Math.floor((rentCents*1000)/10_000)`                                          | 10% **literal**, ignora `split_rules` (P2, ver §4).                                                                                                                                                                                                  |
| `packages/integrations/src/payments/asaas.ts:193-199`                                                  | `centsToReais = Math.round(c)/100`; `reaisToCents = Math.round(v*100)`         | Fronteira com o provider (Asaas usa reais em float). Correto com `Math.round`. `reaisToCents` só é usado pelo mapper, que a rota não chama.                                                                                                          |
| `apps/web/src/app/app/properties/[id]/property-detail-client.tsx:616-632`                              | exibe `cents/100`; `toCents = Math.round(parseFloat(v.replace(',', '.'))*100)` | **P1**: `"3.500"` (o próprio placeholder, linha 691) vira 350 centavos. `"3.500,00"` vira `"3.500.00"`, depois 3.5, depois 350. Esse valor alimenta `leases.monthly_rent_cents` (`apps/api/src/routes/leases.ts:153`) e as cobranças.                |
| `apps/web/src/app/app/proposals/proposals-client.tsx:293`                                              | mesma conversão                                                                | Mesmo bug. A proposta não alimenta a locação (P3).                                                                                                                                                                                                   |
| `apps/web/src/app/app/crm/leads/leads-client.tsx:335`; `packages/domain/src/whatsapp/intents.ts:67-77` | `Math.round(x*100)`                                                            | Orçamento de lead. Os dois ramos de `parseBudgetValue` são idênticos (P3).                                                                                                                                                                           |
| Exibição                                                                                               | `cents/100` com `Intl.NumberFormat`                                            | Apenas display: `packages/ui/src/lib/format.ts:7`, `apps/web/src/lib/public-api.ts:55`, `apps/api/src/whatsapp/bot.ts:2`, `apps/web/src/app/dashboard/page.tsx:90`, `apps/web/src/app/app/leases/[id]/lease-detail-client.tsx:211-215` (bps para %). |
| Mobile                                                                                                 | nenhum código financeiro                                                       | O grep por `charges\|payments\|payouts\|ledger\|refund\|leases` em `apps/mobile` e `apps/meta-mcp` não encontra nada.                                                                                                                                |
| Portal (web)                                                                                           | usa `formatBRL`                                                                | Apenas exibição.                                                                                                                                                                                                                                     |
| Contrato                                                                                               | `{{monthlyRentCents}}` renderizado **como inteiro em centavos**                | O texto do contrato diz "ALUGUEL: 100000" (`apps/api/src/routes/contracts.ts:143`; `packages/domain/src/contract/template.ts:22`). Ambiguidade legal do valor, P2.                                                                                   |

---

## 2. `chargeCalc`: fórmula exata

Arquivo `packages/domain/src/finance/chargeCalc.ts`. CONFIRMADO (leitura).

- **Dias de atraso:** `max(0, floor((paidOn − dueDate)/86.400.000))` em calendário UTC (`:25-30`). Não há carência: 1 dia de atraso já dispara multa e juros.
- **Multa:** `floor(rent × lateFeeBps / 10.000)` se atraso > 0 (`:45`). Default `lateFeeBps = 200`, ou seja, **2% fixo** (`:18,41`). A base é só o aluguel (exclui condomínio).
- **Juros:** `floor(rent × (interestDailyBps × dias) / 10.000)` (`:46-48`). Default `interestDailyBps = 100`, ou seja, **1% AO DIA**, juros simples, **sem teto** (`:19,42`). A base é só o aluguel.
- **Total:** `max(0, rent + condo + multa + juros + taxes − discount)` (`:50-54`). Arredondamento: `floor` por componente, sempre a favor do locatário em menos de 1 centavo.
- **Origem dos percentuais:** constantes default. **Nenhum chamador passa `lateFeeBps` ou `interestDailyBps`** (`apps/api/src/routes/charges.ts:78-83,200-207`). Portanto não vêm de contrato, locação nem imóvel, e não existe coluna para eles. `taxesCents` e `discountCents` também nunca são informados por rota nenhuma (sempre 0).
- **Onde é aplicado:**
  1. Criação `POST /charges`, com `paidOn = dueDate`, logo sem encargos (`charges.ts:78-83`).
  2. Iniciação de pagamento pelo operador, que recalcula com `today = new Date().toISOString().slice(0,10)` (**dia UTC**) e **persiste** `amount_cents/late_fee_cents/interest_cents` na cobrança, **antes** de chamar o provider (`charges.ts:199-218`).
  - O scheduler e o portal **não** recalculam. O portal cobra `charge.amountCents` como está gravado (`apps/api/src/routes/portal.ts:508-512`), então os valores diferem conforme o caminho.
- **Achado de regra de negócio (P1), CONFIRMADO:**
  - 1% ao dia equivale a cerca de 30% ao mês. 30 dias de atraso somam 30% de juros + 2% de multa; 100 dias somam 100% do aluguel em juros.
  - A prática usual em locação é juros moratórios de **1% ao mês pro rata die** e multa contratual pactuada.
  - O teste unitário cristaliza a regra: `packages/domain/src/finance/finance.test.ts:34-43` espera juros de 5% para 5 dias.
  - Documentação histórica declara a mesma regra: `docs/RELATORIO_PRODUTO.md:137`.
- **Borda UTC (P2):** entre 21:00 e 23:59 BRT, `today` UTC já é o dia seguinte. Iniciar o pagamento nesse horário cobra 1 dia a mais (+1% do aluguel) e pode disparar a multa de 2% no próprio dia do vencimento (`charges.ts:199`).

---

## 3. Split

CONFIRMADO (leitura).

- **Algoritmo** (`packages/domain/src/finance/split.ts:19-27`):
  - `comissão = min(floor(rentCents × agencyShareBps / 10.000), amountCents)`
  - `landlord = amountCents − comissão`
  - Resultado: 2 alocações (AGENCY, LANDLORD). O resto de centavos vai para o proprietário. Multa, juros, condomínio e taxas vão 100% para o proprietário.
- **Origem da regra:**
  - `split_rules` é única por locação (`finance.ts:137`).
  - É criada na locação com **valores fixos** `agencyShareBps: 1000, landlordShareBps: 9000` (`apps/api/src/routes/leases.ts:159-165`).
  - **Não existe rota para alterar** a regra (grep: `splitRules` só aparece em `leases.ts:64,159` e `paymentJobs.ts:104`).
  - O worker usa `rule?.agencyShareBps ?? 1000` (`apps/worker/src/paymentJobs.ts:110`).
  - `landlordShareBps` é armazenado e **nunca usado** (P3).
  - A taxa de administração não vem do contrato.
- **Invariantes:**
  - Σ alocações = `payment.amountCents` vale por construção. Testado em `finance.test.ts:67-89`, `tests/contract/src/boundaries.test.ts:163-175` e `tests/integration/src/finance.test.ts:276-284`.
  - **"Nunca maior que o recebido" não é garantido.** A base é o valor _esperado_ do payment, não o valor efetivamente liquidado no provider: o `amountCents` do webhook é descartado (`paymentJobs.ts:44-45,184`) e `getChargeStatus` só retorna o status (`packages/integrations/src/payments/types.ts:1,20`). Ver F-23.
  - Não há unique em `split_allocations(payment_id, role)` (`finance.ts:158-161`).
- **Múltiplos proprietários: NÃO respeitados (P1), CONFIRMADO.**
  - A locação pega `propertyOwners ... .limit(1)` **sem ORDER BY**, ou seja, um proprietário arbitrário (`leases.ts:131-135`).
  - `split_rules.landlord_party_id` recebe só esse (`leases.ts:162`).
  - `ownership_share_pct` (`properties.ts:110`; gravado em `apps/api/src/routes/properties.ts:518-523`, sem validar Σ = 100) nunca é lido pelo split nem pelo payout.
  - `splitAmong` (maior resto) é exportado (`packages/domain/src/index.ts:130`) mas **não é usado** em nenhum app.
  - O coproprietário não vê nada no extrato do portal, que filtra por `party_id` (`apps/api/src/routes/portal.ts:639-645`).
  - O contrato também usa o primeiro proprietário (`apps/api/src/routes/contracts.ts:129-135`).

---

## 4. Ledger

CONFIRMADO (leitura).

### 4.1 Modelo

- `ledger_accounts` por org, com códigos `CASH`, `AR_RECEIVABLE`, `AGENCY_FEE_REVENUE`, `LANDLORD_PAYABLE`, criadas sob demanda (`apps/api/src/ledger.ts:7-20`; unique `(org_id, code)` em `finance.ts:197`).
- `ledger_entries` usa **uma linha por perna**, com `amount_cents` **com sinal** (débito +, crédito −) e `entry_type` derivado do sinal (`ledger.ts:60`). Valor 0 é gravado como `CREDIT`.
- Agrupamento por `transaction_id`, com `UNIQUE (transaction_id, account_id)` (`finance.ts:219`; SQL `0008:177`).
- `reference_type` e `reference_id` são texto livre, **sem unique** (`finance.ts:213-214,221`).

### 4.2 Todas as postagens (grep `postLedgerTransaction`: apenas estas 4)

| #   | Arquivo:linha                            | Evento                                 | Pernas                                                                                 | transaction_id |
| --- | ---------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- | -------------- |
| T1  | `apps/api/src/routes/charges.ts:103-113` | `POST /charges` (só cobrança manual)   | AR +amount; AGENCY_FEE_REVENUE −floor(rent×10%); LANDLORD_PAYABLE −(amount − comissão) | `randomUUID()` |
| T2  | `apps/worker/src/paymentJobs.ts:95-99`   | PAYMENT_CONFIRMED                      | CASH +payment; AR −payment                                                             | `randomUUID()` |
| T3  | `apps/worker/src/paymentJobs.ts:130-133` | criação do payout (status **PENDING**) | LANDLORD_PAYABLE +landlord; CASH −landlord                                             | `randomUUID()` |
| T2' | `apps/worker/src/paymentJobs.ts:155-158` | PAYMENT_REFUNDED (worker)              | AR +payment; CASH −payment                                                             | `randomUUID()` |

### 4.3 Garantias

- **Σ D = Σ C:** só existe verificação em código, por chamada (`ledger.ts:47-50`). Não há constraint nem trigger no DB, e **não há transação**: as pernas são inseridas uma a uma com `db`, em autocommit via `pg.Pool` (`ledger.ts:51-65`; `packages/db/src/client.ts:14-17`). Uma falha entre pernas deixa a transação desbalanceada persistida (F-05).
- **Idempotência: ilusória.** `transaction_id` é sempre `randomUUID()` nas 4 chamadas, então o `UNIQUE (transaction_id, account_id)` nunca deduplica reprocessamentos (F-19). `onConflictDoNothing` (`ledger.ts:64`) nunca dispara. A doc histórica afirma o contrário (`docs/DECISIONS.md:29`, `docs/THREAT_MODEL.md:76`).
- **Reversão:**
  - Estorno pela rota: **nenhum lançamento** (`charges.ts:310-371`).
  - Estorno pelo worker: só T2'. Não reverte T1 (receita e payable), T3 (payout), `split_allocations` nem `payouts`.
  - Cancelamento: **nenhum lançamento** (`charges.ts:273-308`).
- **Taxa da imobiliária:** reconhecida como receita **na criação da cobrança manual** (T1), com 10% literal. Nunca na liquidação. **Nunca** para cobranças do scheduler (`paymentJobs.ts:205-217` não lança nada). Nunca revertida.
- **Payout:** T3 é lançado **na criação do payout PENDING**. O ledger mostra saída de caixa que nunca ocorreu, porque não há execução de payout (§7).
- **Cálculo de saldo:** não existe no código.
  - `/ledger/entries` lista linhas cruas (`apps/api/src/routes/payments.ts:129-165`).
  - O relatório de receita soma `Math.abs(amount)` da conta de receita (`apps/api/src/routes/reporting.ts:272-281`). Um débito de reversão em receita seria **somado** como receita (latente, P2), e a receita de cobrança cancelada continua contando (F-07).

### 4.4 Rastro numérico, CONFIRMADO por aritmética das linhas citadas

Aluguel R$ 1.000, comissão 10%, pagamento iniciado 5 dias após o vencimento: multa 2.000 + juros 5.000 = 107.000 (`charges.ts:199-218`).

| Passo                    | CASH        | AR           | REVENUE | PAYABLE |
| ------------------------ | ----------- | ------------ | ------- | ------- |
| T1 (criação, 100.000)    | 0           | +100.000     | −10.000 | −90.000 |
| T2 (payment 107.000)     | +107.000    | −7.000       | −10.000 | −90.000 |
| T3 (payout 97.000)       | +10.000     | −7.000       | −10.000 | +7.000  |
| T2' (estorno via worker) | **−97.000** | **+100.000** | −10.000 | +7.000  |

- Cada transação é balanceada, mas os saldos ficam semanticamente errados:
  - AR fica negativo após a liquidação.
  - Após o estorno, o caixa fica negativo, o AR fica aberto numa cobrança REFUNDED (terminal) e a comissão continua como receita.
  - O payout continua PENDING.
- Cobrança do scheduler (sem T1), após T2 e T3: CASH +10.000, AR −100.000, PAYABLE +90.000, REVENUE 0. A comissão nunca é reconhecida.

---

## 5. Todos os caminhos que criam payment, marcam PAID ou postam ledger

Grep completo de inserts e updates em `apps/**`: `charges.ts:86,225,337,342`; `paymentJobs.ts:87,91,124,149,152,206`; `portal.ts:515`. Não há seeds ou scripts financeiros (grep em `scripts/` e `packages/db/src`: nada).

| Caminho                                                                  | Arquivo:linha                                                 | Cria payment                                                                       | Marca PAID         | Ledger                   | Transação | Lock    | Checagem de estado                                                                                                                | Unique contra 2º payment                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ | ------------------------ | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /charges`                                                          | `charges.ts:58-124`                                           | não                                                                                | não                | T1                       | não       | não     | —                                                                                                                                 | `(lease_id, period_start)` (`finance.ts:73`), mas `period_start` é data livre (F-08)                                                            |
| `POST /charges/:id/payment` (operador; UI "Receber", inclusive "Manual") | `charges.ts:161-271`; UI `charges-client.tsx:463-470,516-521` | **sim, a cada chamada**, PENDING, sem `provider_payment_id`                        | não                | não                      | não       | não     | status ∈ {SCHEDULED,OPEN,OVERDUE} (`:183-189`)                                                                                    | **nenhum** (`finance.ts:96-99` só tem índices não únicos)                                                                                       |
| `POST /portal/tenant/charges/:id/payment`                                | `portal.ts:471-543`                                           | sim, salvo se a _primeira linha retornada_ (sem ORDER BY) for PENDING (`:495-507`) | não                | não                      | não       | não     | só bloqueia PAID/CANCELLED (`:487`); permite SCHEDULED/REFUNDED                                                                   | nenhum                                                                                                                                          |
| `POST /webhooks/payments`                                                | `webhooks.ts:276-326`                                         | não                                                                                | não                | não                      | —         | —       | —                                                                                                                                 | dedup só por `PAY:${providerEventId}` (`:320`; unique `webhook_inbox(provider, provider_event_id)` em `packages/db/src/schema/whatsapp.ts:129`) |
| Worker `PAYMENT` / PAYMENT_CONFIRMED                                     | `paymentJobs.ts:70-141`                                       | não (usa o payment **mais antigo**: `:57-62`)                                      | **sim** (`:89-92`) | T2 e T3                  | **não**   | **não** | `if payment.status==='CONFIRMED' return` (`:71-73`) + `transitionPayment/Charge` (`:83-84`); UPDATE sem `WHERE status` (`:85-92`) | nenhum em allocations e payouts                                                                                                                 |
| Worker PAYMENT_REFUNDED                                                  | `paymentJobs.ts:142-165`                                      | não                                                                                | REFUNDED           | T2'                      | não       | não     | transições idempotentes (`stateMachines.ts:27-29`), **sem early return**                                                          | nenhum                                                                                                                                          |
| Worker PAYMENT_OVERDUE / FAILED                                          | `paymentJobs.ts:166-183`                                      | não                                                                                | OVERDUE / FAILED   | não                      | não       | não     | sem verificação no provider                                                                                                       | —                                                                                                                                               |
| Worker PAYMENT_SCHEDULER                                                 | `paymentJobs.ts:189-231`                                      | não (cria charges)                                                                 | não                | **não**                  | não       | não     | filtro `lt(status,'TERMINATING')` (`:197`)                                                                                        | `onConflictDoNothing` em `(lease, period)` (`:217`)                                                                                             |
| Worker PAYMENT_RECONCILE                                                 | `paymentJobs.ts:234-266`                                      | não                                                                                | não                | não                      | —         | —       | —                                                                                                                                 | —                                                                                                                                               |
| `POST /charges/:id/cancel`                                               | `charges.ts:273-308`                                          | não                                                                                | CANCELLED          | **não** (não reverte T1) | não       | não     | `transitionCharge(→CANCELLED)`                                                                                                    | —                                                                                                                                               |
| `POST /charges/:id/refund` (UI "Estornar")                               | `charges.ts:310-371`; UI `charges-client.tsx:144-163`         | não                                                                                | REFUNDED           | **não**                  | não       | não     | usa o payment **mais recente** (`:324-329`)                                                                                       | —                                                                                                                                               |
| Baixa manual                                                             | **não existe**                                                | —                                                                                  | —                  | —                        | —         | —       | —                                                                                                                                 | `method: 'MANUAL'` apenas cria cobrança no provider (`charges.ts:235-239`)                                                                      |

### Cenários pedidos

- **(a) Webhook repetido com event_id diferente para o mesmo pagamento**
  - Sequencial: bloqueado por `paymentJobs.ts:71-73`. CONFIRMADO.
  - Concorrente: ambos leem PENDING e duplicam T2, alocações, payout e T3 (F-01). SUSPEITA forte (mecanismo confirmado; PR-01).
  - Para REFUNDED **não há bloqueio nem sequencial**: nova chamada a `provider.refundPayment` e novo T2' a cada evento. CONFIRMADO (F-04; PR-05).
- **(b) Webhook + reconcile simultâneos:** o reconcile não altera charges nem payments (`paymentJobs.ts:234-266`). Não há crédito duplo. CONFIRMADO. O snapshot fica inconsistente, sem efeito monetário.
- **(c) Baixa manual + webhook:** a baixa manual não existe. Variante real: "Estornar" pela UI (só status) seguido de um evento Asaas PAYMENT_REFUNDED. O worker chama `refundPayment` de novo sobre um pagamento já estornado; o provider tende a rejeitar, o job falha 3× e o T2' nunca é lançado. SUSPEITA (depende da resposta do Asaas; PR-06).
- **(d) Duas instâncias do worker:**
  - O claim é seguro por linha (`inboxJobs.ts:97-108`, SKIP LOCKED + RUNNING).
  - **Mas** linhas diferentes do mesmo pagamento correm em paralelo (F-01).
  - O reaper devolve para PENDING qualquer linha RUNNING com `started_at` acima de 5 min (`inboxJobs.ts:92-96`). `started_at` é marcado no claim do lote de até 10 jobs processados em série (`:99,187`), então jobs do fim de um lote lento podem ser re-clamados e executados duas vezes.
  - Ciclos sobrepostos no mesmo processo equivalem a duas instâncias: `setInterval` sem guarda de reentrância (`apps/worker/src/index.ts:103-111`).
  - SUSPEITA (PR-01, PR-02).
- **(e) Refund duplicado:**
  - Rota: statuses idempotentes, auditoria duplicada, `payments.paid_at` sobrescrito com a data do estorno (`charges.ts:337`), sem ledger. CONFIRMADO.
  - Worker: T2' duplicado e `refundPayment` repetido. CONFIRMADO (PR-05).
- **(f) Payout duplicado:** possível via (a) ou (d). Não há unique nem `payment_id` em `payouts` (`finance.ts:164-183`). Não há transferência real porque não existe execução de payout. CONFIRMADO (§7).
- **(g) Pagamento parcial:** não modelado. Se o provider reportar CONFIRMED, credita o valor integral do payment. SUSPEITA (depende do provider; PR-24).
- **(h) Pagamento de cobrança cancelada:** a cobrança no provider não é cancelada (`cancelCharge` nunca é chamado pela aplicação; grep só encontra interface, adapters e testes). O locatário paga, o worker lança INVALID_TRANSITION CANCELLED→PAID (`paymentJobs.ts:84`) antes de qualquer escrita, o job é abandonado após 3 tentativas e o dinheiro recebido fica sem registro. CONFIRMADO (PR-07).
- **(i) Valor diferente do cobrado:** o `amountCents` do webhook é ignorado (`paymentJobs.ts:44-45,184`). Credita `payment.amountCents` do payment **mais antigo**, que pode ter sido criado com outro valor (F-02). CONFIRMADO (PR-03, PR-24).
- **(j) Estorno após repasse pago:** o sistema não executa repasse. O estorno não reverte alocação, payout nem T3 (`paymentJobs.ts:142-165`), e não registra clawback. Se a imobiliária pagou o proprietário por fora, o prejuízo é invisível. CONFIRMADO.

---

## 6. Confirmação no provider antes de creditar

- **Onde:** `apps/worker/src/paymentJobs.ts:74-82`. Chama `provider.getChargeStatus(charge.providerChargeId)`; se o resultado for diferente de `'CONFIRMED'`, lança `PROVIDER_ERROR`.
  - Verifica **só o status**, não valor nem data.
  - Verifica a charge _atual_ (`provider_charge_id` sobrescrito a cada iniciação: `charges.ts:240-243`, `portal.ts:525-528`), mas credita o **payment mais antigo** (`paymentJobs.ts:57-62`). Não há vínculo payment ↔ cobrança no provider: `provider_payment_id` nunca é gravado (grep: só é lido em DTOs).
- **Outros eventos: nenhuma verificação.**
  - REFUNDED **executa** estorno real (`paymentJobs.ts:144-146`) em vez de verificar `getChargeStatus === 'REFUNDED'`.
  - FAILED marca FAILED sem checar (`:178-183`).
  - OVERDUE marca a cobrança OVERDUE e a locação DELINQUENT sem checar (`:166-177`).
- **Provider FAKE:**
  - A rota de webhook chama `provider.confirmCharge` **para qualquer evento**, antes de enfileirar (`webhooks.ts:309-314`). Isso altera o `Map` em memória do **processo da API** (`fake.ts:33-36`).
  - O worker (`index.ts:75` chama `runInboxJobs` sem `payments`) cria **nova** `FakePaymentProvider` a cada ciclo de 5 s (`inboxJobs.ts:173-185`), com `statuses` vazio, então `getChargeStatus` retorna `'PENDING'` (`fake.ts:28-30`).
  - Consequência: em deploy multi-processo, nenhum crédito ocorre. O job falha 3× e é abandonado (`inboxJobs.ts:102,222-227`). O e2e com browser registra essa limitação (`tests/e2e/src/main-journey.spec.ts:9-14`) e só verifica o 200 do webhook (`:275-285`).
  - Em processo único (testes: `helpers.ts:20,56` + `finance.test.ts:53-55`), a defesa "confirmar no provider" é anulada pela própria rota: webhook sem token leva a `confirmCharge` e ao crédito. O teste `finance.test.ts:237-249` credita exatamente assim.
  - O `providerChargeId` FAKE é `sha256(amount:dueDate)` (`fake.ts:15-18`), portanto **idêntico** para todas as cobranças de mesmo valor e vencimento, em qualquer locação ou org. A rota resolve a org com `WHERE provider_charge_id = X LIMIT 1` sem org (`webhooks.ts:301-305`) e o worker faz `LIMIT 1` dentro da org (`paymentJobs.ts:49-53`). Resultado: crédito na cobrança errada (F-11).
  - Não há guard contra FAKE em produção: `PAYMENT_PROVIDER` é opcional sem refine (`packages/config/src/env.ts:51`), e o worker usa FAKE por default (`inboxJobs.ts:178`). A API sem `PAYMENT_PROVIDER` fica com `payments=null` (`apps/api/src/app.ts:266-279`; `registry.ts:17-28`).

---

## 7. Payouts

- **Geração:** apenas no worker, em PAYMENT_CONFIRMED. Um `payouts` PENDING por payment confirmado, se `landlord > 0 && rule.landlordPartyId` (`paymentJobs.ts:122-129`), com T3 lançado imediatamente (`:130-133`).
  - Sem `landlordPartyId` (imóvel sem proprietário na criação da locação: `leases.ts:162`), não há payout, e o LANDLORD_PAYABLE de T1 fica eterno, com alocação LANDLORD de `party_id` nulo (`paymentJobs.ts:116`). P2.
- **Aprovação:** não existe (as rotas só fazem GET `/payouts`: `payments.ts:74-104`).
- **Execução:** não existe. `IPaymentProvider` não tem método de transferência (`types.ts:18-30`), e não há nenhum `update(payouts)` nem `update(splitAllocations)` no repositório. `split_allocations.status` e `payouts.status` ficam PENDING para sempre, e o extrato do proprietário nunca mostra "pago" (`packages/domain/src/portal/portal.ts:80-85`).
- **Payout real sem intenção explícita:** **impossível hoje**, porque não há código de execução. CONFIRMADO.
- **Dados bancários:**
  - `POST /bank-accounts` valida só que `holder_document` coincide com uma identidade CPF/CNPJ da parte (`payments.ts:183-202`).
  - Não valida banco, agência, conta ou chave PIX. Não há unicidade nem fluxo de verificação ou ativação, nem rota de listar ou editar.
  - `payouts` **não referencia** `party_bank_accounts` (`finance.ts:164-183`), então os dados nunca são usados.
- **Idempotência:** nenhuma. Não há `payment_id` ou `allocation_id` em `payouts` e não há unique. O único rastro é `ledger_entries.reference_id = payment.id` no T3.

---

## 8. Reconciliação

`apps/worker/src/paymentJobs.ts:234-271`; enfileiramento em `inboxJobs.ts:66-74` (diário) e `payments.ts:251-275` (manual). CONFIRMADO (leitura).

- **O que compara:**
  - Lado provider: `Σ amountCents` de `getProviderCharges()`. Isso só existe no FAKE e retorna **todas** as cobranças já criadas na instância, de todas as orgs e todos os status (`fake.ts:20,49-51`). No Asaas não existe, então retorna `[]` e o total é 0 (`paymentJobs.ts:268-271`).
  - Lado local: `Σ charges.amount_cents` de todas as cobranças PAID da org, desde sempre, sem filtro de período (`:243-247`).
  - Grava `provider: 'FAKE'` fixo (`:251`), `periodEnd = periodStart` e `differences` = só os dois totais.
- **O que faz com divergência:** apenas insere a linha DISCREPANCY e a auditoria. Não há casamento por cobrança, alerta, bloqueio de payout nem correção.
- **Resultado prático:** com Asaas, sempre DISCREPANCY a partir do primeiro pagamento. Com FAKE multi-processo, o worker vê a instância nova, vazia, então sempre 0. Logo, pagamentos órfãos (F-02, F-03, F-07) **não seriam detectados**.
- Overflow de int4 em `local_total_cents` (§1.1). O `POST /reconciliations` usa a mesma chave `RECON:${org}:${today}` do job diário (`payments.ts:262` e `inboxJobs.ts:71`), então vira no-op se o job diário já foi enfileirado (P3).

---

## 9. Locação e cobranças recorrentes

- **Criação:** somente manual, via `POST /leases` (`apps/api/src/routes/leases.ts:100-175`). O job de assinatura **não** cria locação (`apps/worker/src/signatureJobs.ts:130-202`).
  - Exige contrato SIGNED (`:114`).
  - Cria direto ACTIVE (`:151`), com `startDate = hoje` (`:152`) e `endDate` nulo.
  - **Valor:** `property_financial_terms.monthly_rent_cents` lido **no momento da criação da locação**, default 0 (`:136-140,153-154`).
    - Não vem do contrato: o contrato renderiza os termos do imóvel no momento da geração (`contracts.ts:119-125,143`). Se os termos mudarem entre geração e locação, a locação diverge do contrato assinado.
    - Não vem da proposta: `proposals.monthlyRentCents` não é usado fora de `proposals.ts`.
  - Landlord = primeiro proprietário arbitrário (`:131-135`). A regra de split é fixa (`:159-165`).
  - Sem transação: se o insert da `split_rules` falhar, fica uma locação sem regra.
  - Unique `leases(contract_id)` (`finance.ts:41`) impede locação duplicada por contrato.
- **Encerramento:** **não existe.** Não há rota nem job que leve a TERMINATING/ENDED ou grave `end_date`. O grep por `update(leases)` só encontra DELINQUENT em `paymentJobs.ts:173-176`. Portanto **toda locação é cobrada mensalmente para sempre**. P1, CONFIRMADO.
- **Scheduler** (`paymentJobs.ts:189-231`):
  - Um job por org por mês, com chave `SCHED:${org}:${YYYY-MM}-01` em mês UTC (`inboxJobs.ts:51-65`).
  - Seleciona locações com `lt(leases.status, 'TERMINATING')`, **comparação de texto**: `'ENDED' < 'TERMINATING'` e `'PENDING' < 'TERMINATING'` são verdadeiros, logo o filtro inclui ENDED e PENDING (latente enquanto não houver encerramento).
  - Cria a cobrança com vencimento fixo em `period_start + 10 dias` (dia 11), valor aluguel + condomínio, SCHEDULED, **sem T1**.
  - Sem pró-rata. Locações criadas depois do job do mês ficam sem cobrança naquele mês.
  - SCHEDULED só vira OPEN no job do **mês seguinte**, e só se `due_date < hoje` (`:219-230`), então passa o mês inteiro do vencimento como SCHEDULED (agrava F-03). Nunca vira OVERDUE automaticamente.
  - A locação nunca volta para ACTIVE após pagar.
- **Duplicidade do mesmo mês:** o scheduler é idempotente pelo unique `(lease_id, period_start)` (`finance.ts:73`). Porém `period_start` é **data arbitrária**: `createChargeRequestSchema.periodStart = z.string().optional()` (`packages/contracts/src/finance.ts:154`) e `charges.ts:72` aceita qualquer data. `2026-09-01` (scheduler) e `2026-09-15` (manual) coexistem, gerando **duas cobranças de setembro**. P1, CONFIRMADO (PR-08).
  - A UI não envia `periodStart` e manda `dueDate` como timestamp ISO (`charges-client.tsx:369-371`), então o período vira sempre o mês corrente; se já existir, dá 500 por violação de unique (`errors.ts:60-65`). P3.

---

## 10. Testes que cobrem invariantes e lacunas

| Invariante                                                 | Teste (arquivo:linha)                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Centavos inteiros e não negativos nos DTOs                 | `tests/contract/src/boundaries.test.ts:139-161`                                                        |
| `add`/`sub`/`mulBpsFloor`, overflow                        | `packages/domain/src/finance/finance.test.ts:13-31`                                                    |
| Maior resto soma o total (função não usada em produção)    | `finance.test.ts:22-26`                                                                                |
| Multa 2% + juros 1%/dia (cristaliza a regra questionável)  | `finance.test.ts:34-43`; sem atraso: `:45-54`; desconto: `:56-64`                                      |
| Σ split = pago; comissão ≤ pago                            | `finance.test.ts:67-89`; `boundaries.test.ts:163-175`; `tests/integration/src/finance.test.ts:276-284` |
| Transições das máquinas de estado                          | `finance.test.ts:91-116`                                                                               |
| Σ por `transaction_id` = 0 (só no caminho feliz)           | `tests/integration/src/finance.test.ts:259-274`                                                        |
| Payout criado (> 0)                                        | `tests/integration/src/finance.test.ts:287-288`                                                        |
| PAID via webhook in-process (instância FAKE compartilhada) | `tests/integration/src/finance.test.ts:237-257`; `tests/integration/src/e2e-critical.test.ts:250-269`  |
| Token do webhook de pagamentos (quando configurado)        | `tests/integration/src/webhook-security.test.ts:167-216`                                               |
| Isolamento entre orgs e RBAC financeiro                    | `tests/integration/src/finance.test.ts:291-345`; `tests/integration/src/portal.test.ts:191-217`        |
| Totais do extrato do portal                                | `portal.test.ts:151-189,277-317`; `e2e-critical.test.ts:286-294`                                       |
| Receita mensal (ledger semeado manualmente)                | `tests/integration/src/reporting.test.ts:50-94`                                                        |
| Adapter Asaas (fetch mockado)                              | `packages/integrations/src/payments/asaas.test.ts:65-435`                                              |

**Lacunas (sem nenhum teste), CONFIRMADO por grep.** Nenhum teste de worker toca pagamento (`apps/worker/src/*.test.ts`); nenhum teste de integração chama `/refund`, `/cancel`, `/reconciliations`, `/bank-accounts`, PAYMENT_SCHEDULER, PAYMENT_RECONCILE, PAYMENT_REFUNDED, PAYMENT_OVERDUE ou PAYMENT_FAILED. Faltam:

- idempotência de PAYMENT_CONFIRMED com event_ids distintos;
- qualquer concorrência (worker duplo, reaper, iniciação paralela);
- estorno (rota e worker) e reversão contábil;
- cancelamento com cobrança no provider ou payment pendente;
- pagamento de cobrança CANCELLED ou REFUNDED;
- **confirmação de pagamento iniciado pelo portal**: `portal.test.ts:59-80` semeia cobranças já OPEN, e o único teste de pagamento pelo portal é o 404 (`:209-216`);
- scheduler (duplicidade, filtro de status, vencimento);
- reconciliação;
- unicidade e execução de payout;
- saldos por conta (AR zerado após liquidação);
- múltiplos proprietários;
- criação de locação (origem do valor);
- `period_start` arbitrário;
- corpo real do Asaas passando pela rota;
- exigência de token em produção;
- FAKE entre processos;
- atomicidade sob falha parcial;
- valor divergente ou parcial;
- borda UTC dos juros;
- conversão de moeda na web.

---

## 11. Provas a executar (banco isolado)

### Harnesses

- **H-IN (in-process, PGlite).** Usar `buildTestApp`/`registerUser` de `tests/integration/src/helpers.ts:42-98`, `runInboxJobs` de `@aluguei/worker` e `setupSignedContract` copiado de `tests/integration/src/finance.test.ts:59-194` (arquivo de teste temporário **fora** do repositório, ou numa cópia isolada).
  - O PGlite tem conexão única, mas o entrelaçamento nos `await` reproduz as corridas: as leituras das duas chamadas acontecem antes das escritas.
- **Stub SP.** Provider com IDs únicos, que imita o Asaas. Injetar em `buildApp({...,payments: sp})` **e** em `runInboxJobs({db, payments: sp})`:
  ```ts
  class SP implements IPaymentProvider {
    n = 0;
    st = new Map<string, string>();
    refunds: string[] = [];
    cancels: string[] = [];
    created: any[] = [];
    async createCharge(i) {
      const id = `pc_${++this.n}`;
      this.st.set(id, 'PENDING');
      this.created.push({ id, a: i.amountCents });
      return { providerChargeId: id, pixQrCode: `qr-${id}` };
    }
    async getChargeStatus(id) {
      await new Promise((r) => setTimeout(r, 50));
      return (this.st.get(id) ?? 'PENDING') as any;
    }
    async cancelCharge(id) {
      this.cancels.push(id);
    }
    async refundPayment(id) {
      this.refunds.push(id);
      this.st.set(id, 'REFUNDED');
    }
    // SEM confirmCharge (provider "real"); confirmar com sp.st.set(id,'CONFIRMED')
  }
  ```
- **H-PG (Postgres real).** `DATABASE_URL` isolado, `pnpm --filter @aluguei/db db:apply`, depois `node --import tsx apps/api/src/index.ts` e o worker em **2 processos** (`tests/e2e/scripts/boot-stack.mjs:79-128` como modelo). Para corrida com pool real: script Node que importa `processPaymentJob` de `apps/worker/src/paymentJobs.ts` com **2** `createDb(DATABASE_URL)` e o stub SP.

### Consultas-padrão

- **Q-BAL** `SELECT a.code, SUM(e.amount_cents) FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id WHERE e.org_id=:org GROUP BY a.code;`
- **Q-UNBAL** `SELECT transaction_id, SUM(amount_cents) s FROM ledger_entries WHERE org_id=:org GROUP BY 1 HAVING SUM(amount_cents)<>0;`
- **Q-DUPREF** `SELECT reference_type, reference_id, COUNT(DISTINCT transaction_id) n FROM ledger_entries WHERE org_id=:org GROUP BY 1,2 HAVING COUNT(DISTINCT transaction_id)>1;`
- **Q-ALLOC** `SELECT payment_id, role, COUNT(*), SUM(amount_cents) FROM split_allocations WHERE org_id=:org GROUP BY 1,2;`
- **Q-PAYOUT** `SELECT party_id, status, COUNT(*), SUM(amount_cents) FROM payouts WHERE org_id=:org GROUP BY 1,2;`
- **Q-PAY** `SELECT id,status,amount_cents,provider_payment_id,created_at FROM payments WHERE charge_id=:c ORDER BY created_at;`
- **Q-INBOX** `SELECT provider,provider_event_id,status,attempts,last_error FROM webhook_inbox WHERE org_id=:org AND provider LIKE 'PAYMENT%' ORDER BY created_at;`

### Provas

**PR-01. Double credit concorrente (F-01).** H-IN + SP.

1. `setupSignedContract`, depois `POST /leases {contractId}`.
2. `POST /charges {leaseId, periodStart:'2026-09-01'}`.
3. `POST /charges/:id/payment {method:'PIX'}` e anotar `pc_1`. `sp.st.set('pc_1','CONFIRMED')`.
4. `POST /webhooks/payments` duas vezes: `{provider:'ASAAS',eventType:'PAYMENT_CONFIRMED',providerEventId:'e1',providerChargeId:'pc_1',amountCents:100000}` e o mesmo com `'e2'`.
5. `await Promise.all([runInboxJobs({db,limit:1,payments:sp}), runInboxJobs({db,limit:1,payments:sp})])`.

- Variante direta: `Promise.all` de duas chamadas `processPaymentJob(db,{id:'x',orgId,payload:{eventType:'PAYMENT_CONFIRMED',providerChargeId:'pc_1'}},sp)`.
- Variante HTTP: 20 webhooks paralelos com event_ids distintos, depois 2 ou mais workers.
- **Bug confirmado se:** Q-ALLOC mostra 2 linhas por role; Q-PAYOUT mostra 2; Q-DUPREF mostra PAYMENT=2 e PAYOUT=2; CASH em Q-BAL dobra.
- **Esperado correto:** 1 de cada.

**PR-02. Reaper re-claim (F-01).**

1. Enfileirar 1 webhook e rodar o claim com `runInboxJobs({db, payments: spBloqueante})`, onde `getChargeStatus` aguarda uma Promise controlada.
2. Em paralelo: `UPDATE webhook_inbox SET started_at=now()-interval '6 minutes' WHERE provider_event_id='PAY:e1';` e rodar um segundo `runInboxJobs`.
3. Liberar a Promise.

- **Bug se:** a mesma linha é processada duas vezes (`attempts=2`) e Q-ALLOC duplica.
- **Variante:** um lote de 10 jobs com `getChargeStatus` de 35 s mostra jobs finais do lote re-clamados.

**PR-03. Payment antigo ignorado e crédito no payment errado (F-02).** H-IN + SP.

1. Cobrança com `dueDate:'2026-08-01'`. `vi.setSystemTime('2026-09-10')`, depois `POST /charges/:id/payment`, gerando `pc_1` (valor A1).
2. `vi.setSystemTime('2026-09-12')`, novo `POST /charges/:id/payment`, gerando `pc_2` (A2 > A1).

- **Esperado bug:**
  - Q-PAY mostra 2 PENDING com `provider_payment_id` NULL.
  - `SELECT provider_charge_id FROM charges WHERE id=:c` retorna `pc_2`.
  - `POST /webhooks/payments` com `providerChargeId:'pc_1'` retorna 200 `{"status":"ignored"}`: o pagamento real do QR 1 é perdido.
  - Com `sp.st.set('pc_2','CONFIRMED')` e o webhook de `pc_2` processado, Q-PAY mostra o 1º payment (A1) CONFIRMED e o 2º PENDING para sempre, e CASH = A1 embora o provider tenha recebido A2.

**PR-04. Pagamento pelo portal em cobrança SCHEDULED (F-03).** H-IN + SP.

1. `POST /charges` (SCHEDULED; não usar a rota do operador).
2. `POST /portal/access {partyId:tenant,kind:'TENANT'}`, depois `POST /portal/auth/consume`, depois `POST /portal/tenant/charges/:id/payment`, gerando `pc_1`.
3. `sp.st.set('pc_1','CONFIRMED')`; webhook CONFIRMED; `runInboxJobs`.
4. Repetir 3× com `UPDATE webhook_inbox SET run_at=now()` entre as execuções.

- **Esperado bug:** Q-INBOX mostra `FAILED`, `attempts=3`, `last_error` com "Transição inválida: SCHEDULED → PAID"; a cobrança continua SCHEDULED; o payment continua PENDING; não há ledger.
- **Repetir** com a cobrança REFUNDED (portal permite pelo `:487`), esperando "Transição inválida: REFUNDED → CONFIRMED" (payment mais antigo REFUNDED).

**PR-05. REFUNDED forjado executa estorno real e não é idempotente (F-04, F-12).** H-IN + SP, env **sem** `ASAAS_WEBHOOK_TOKEN` (`testEnv`).

1. Levar a cobrança a PAID (PR-01 sem concorrência).
2. `POST /webhooks/payments` **sem header** `{provider:'ASAAS',eventType:'PAYMENT_REFUNDED',providerEventId:'forged-1',providerChargeId:'pc_1',amountCents:0}` e rodar `runInboxJobs`.
3. Repetir com `'forged-2'`.

- **Bug se:**
  - `sp.refunds` fica `['pc_1','pc_1']`;
  - a cobrança fica REFUNDED;
  - Q-DUPREF mostra REFUND=2;
  - CASH em Q-BAL fica abaixo de −payment;
  - Q-PAYOUT continua 1 PENDING (sem reversão);
  - alocações PENDING intactas.
- O `providerChargeId` chega ao locatário pela resposta do portal (`portal.ts:505,540`).

**PR-06. Estorno pela rota: só status (F-06).** Após PAID:

1. `POST /charges/:id/refund` duas vezes.

- **Esperado bug:** 200 nas duas; `sp.refunds=[]`; `SELECT COUNT(*) FROM ledger_entries WHERE reference_type='REFUND'` = 0; `payments.paid_at` alterado para agora; 2 linhas `PAYMENT_REFUNDED` em `audit_logs`.

2. Em seguida, webhook REFUNDED legítimo com um SP cujo `refundPayment` lança erro ("já estornado").

- **Esperado:** job FAILED ×3, T2' nunca lançado.

**PR-07. Cancelamento (F-07).**

1. Iniciar pagamento (`pc_1`), depois `POST /charges/:id/cancel`, que retorna 200.

- **Bug se:** `sp.cancels=[]`; o payment continua PENDING; a soma de T1 (`WHERE reference_id=:charge`) continua AR +100000 / REV −10000 / PAY −90000; `GET /reporting/revenue-monthly` inclui 10000.

2. `sp.st.set('pc_1','CONFIRMED')` + webhook + worker.

- **Esperado:** Q-INBOX FAILED com "CANCELLED → PAID"; sem CASH.

**PR-08. Duas cobranças no mesmo mês (F-08).**

1. `POST /charges {leaseId,periodStart:'2026-09-01'}` retorna 201.
2. `POST /charges {leaseId,periodStart:'2026-09-15'}` retorna **201** (bug).
3. Repetir `'2026-09-01'`: esperado 500 (unique, resposta genérica).

- `SELECT period_start, amount_cents FROM charges WHERE lease_id=:l;` mostra 2 cobranças de setembro, e Q-BAL tem AR em dobro.

**PR-09. Scheduler (F-21).**

- SQL: `SELECT 'ENDED' < 'TERMINATING', 'PENDING' < 'TERMINATING';` retorna `true,true`.
- `UPDATE leases SET status='ENDED' WHERE id=:l;`
- `INSERT INTO webhook_inbox (id,org_id,provider,provider_event_id,payload) VALUES (gen_random_uuid(),:org,'PAYMENT_SCHEDULER','SCHED-TEST-1','{"periodStart":"2026-10-01"}');` (o `id` não tem default no DB; `whatsapp.ts:113`). Depois `runInboxJobs`.
- **Bug se:** existe cobrança `2026-10-01` para a locação ENDED; `due_date='2026-10-11'`; `SELECT COUNT(*) FROM ledger_entries WHERE reference_id=:novaCharge` = 0; status SCHEDULED.
- Rodar de novo com `periodStart` do mês seguinte e hoje fixado: só abre cobranças com `due_date < hoje`.

**PR-10. Juros e borda UTC (F-09).**

- Unit: `calculateChargeBreakdown({rentCents:100000,dueDate:'2026-01-10',paidOn:'2026-04-20'})` retorna `interestCents=100000` (100 dias × 1%) e `amountCents=202000`.
- API: cobrança com `dueDate:'2026-06-01'`, `POST /charges/:id/payment` em 2026-09-10, `interestCents≈101000`.
- Borda: `vi.setSystemTime('2026-09-11T01:30:00Z')` (22:30 BRT de 10/09) com `dueDate:'2026-09-10'`, esperando `lateFee=2000` e `interest=1000` (bug).

**PR-11. Asaas `createCharge` sem pagador: 500 + payment órfão + cobrança mutada (F-10).**

1. `buildApp({... payments: new AsaasPaymentProvider({apiKey:'$aact_hmlg_x', fetchImpl: mockFetch})})`.
2. `POST /charges/:id/payment` em cobrança vencida.

- **Esperado:** 500; Q-PAY com 1 PENDING; cobrança OPEN com `late_fee/interest` gravados; `mockFetch` sem nenhuma chamada.

3. Repetir N vezes: N payments órfãos. O próximo pagamento bem-sucedido é creditado no órfão mais antigo (PR-03).

**PR-12. Webhook real do Asaas rejeitado (F-10).**

1. Env com `ASAAS_WEBHOOK_TOKEN='t'`.
2. `POST /webhooks/payments` com header `asaas-access-token: t` e corpo `{"id":"evt_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_1","value":1000.00,"status":"RECEIVED"}}`.

- **Bug se:** 400 `VALIDATION`. Esperado correto: 200.

**PR-13. Token não exigido em produção (F-12).**

1. `buildApp({env:{...testEnv, NODE_ENV:'production'}})` sem `ASAAS_WEBHOOK_TOKEN`.
2. `POST /webhooks/payments` sem header retorna 200 (`ignored` ou `queued`), enquanto `POST /webhooks/signature` sem token retorna 500 "Server misconfigured" (`webhooks.ts:222-232`).

**PR-14. FAILED forjado bloqueia crédito (F-13).**

1. Iniciar `pc_1`, depois webhook `PAYMENT_FAILED` forjado, depois `runInboxJobs`. O payment fica FAILED.
2. `sp.st.set('pc_1','CONFIRMED')` + webhook CONFIRMED.

- **Esperado bug:** Q-INBOX FAILED com "FAILED → CONFIRMED"; sem crédito.

**PR-15. Coproprietários (F-14).**

1. Imóvel com 2 owners: `POST /properties/:id/owners {partyId:A, ownershipSharePct:60}` e `{partyId:B, ownershipSharePct:40}`.
2. Locação e pagamento confirmado.

- **Bug se:** `SELECT landlord_party_id FROM split_rules` retorna 1 party; Q-ALLOC mostra 1 LANDLORD de 90000; Q-PAYOUT mostra 1 payout só para A (ou B, arbitrário).

**PR-16. Entrada de aluguel na web (F-17).**

- Browser em `/app/properties/:id`, modal "Termos financeiros", digitar `3.500`, salvar.
- **Esperado bug:** payload `PUT /properties/:id/financial-terms` com `{"monthlyRentCents":350}`; `SELECT monthly_rent_cents FROM property_financial_terms` retorna 350.
- Unit equivalente de `toCents('3.500,00')` retorna 350.

**PR-17. Reconciliação (F-20).**

1. Duas orgs com cobranças criadas no FAKE compartilhado (H-IN).
2. `POST /reconciliations` na org A + `runInboxJobs`.

- **Esperado bug:** `provider_total_cents` inclui valores da org B e das cobranças PENDING; `provider='FAKE'`.

3. Com SP (sem `getProviderCharges`): `provider_total_cents=0` e DISCREPANCY.

- Overflow: `INSERT INTO reconciliations(id,org_id,provider,period_start,period_end,local_total_cents) VALUES (gen_random_uuid(),:org,'X','2026-09-10','2026-09-10',2147483648);` resulta em erro _out of range_.

**PR-18. Não-atomicidade (F-05).** H-PG ou H-IN (PGlite suporta plpgsql).

- **Parte A:**
  1. `CREATE FUNCTION f_boom() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'boom'; END$$;`
  2. `CREATE TRIGGER t_paid BEFORE UPDATE ON charges FOR EACH ROW WHEN (NEW.status='PAID') EXECUTE FUNCTION f_boom();`
  3. Webhook CONFIRMED + worker.
  - **Esperado:** payment CONFIRMED, cobrança OPEN, job FAILED.
  4. `DROP TRIGGER t_paid ON charges; UPDATE webhook_inbox SET status='PENDING', attempts=0, run_at=now();` e worker de novo.
  - **Bug se:** o job termina SUCCESS (early return em `paymentJobs.ts:71-73`), mas a cobrança **continua OPEN** e não há ledger, alocação nem payout.
- **Parte B:** trigger `BEFORE INSERT ON split_allocations` lançando erro.
  - **Esperado:** T2 gravado, sem alocações ou payout, e o reprocessamento nunca os cria.
- **Parte C:** trigger `BEFORE INSERT ON ledger_entries WHEN (NEW.amount_cents < 0 AND NEW.reference_type='CHARGE')` com `POST /charges`.
  - **Esperado:** 500, mas a cobrança existe e Q-UNBAL retorna 1 transação (só a perna AR).

**PR-19. Iniciação concorrente (F-02, F-16).**

- `Promise.all` de 10× `POST /charges/:id/payment`: Q-PAY mostra 10 PENDING; `sp.created.length=10`; `provider_charge_id` = o último a gravar.
- Portal: 5× `POST /portal/tenant/charges/:id/payment` em paralelo mostra mais de 1 payment. A reentrada com PENDING existente devolve `pixQrCode:"000201-qr-<id>"` (fictício, `portal.ts:503`).

**PR-20. FAKE (F-11).**

- (i) Duas orgs, cobranças de 100000 com o mesmo `dueDate`, `POST /charges/:id/payment` em ambas: `SELECT org_id, provider_charge_id FROM charges WHERE provider_charge_id=:x` retorna **2 linhas**. Webhook CONFIRMED de uma, e o crédito cai na cobrança retornada pelo `LIMIT 1`.
- (ii) In-process, sem token: webhook forjado CONFIRMED leva a PAID sem pagamento real (o próprio `finance.test.ts:237-257` demonstra).
- (iii) H-PG com FAKE e 2 processos: após webhook, Q-INBOX FAILED `attempts=3` com "Pagamento não confirmado no provider (status PENDING)".

**PR-21. Payout contábil sem execução (F-15).** Após PAID:

- Q-PAYOUT = PENDING; existe transação PAYOUT em Q-DUPREF/Q-BAL (CASH já creditado).
- `grep -rn "update(payouts)" apps packages` retorna nada.

**PR-22. Valor da locação ≠ contrato (F-22).**

1. Termos 100000, depois gerar contrato (texto "ALUGUEL: 100000").
2. `PUT /properties/:id/financial-terms {monthlyRentCents:150000}`, assinar, `POST /leases`.

- **Esperado bug:** `leases.monthly_rent_cents=150000`, e o contrato diz 100000 em centavos crus.

**PR-23. Abandono após 3 tentativas (F-24).**

- Webhook CONFIRMED com o SP retornando PENDING nas 3 primeiras consultas; depois `sp.st.set(...,'CONFIRMED')` e novo `runInboxJobs`.
- **Bug se:** o job não é mais re-clamado (`attempts=3`) e o crédito nunca ocorre.

**PR-24. Valor divergente ou parcial (F-23).**

- Webhook CONFIRMED com `amountCents:1` (e SP CONFIRMED): credita `payment.amountCents` integral. Q-BAL CASH = valor cheio.

---

## 12. Achados consolidados por severidade

### P0

- **F-01. Double-credit concorrente (PAYMENT_CONFIRMED).**
  - Leitura, decisão e escrita sem transação, sem `FOR UPDATE` e sem `UPDATE ... WHERE status='PENDING'` (`paymentJobs.ts:57-99`). Nenhum unique em `split_allocations`, `payouts` ou referência de ledger (`finance.ts:142-183,219`). `transaction_id` aleatório (`paymentJobs.ts:95,130`).
  - Vetores: dois workers, ciclos sobrepostos (`worker/index.ts:103-111`), reaper de 5 min sobre lote serial (`inboxJobs.ts:92-108,187`), dois eventos Asaas distintos (`asaas.ts:184-188`: PAYMENT_CONFIRMED e PAYMENT_RECEIVED), webhooks com event_id novo (`webhooks.ts:320`).
  - Status: mecanismo CONFIRMADO; exploração SUSPEITA (PR-01, PR-02).
- **F-02. Crédito atribuído ao payment mais antigo; `provider_charge_id` sobrescrito; payment sem vínculo com o provider.**
  - Pagar um QR ou boleto anterior é ignorado (dinheiro recebido sem registro). Pagar o atual credita o valor de outro payment e deixa o atual PENDING.
  - Evidência: `charges.ts:223-243`; `portal.ts:508-528`; `paymentJobs.ts:57-62,96-99,107-111`; `webhooks.ts:301-308`; `finance.ts:92` (`provider_payment_id` nunca gravado); refund usa o mais recente (`charges.ts:324-329`).
  - Status: CONFIRMADO (PR-03, PR-11, PR-19).
- **F-03. Pagamento pelo portal de cobrança SCHEDULED (estado padrão durante todo o mês de vencimento) ou REFUNDED nunca é creditado.**
  - Job abandonado após 3 tentativas, sem alerta; o locatário continua devedor.
  - Evidência: `portal.ts:487,471-543`; `stateMachines.ts:14,17`; `paymentJobs.ts:83-84,219-230`; `charges.ts:92`; `inboxJobs.ts:57-65,102,222-227`.
  - Status: CONFIRMADO (PR-04). Latente em produção até F-10; ativo em qualquer ambiente com provider funcional.
- **F-04. Evento PAYMENT_REFUNDED executa estorno real no provider.**
  - Sem verificação; forjável sem token (F-12); não idempotente (repete `refundPayment` e T2'); não reverte split, payout nem T3.
  - Evidência: `paymentJobs.ts:142-165`; `webhooks.ts:287-299`; `portal.ts:505,540`.
  - Status: CONFIRMADO (PR-05). Latente no Asaas até F-10.
- **F-05. Nenhuma transação nos fluxos financeiros.**
  - Falhas parciais deixam estado irrecuperável: payment CONFIRMED com cobrança não PAID, ou CASH sem alocação ou payout. O early return em `paymentJobs.ts:71-73` impede reparo. Pernas de ledger podem ficar desbalanceadas.
  - Evidência: `paymentJobs.ts:85-134`; `ledger.ts:51-65`; `charges.ts:84-113,208-243`; `leases.ts:142-165`; único `db.transaction` em `auth.ts:58`.
  - Status: CONFIRMADO (PR-18).

### P1

- **F-06.** Estorno pela rota e UI marca REFUNDED sem estornar no provider, sem ledger e sem reverter payout; sobrescreve `paid_at`. `charges.ts:310-371`; `charges-client.tsx:144-163`. CONFIRMADO (PR-06).
- **F-07.** Cancelamento não cancela no provider nem os payments pendentes (`cancelCharge` nunca é chamado); pagamento posterior fica sem registro; T1 não é revertido, inflando receita, AR e payable. `charges.ts:273-308`; `paymentJobs.ts:84`; `reporting.ts:242-291`. CONFIRMADO (PR-07).
- **F-08.** Cobrança duplicada no mesmo mês: `period_start` é data livre e o unique é na data exata. `packages/contracts/src/finance.ts:154`; `charges.ts:72`; `finance.ts:73`. CONFIRMADO (PR-08).
- **F-09.** Juros de **1% ao dia**, simples e sem teto; multa de 2%; percentuais constantes (não vêm de contrato, locação ou imóvel); dia UTC; o valor recalculado é persistido. `chargeCalc.ts:18-19,41-54`; `charges.ts:199-218`. CONFIRMADO (PR-10).
- **F-10.** Asaas inoperante:
  - sem pagador, `CUSTOMER_REQUIRED` depois de mutar a cobrança e criar payment órfão;
  - webhook real rejeitado com 400;
  - mapper não usado.
  - `asaas.ts:333-344`; `registry.ts:25`; `charges.ts:208-239`; `webhooks.ts:280`; `packages/contracts/src/finance.ts:243-250`. CONFIRMADO (PR-11, PR-12).
- **F-11.** FAKE:
  - estado em memória por processo, então multi-processo nunca credita;
  - testes mascaram o problema com a instância compartilhada;
  - processo único faz webhook sem auth creditar;
  - IDs determinísticos colidem entre locações e orgs;
  - nenhum guard contra FAKE em produção e worker com FAKE por default.
  - `fake.ts:15-30`; `webhooks.ts:301-314`; `inboxJobs.ts:173-185`; `env.ts:51`; `helpers.ts:20,56`. CONFIRMADO (PR-20).
- **F-12.** Webhook de pagamentos sem segredo obrigatório em produção (assinatura e Meta exigem). `webhooks.ts:287-299` vs `:222-232,352-355`; `.env.example:51`. CONFIRMADO (PR-13).
- **F-13.** FAILED e OVERDUE aplicados sem verificação no provider; um FAILED forjado bloqueia o crédito futuro. `paymentJobs.ts:166-183`; `stateMachines.ts:79-81`. CONFIRMADO (PR-14).
- **F-14.** Coproprietários ignorados: um owner arbitrário recebe 100% da parte do proprietário; `ownership_share_pct` e `splitAmong` não são usados. `leases.ts:131-135,159-165`; `paymentJobs.ts:116,123-129`. CONFIRMADO (PR-15).
- **F-15.** Payout: T3 lançado na criação (PENDING); sem aprovação nem execução; sem vínculo com conta bancária ou payment; sem unique; sem reversão no estorno. `paymentJobs.ts:122-134`; `finance.ts:164-183,247-271`; `types.ts:18-30`. CONFIRMADO (PR-21).
- **F-16.** Portal:
  - valor sem recálculo de encargos;
  - QR fictício na reentrada;
  - aceita SCHEDULED e REFUNDED;
  - `SELECT` sem ORDER BY;
  - corrida.
  - `portal.ts:487-528`. CONFIRMADO (PR-04, PR-19).
- **F-17.** A entrada de aluguel "3.500" (placeholder) é gravada como R$ 3,50 e flui para locação e cobranças. `property-detail-client.tsx:629-632,686-691`; `leases.ts:153`. CONFIRMADO (PR-16).
- **F-21.** Cobrança perpétua: não há encerramento de locação (grep `update(leases)` só em `paymentJobs.ts:174`); o filtro lexicográfico `lt(status,'TERMINATING')` inclui ENDED e PENDING (`paymentJobs.ts:197`). CONFIRMADO (PR-09).

### P2

- **F-18.** Ledger semanticamente inconsistente:
  - T1 com 10% literal (`charges.ts:107,111`);
  - T1 só na cobrança manual (o scheduler não lança: `paymentJobs.ts:205-217`);
  - AR negativo após liquidação com encargos;
  - estorno reabre AR;
  - receita nunca revertida;
  - relatório usa `Math.abs` (`reporting.ts:276-281`);
  - não há cálculo de saldo.
  - CONFIRMADO (§4.4, Q-BAL).
- **F-19.** Idempotência do ledger ilusória: UUID aleatório e unique `(transaction_id, account_id)` inócuo (`charges.ts:103`; `paymentJobs.ts:95,130,155`; `finance.ts:219`). CONFIRMADO.
- **F-20.** Reconciliação sem significado: FAKE conta todas as orgs e status; Asaas dá 0; total local de todo o histórico; `provider` fixo `'FAKE'`; sem ação; overflow de int4 (`paymentJobs.ts:234-271`; `finance.ts:236-237`). CONFIRMADO (PR-17).
- **F-22.** Locação usa os termos do imóvel no momento da criação (não contrato nem proposta); contrato em centavos crus; aluguel default 0; split fixo; início = hoje; sem pró-rata (`leases.ts:136-165`; `contracts.ts:119-143`; `template.ts:22`). CONFIRMADO (PR-22).
- **F-23.** Valor pago não verificado: `amountCents` do webhook ignorado; `getChargeStatus` sem valor; taxas do Asaas (valor líquido) ignoradas, com CASH superestimado (`paymentJobs.ts:44-45,184`; `types.ts:20`). Mecanismo CONFIRMADO; efeito do provider SUSPEITA (PR-24).
- **F-24.** Retry de 3 tentativas (cerca de 14 s de backoff) sem DLQ nem alerta perde créditos quando o provider atrasa (`inboxJobs.ts:102,222-227`). CONFIRMADO (PR-23).
- **F-25.** Iniciação persiste o valor recalculado mesmo quando o provider falha; regressão OVERDUE→OPEN (`charges.ts:190-218`). CONFIRMADO.
- **F-26.** Contas bancárias sem validação de dados, sem unicidade e sem uso (`payments.ts:167-249`). CONFIRMADO.
- Scheduler: vencimento fixo no dia 11; SCHEDULED até o mês seguinte; locações criadas após o job ficam sem cobrança no mês; locação não volta a ACTIVE (`paymentJobs.ts:189-231`; `inboxJobs.ts:50-77`). CONFIRMADO.

### P3

- `mulBpsFloor` e `splitAmount` usam divisão float (exata no intervalo seguro; comentário impreciso): `money.ts:24-45`.
- `total = rows.length` nas listagens: `charges.ts:143`; `payments.ts:70`; `leases.ts:193`.
- Conversões float na web e no WhatsApp fora do fluxo de cobrança: `proposals-client.tsx:293`; `leads-client.tsx:335`; `intents.ts:67-77`.
- A UI cria cobrança sem `periodStart` e com `dueDate` em timestamp; não dá para criar a competência seguinte; conflito gera 500 (`charges-client.tsx:369-371`; `charges.ts:72`).
- `POST /reconciliations` vira no-op no mesmo dia do job diário (`payments.ts:262`; `inboxJobs.ts:71`).
- `landlordShareBps` ignorado (`split.ts:19-27`).
- Sem limite superior em `amountOverrideCents` e `monthlyRentCents` (int4, 500).

### Evidência histórica (docs; não é fonte de verdade)

- `docs/DECISIONS.md:28-31` (ADR-022 a ADR-025) e `docs/THREAT_MODEL.md:76` afirmam idempotência por `UNIQUE(transaction, account)`, **falso na prática** (F-19).
- `docs/RELATORIO_PRODUTO.md:137` descreve "juros 1%/dia".
- `docs/production-readiness/PILOT_PLAN.md:15` diz "nunca fake em prod", mas o código não impõe isso (F-11).
