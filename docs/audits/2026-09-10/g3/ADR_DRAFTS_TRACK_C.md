# G3 — Rascunhos de ADR da trilha C (finanças e locação)

> **Consolidado** em `docs/DECISIONS.md` como ADR-063 a ADR-065 no fechamento do G3 (2026-09-22). Este arquivo fica como registro do rascunho.

Rascunhos para consolidar em `docs/DECISIONS.md` a partir do ADR-063 no fechamento do G3. Evidência
em `docs/audits/2026-09-10/evidence/g3/track-c/`.

## Rascunho C-1 — Multa, juros e vencimento por locação (P1-07)

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

## Rascunho C-2 — Repasse entre coproprietários (P1-08)

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

## Rascunho C-3 — Renovação, reajuste, encerramento e scheduler (P1-20)

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
