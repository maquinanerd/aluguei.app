# Evidências — vocabulário da timeline e da conciliação (pendências da trilha G)

Pendências do inventário da trilha G do G3 (P2-12): colunas que ficaram sem CHECK porque o contrato
não descrevia o que a API e o worker gravam, e um filtro com vocabulário errado. Decisão no
ADR-093 (`docs/DECISIONS.md`).

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1, PostgreSQL 17.10 local, cluster
descartável na porta 54338), sem cores ANSI. Sem efeito externo. Cada arquivo começa com o
comando, a árvore e a data (UTC) e termina com `# exit=<código>`.

Base: `main` em `84723b3`; RED em `3b65e1f`, correção em `2e74dca`.

## RED

| Arquivo       | O que prova                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-red.txt` | Timeline de `CONVERSATION` (devolução da conversa), `LISTING` (troca de status do anúncio) e `RENTAL_APPLICATION` (decisão do screening) responde 400 na leitura; `GET /reconciliations?status=MATCHED`, opção do filtro da tela, responde 400; o teste do schema não carrega sem `reconciliationProviderSchema` no contrato |
| `web-red.txt` | As opções do filtro de status da tela (`PENDING`, `MATCHED`, `DISCREPANCY`) não são as que a API aceita; sem label para o provider da conciliação                                                                                                                                                                            |
| `pg-red.txt`  | PostgreSQL real: sem a migration 0023, dado fora do vocabulário não aborta nada (o pré-voo não existe)                                                                                                                                                                                                                       |

## GREEN

| Arquivo                                 | O que prova                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-green.txt`                         | 80/80: timeline das três entidades lida com o evento gravado pelo próprio fluxo; `POST /timeline` continua recusando `CONVERSATION` (400); cada filtro de status devolve exatamente as linhas com aquele status e `RUNNING`/`COMPLETED`/`FAILED` respondem 400; conciliação sem provider grava `NONE`; os 67 CHECKs de vocabulário iguais ao contrato |
| `web-green.txt`                         | 5/5: filtro da tela igual ao contrato; `NONE` aparece como "Sem provedor"                                                                                                                                                                                                                                                                             |
| `pg-green.txt`                          | 1/1: a 0023 aborta sem aplicar nada e nomeia `timeline_events.entity_type <id> = CHANNEL` e `reconciliations.provider <id> = PAGARME`, sem citar as linhas válidas; corrigidos os dados, migra, e o banco recusa os dois valores com 23514                                                                                                            |
| `gates-typecheck.txt`, `gates-lint.txt` | exit 0, sem cache, em `2e74dca`                                                                                                                                                                                                                                                                                                                       |
| `gates-test.txt`                        | `pnpm test --force`: 1174 testes em 14 pacotes, nenhum ignorado                                                                                                                                                                                                                                                                                       |
| `testpg.txt`                            | `pnpm test:pg`: 38/38 em 13 arquivos                                                                                                                                                                                                                                                                                                                  |
| `gates-dbgen.txt`                       | `pnpm db:generate`: "No schema changes"; `git status --porcelain -- packages/db` vazio                                                                                                                                                                                                                                                                |
| `run1/`                                 | Primeira rodada, antes do commit da correção: o typecheck reprovou `setupLease` sem `landlord` no teste novo; corrigido só o dado                                                                                                                                                                                                                     |

## Ajustes nos testes depois do RED

Nenhuma asserção foi removida ou afrouxada. O teste da 0023 ganhou `id` explícito nos dois INSERTs
feitos depois da migração (o default do id é só do drizzle, e sem ele o PostgreSQL respondia
23502 antes de chegar ao CHECK), e o teste da conciliação ganhou `landlord: true` no
`setupLease`, que o tipo exige.
