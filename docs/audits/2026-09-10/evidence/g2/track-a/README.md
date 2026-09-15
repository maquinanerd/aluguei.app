# Evidências do Gate G2 — trilha A (contratos, crédito, assinatura e vistoria)

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1). Sem efeito externo: providers FAKE e
Clicksign apenas com `fetch` simulado (`https://clicksign.test`), nenhuma credencial. Cores ANSI
removidas. Cada arquivo começa com o item, o commit, o diretório e o comando.

Um par RED/GREEN sustenta cada item: o RED é o teste permanente rodando na árvore anterior à
correção (precisa falhar); o GREEN é o mesmo teste no commit da correção.

| Arquivo                                     | O que prova                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `p0-04-red.txt`                             | P0-04 antes da correção (`e93a783`): 8/8 falham — contrato `SIGNED` volta a `GENERATED` com texto e hash reescritos e `signed_at` preservado; não há versões; o banco aceita reescrever texto assinado |
| `p0-04-green.txt`                           | P0-04 depois (`11a83f7`): 8/8 — `409` sem escrita em envio, assinatura parcial, assinado e cancelado; versão 1 com hash; regeneração explícita cria a versão 2; gatilhos recusam com 23514             |
| `p1-06-red-run1.txt`                        | Primeira execução do RED do P1-06 (`294d171`): o caso "contrato cancelado" quebrava por erro do próprio teste (leitura do id), corrigido em `33edb95` sem mudar asserção                               |
| `p1-06-red.txt`                             | P1-06 antes (`33edb95`): 7/8 falham — PATCH pula o screening, aprova sem motivo e sem origem, `CONTRACTING` nunca é gravado                                                                            |
| `p1-06-red-domain.txt`                      | Domínio antes (`294d171`): 8/19 falham — transições sem origem, sem motivo auditável da decisão automática                                                                                             |
| `p1-06-green.txt`, `p1-06-green-domain.txt` | P1-06 depois (`3ef5f35`): 8/8 e 19/19                                                                                                                                                                  |
| `p2-08-red.txt`                             | P2-08 antes (`564b74f`): 4/4 falham — sem aluguel em R$, template obrigado a usar todas as variáveis, `signature_events` vazia, VOID gravado e resposta 400                                            |
| `p2-08-red-domain.txt`                      | Domínio antes: módulo de variáveis inexistente e `renderTemplate` recusando variável não usada                                                                                                         |
| `p2-08-green.txt`, `p2-08-green-domain.txt` | P2-08 depois (`37dfb3c`): 4/4 e 22/22                                                                                                                                                                  |
| `p1-11-red.txt`                             | P1-11 antes (`6e7a445`): 2/2 falham — com o adapter Clicksign a API responde 500 ao enviar para assinatura (hash no lugar do documento)                                                                |
| `p1-11-red-document.txt`                    | `renderContractPdf` e `pdf-lib` inexistentes                                                                                                                                                           |
| `p1-11-green.txt`                           | P1-11 depois (`e72edca`): 2/2 — envelope `CLICKSIGN` com o PDF da versão enviada e o hash no envelope; webhook `CLICKSIGN` localiza o envelope e o worker avança                                       |
| `p1-11-green-document.txt`                  | 18/18 — PDF determinístico, paginado e tolerante a caractere fora da fonte; adapter Clicksign                                                                                                          |
| `p1-05-red.txt`                             | P1-05 antes (`82d2f93`): 3 falham — releitura da vistoria 400, `ACCEPT` no lugar de `ACCEPTED`, migration 0017 inexistente; os pré-voos 0014–0016, implementados antes, passam                         |
| `p1-05-green.txt`                           | P1-05 depois (`24fa6d8`): 10/10, com a migração de dados e os quatro pré-voos                                                                                                                          |
| `gates-summary.txt`                         | Gates finais sem cache: exit code e duração de cada um e drift de `packages/db`                                                                                                                        |
| `gates-test-counts.txt`                     | Contagem de testes por pacote do `pnpm test --force`                                                                                                                                                   |
| `e2e.txt`                                   | Playwright com as portas da trilha (web 3310, API 4310, PostgreSQL 5543), stack e cluster descartáveis                                                                                                 |
| `testpg.txt`                                | `pnpm test:pg` (concorrência financeira do G1 em PostgreSQL real) num cluster descartável com `trust` — a trilha A mudou as fixtures financeiras que essa suíte usa                                    |
