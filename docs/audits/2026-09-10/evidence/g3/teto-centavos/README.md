# Evidências — teto dos centavos na API (pendência da trilha G)

Pendência do inventário da trilha G do G3 (P2-12): valores em centavos por linha sem teto no
contrato da API. Decisão no ADR-094 (`docs/DECISIONS.md`).

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1, PostgreSQL 17.10 local, cluster
descartável na porta 54338), sem cores ANSI. Sem efeito externo. Cada arquivo começa com o
comando, a árvore e a data (UTC) e termina com `# exit=<código>`.

Base: `main` em `631478d`; RED em `c8cd6b7`, correção em `f920b38`.

## RED

| Arquivo                | O que prova                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-red.txt`          | Aluguel de 3 bilhões de centavos nos termos do imóvel responde **500** (INSERT estoura o int4); R$ 1.000.000,01 é aceito (200); reajuste de 5% sobre aluguel de R$ 1 milhão é aceito (201); sem `MAX_AMOUNT_CENTS` no domínio e no contrato |
| `domain-red.txt`       | "até R$ 50.000.000" numa mensagem vira 5.000.000.000 centavos; reajuste acima do teto não é recusado                                                                                                                                        |
| `integrations-red.txt` | Resposta da IA com orçamento de 5 bilhões de centavos passa no schema                                                                                                                                                                       |
| `contracts-red.txt`    | Orçamento da Meta acima do teto e valor do webhook acima do int4 passam no contrato                                                                                                                                                         |
| `web-red.txt`          | O campo de dinheiro do painel aceita R$ 1.000.000,01 (teto no int4, diferente da API)                                                                                                                                                       |

## GREEN

| Arquivo                         | O que prova                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-green.txt`                 | 5/5: os oito campos de requisição respondem 400 acima do int4 e acima do teto; no teto, aceitos; reajuste por índice acima do teto → 400; o teto é o mesmo no domínio e no contrato                               |
| `domain-green.txt`              | 3/3: teto de R$ 1.000.000,00; reajuste no teto aceito e acima recusado (`INVALID_INPUT`); orçamento acima do teto numa mensagem vira nulo, a intenção continua e "até R$ 3 mil" segue 300.000                     |
| `integrations-green.txt`        | 2/2: orçamento acima do teto deixa a resposta da IA fora do schema (o gateway usa as regras); no teto, aceito                                                                                                     |
| `contracts-green.txt`           | 2/2: orçamentos da Meta com teto; webhook limitado ao int4                                                                                                                                                        |
| `web-green.txt`, `ui-green.txt` | 2/2 e 92/92: o campo de dinheiro usa o mesmo teto da API                                                                                                                                                          |
| `gates-*.txt`                   | Em `f920b38`, sem cache: format, lint, typecheck, test (1189 testes em 14 pacotes, nenhum ignorado), build e `db:generate` ("No schema changes", `git status --porcelain -- packages/db` vazio), todos com exit 0 |
| `testpg.txt`                    | `pnpm test:pg`: 38/38                                                                                                                                                                                             |

## Ajustes nos testes existentes

Nenhuma asserção foi removida ou afrouxada. O teste do parser de dinheiro do painel
(`packages/ui/src/lib/money.test.ts`) tinha dois exemplos acima do novo teto. "1.234.567,89" foi
trocado por "999.999,99" (o caso de dois grupos de milhar continua com "1.000.000,00"). O máximo
antigo, "21.474.836,47", passou de aceito para recusado. A formatação de "1.234.567,89" continua
no teste, porque formatar não tem teto.
