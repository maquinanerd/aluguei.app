# Evidências — G2, Track B1 (fundações do frontend)

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1), sem cores ANSI. Sem efeitos
externos: providers FAKE, Meta em dry-run, IA mock, nenhuma credencial. Cada arquivo começa
com o comando, a base e a data (UTC) e termina com `# exit=<código>`.

Um `*-red.txt` é a suíte rodando **sem** a correção e precisa falhar; o `*-green.txt`
correspondente é a mesma suíte depois da correção. Base dos RED: `0585fc6` (G1 + deploy),
com os testes novos e nenhuma correção.

## RED

| Arquivo                                        | O que prova                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `p0-07-parser-red.txt`                         | P0-07: o parsing em uso hoje (`parseFloat(v.replace(',', '.'))`, extraído para `packages/ui/src/lib/money.ts`) falha 47 de 63 casos — "3.500" vira 350 centavos, entrada ambígua não é recusada, "1.200" m² vira 1,2                                               |
| `p0-07-parsing-guard-red.txt`                  | P0-07: o web converte valor digitado com parsing local em 4 pontos (`property-detail-client.tsx:630`, `proposals-client.tsx:293`, `leads-client.tsx:335` e, fora do dinheiro, a área em `property-form.tsx:73`)                                                    |
| `p1-01-limit-guard-red.txt`                    | P1-01: 37 chamadas do web pedem `limit=200`, recusado pelo `paginationQuerySchema` da API (máximo 100)                                                                                                                                                             |
| `p1-01-busca-q-red.txt`                        | P1-01: `q` (título) em `/properties` e `ids` em `/properties`, `/parties` e `/listings` não existem — a API ignora os parâmetros e devolve a organização inteira (10 de 11 falham; o controle "sem `q` lista tudo" passa)                                          |
| `p1-01-dashboard-summary-red.txt`              | P1-01: `GET /dashboard/summary` não existe (4 de 4 falham: sessão, igualdade com contagens SQL independentes, isolamento entre organizações, RBAC)                                                                                                                 |
| `p1-02-bff-red.txt`                            | P1-02: o BFF manda `content-type: application/json` em GET/POST/DELETE sem corpo, converte o CSV em JSON (perde corpo, `content-type` e `content-disposition`) e quebra com 204 — 7 de 16 falham; os controles (JSON com corpo, cookie, Set-Cookie, origem) passam |
| `p3-calibration-e-p1-03-logout-helper-red.txt` | P3: `/dev/calibration` renderiza em produção (o controle fora de produção passa). P1-03: o helper que só aceita logout com 2xx/401 não existe (suíte não carrega)                                                                                                  |
