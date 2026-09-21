# Evidências — G3, trilha C (finanças e ciclo da locação)

Escopo (plano do G3, trilha C): P1-07 (multa, juros e vencimento por locação, em dia útil no fuso de
São Paulo), P1-08 (repasse entre coproprietários) e P1-20 (renovação, reajuste, encerramento e
scheduler por status explícito), com a interface do painel. Rascunhos de decisão em
`docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_C.md`.

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1), sem cores ANSI. Sem efeito externo:
providers FAKE, Meta em dry-run, IA mock, nenhuma credencial real. Cada arquivo começa com o
comando, a árvore e a data (UTC) e termina com `# exit=<código>`. Um `*-red` é o teste permanente
rodando **sem** a correção e precisa falhar; o `*-green` correspondente é o mesmo teste com ela.

Base dos RED do backend: `main` em `3aa922b`, com os testes da trilha C aplicados e sem
implementação. Os defeitos achados durante a implementação e na revisão têm RED próprio, com a
árvore descrita no cabeçalho de cada arquivo.

## RED

| Arquivo                        | O que prova                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain-red.txt`               | Domínio antes: 10 falhas e 2 módulos inexistentes (`calendar.ts` e `leaseLifecycle.ts`). Juros de 1% ao **dia** sem teto (100 dias dobravam o aluguel), multa e juros fixos no código, sem dia útil, sem dia de vencimento, sem status cobráveis explícitos, sem renovação, reajuste, encerramento nem participação de coproprietário                  |
| `api-red.txt`                  | API antes: 14 de 14 falham — sem `PATCH /leases/:id/terms`, `renew`, `readjust` e `end`; cobrança sem dia de vencimento da locação; participações somando mais de 100% aceitas; repasse inteiro para um proprietário; portal do coproprietário vazio                                                                                                   |
| `scheduler-red.txt`            | Scheduler antes (falha de comportamento, não de rota): locação `ENDED` e `PENDING` cobradas e `TERMINATING` não — `lt(status, 'TERMINATING')` é comparação alfabética                                                                                                                                                                                  |
| `api-review-red.txt`           | Revisão da própria trilha, 3 de 3: reajuste gravado antes de outro já registrado (histórico desencadeado), renovação de locação vencida com aluguel novo que não atualiza o aluguel em vigor, e encerramento retroativo que deixa aberta a cobrança do mês seguinte ao término                                                                         |
| `ui-civil-date-red.txt`        | `formatDate` com `TZ=America/Sao_Paulo`: data civil `2026-10-10` aparece como 09/10/2026 (meia-noite UTC ainda é o dia 9) e `2027-02-29`, que não existe, aparece como 28/02/2027                                                                                                                                                                      |
| `web-unit-red.txt`             | Regras novas das telas antes dos módulos: `lease-rules` e `property-owners` não existem (2 arquivos não carregam)                                                                                                                                                                                                                                      |
| `api-charge-dates-red.txt`     | `POST /charges` com `dueDate: "abc"`: 500 "Erro interno" em vez de 400 — `periodStart` e `dueDate` aceitavam qualquer texto                                                                                                                                                                                                                            |
| `e2e-red.txt`                  | Playwright dos specs da trilha C sem a interface, 4 de 4. O primeiro caiu antes da tela, na semente: o contrato de imóvel com dois proprietários tem três signatários e a semente do G2 assina dois (dado do teste, corrigido — ver abaixo). Os outros três falham na tela: sem histórico da locação, sem aba "Proprietários", sem "Mês de referência" |
| `e2e-red-coowners.txt`         | O mesmo primeiro teste com a semente corrigida: falha na tela, sem o card "Proprietários" com os coproprietários                                                                                                                                                                                                                                       |
| `lease-concurrency-pg-red.txt` | PostgreSQL real, com `lockLease` **sem** `FOR UPDATE` (alteração temporária, desfeita em seguida): a renovação lida durante um encerramento ainda não confirmado responde 201 e deixa a locação em encerramento com o término estendido para 2031 e uma renovação no histórico                                                                         |

## GREEN

| Arquivo                          | O que prova                                                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-green.txt`               | Domínio 61/61: calendário bancário e data de São Paulo, multa e juros ao mês pro rata die com teto, dia de vencimento, status cobráveis, vigência, renovação, reajuste, encerramento e participações                                                                                                      |
| `api-green.txt`                  | Integração da trilha C 14/14: termos com auditoria em diff, vencimento no dia configurado, pagamento vencido com as taxas da locação, participações somando 100%, repasse 60/40 (54.001 e 36.000) com o portal de cada coproprietário, reajuste, renovação, encerramento futuro e retroativo, e scheduler |
| `domain-review-green.txt`        | Domínio 63/63 com as regras da revisão: histórico de aluguel encadeado e reajuste dentro da vigência                                                                                                                                                                                                      |
| `api-review-green.txt`           | Integração da trilha C 17/17 com as três correções da revisão                                                                                                                                                                                                                                             |
| `ui-civil-date-green.txt`        | Pacote `ui` 90/90: data civil sai no mesmo dia, instante com hora continua convertido para o fuso local e data inexistente vira travessão                                                                                                                                                                 |
| `web-unit-green.txt`             | Unidade do web 24/24: percentual em basis points, encargos nos limites do domínio, ações por status comparadas com o domínio, prévia do reajuste (inclusive pelo histórico), renovação, encerramento, histórico e participações                                                                           |
| `api-charge-dates-green.txt`     | Integração da trilha C 18/18 com `periodStart` e `dueDate` como data civil que existe                                                                                                                                                                                                                     |
| `e2e-green-run1.txt`             | Playwright da trilha C 4/4 com a interface: encargos (com limite recusado na tela), coproprietários com participação e portal, cobrança no dia configurado sem voltar um dia, reajuste com prévia, renovação, encerramento com cobrança cancelada e histórico, participações no imóvel e nova cobrança    |
| `lease-concurrency-pg-green.txt` | PostgreSQL real 1/1: com a trava, a renovação espera o encerramento, é recusada com 409 e não estende o término nem grava histórico                                                                                                                                                                       |
| `gates-summary.txt`              | Gates sem cache no commit `afd59c8`: install, format, lint, typecheck, test, build, secret scan, audit critical e `db:generate`, todos com exit 0; `db-drift=NO` (a migration 0019 já está no repositório)                                                                                                |
| `gates-*.txt`                    | Saída de cada gate. `gates-test-counts.txt`: 837 testes em 14 pacotes, nenhum ignorado                                                                                                                                                                                                                    |
| `testpg.txt`                     | `pnpm test:pg` no commit `afd59c8`, cluster PostgreSQL 17 descartável: 10/10 em 4 arquivos (liquidação e fila, limites do plano, concessão do portal e ciclo da locação)                                                                                                                                  |
| `e2e-full-run1.txt`              | Playwright completo no commit `afd59c8`: 31 de 32. A jornada principal caiu no próprio login: com a máquina carregada, a primeira espera de 10 s estourou e o fallback do rate limit clicava "Entrar" depois de o login já ter concluído, esperando um botão que saiu da tela                             |
| `e2e-full.txt`                   | Playwright completo com o fallback de login idempotente (stack e cluster descartáveis; web 3310, API 4310, PostgreSQL 5543)                                                                                                                                                                               |

## Ajustes nos testes depois do RED

Nenhuma asserção foi removida ou afrouxada.

- A semente de locação com coproprietários assinava dois signatários, e o contrato de um imóvel com
  dois proprietários tem três (o worker só fecha o envelope com todas as partes assinadas). A
  semente da trilha C passou a assinar por todos, e `e2e-red-coowners.txt` refaz o RED.
- Em `finance.test.ts`, a asserção antiga dos juros fixava o defeito P1-07 (1% ao dia) e passou a
  exigir o valor correto (1% ao mês pro rata die), com o comentário do porquê.
- Em `lease-rules.test.ts`, uma asserção com `expect.any(String)` virou a comparação das mensagens
  exatas (mais estrita) porque `no-unsafe-assignment` reprova `expect.any` no lint do web.
- Na jornada principal (`main-journey.spec.ts`), o fallback do rate limit de login passou a clicar
  "Entrar" só se a navegação ainda não tiver acontecido, e o teste ganhou tempo para a janela de um
  minuto. Nenhuma asserção mudou: ele continua exigindo o painel com os dados criados.
