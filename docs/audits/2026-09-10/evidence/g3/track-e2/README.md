# Evidências — G3, trilha E2 (posse do número do WhatsApp e concessão ativa do portal)

Escopo (pendências da E1 em `docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_E.md`): P1-18, segunda
parte — prova de posse do número do WhatsApp com credencial por conexão — e o índice parcial da
concessão ativa do portal (pendência do ADR-061), ambos na migration **0021**. Rascunhos de decisão
em `docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_E2.md`.

Logs desta máquina (Windows 11, Node 24, pnpm 11.15.1), sem cores ANSI. Sem efeito externo:
verificador do número **FAKE** (META_MODE=dry_run; o token `fake-wa-owner:<phoneNumberId>` é o
dono do número), messenger FAKE, providers FAKE, IA mock, nenhuma credencial real e **nenhuma
chamada à Graph API** — a verificação real (`MetaWhatsAppNumberVerifier`) só é exercitada com
`fetch` simulado no teste do pacote `integrations`. Cada arquivo começa com o comando, a árvore e a
data (UTC) e termina com `# exit=<código>` (o código do comando, gravado pelo processo que o
executou, não o de um `echo`). Um `*-red` é o teste permanente rodando **sem** a correção e
precisa falhar; o `*-green` correspondente é o mesmo teste com ela.

Base: `origin/main` em `0d9e352` (trilhas C, D, E1, F e F2 mergeadas; última migration 0020).
Commits: `fbff19b` testes RED (domínio, integrations, integração e PostgreSQL real) →
`a099b8d` ajuste do teste (ver abaixo) → `75ad281` correção (domínio, verificador, API, webhook e
migration 0021) → `e802098` testes RED da tela (regras do web e Playwright) → `710f448` tela →
`4364abd` rascunhos de ADR e documentação de homologação.

PostgreSQL real: cluster descartável `initdb -A trust -E UTF8 --locale=C` em `tmp/pgdata` do
worktree (ignorado pelo git), porta 54336, parado e removido ao final. A primeira tentativa usou o
`initdb` sem `-E UTF8` e o cluster nasceu em WIN1252: as migrations com acentos falharam com
`22P05` antes de qualquer teste (nenhum resultado de teste; o cluster foi recriado e o `pg-red.txt`
gravado de novo).

## RED

| Arquivo                | O que prova                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-red.txt`       | Domínio antes: `whatsapp/connection.ts` não existe (status, prazo e decisão de quem reivindica o número)                                                                                                                                                                                                                                                                                                                  |
| `integrations-red.txt` | `whatsapp/verifier.ts` não existe: não havia como conferir o número com o token da própria conexão                                                                                                                                                                                                                                                                                                                        |
| `api-red.txt`          | Integração da E2, 8 de 8 falham: a conexão nasce `ACTIVE` e o `accessToken` é descartado; a mensagem para o número só reivindicado entra na fila da organização (4 linhas na fila, 1 delas a mensagem); `POST /whatsapp/connections/:id/verify` não existe (404); não há prazo de reivindicação (a coluna não existe); pedido sem token é aceito (201)                                                                    |
| `pg-red.txt`           | PostgreSQL real, 5 de 7 falham: não há 0021 (o pré-voo não aborta com duplicata ativa); o banco aceita a segunda concessão ativa da mesma pessoa, inclusive de duas transações simultâneas sem a trava da rota; status `ACTIVE` aceito sem CHECK; a tomada da reivindicação vencida não existe. Passam os 2 que já valiam: pedidos simultâneos pela rota (trava do ADR-061) e criação simultânea do mesmo número (UNIQUE) |
| `web-unit-red.txt`     | Regras da tela antes do módulo: `whatsapp-connection-rules` não existe                                                                                                                                                                                                                                                                                                                                                    |
| `e2e-red.txt`          | Playwright da E2 com a API corrigida e a tela antiga: não há "Conectar número" (só o "Conectar (teste)", que reivindicava `fake-phone-1` sem token) — timeout de 60 s no clique                                                                                                                                                                                                                                           |

## GREEN

| Arquivo                  | O que prova                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-green.txt`       | Domínio 217/217 em 26 arquivos, com os 12 de `connection.test.ts`: três status, só VERIFIED recebe webhook, só PENDING é verificada, prazo de 24 h (vence no instante), e a tabela de quem reivindica                                                                                                                                                                                                                                                      |
| `integrations-green.txt` | `integrations` 179/179: verificador FAKE (dono pelo token, erro 100 sem retry, sem rede), verificador da Graph API com `fetch` simulado (`GET /<id>` com `Bearer <token da conexão>`) e a seleção por modo                                                                                                                                                                                                                                                 |
| `api-green.txt`          | Integração da E2 8/8: token cifrado com o helper do ADR-028 e decifrável só com a chave, fora das respostas; PENDING não recebe webhook; token errado → 409 e continua PENDING; troca de token pela própria organização (200); VERIFIED, idempotente, e o webhook passa a criar a conversa; VERIFIED dá 409 para outra organização e para a dona; tomada da vencida só com prova; 404 fora da organização; legado sem token → 409; auditoria em cada passo |
| `pg-green.txt`           | PostgreSQL real 7/7: pré-voo aborta sem aplicar nada e lista a pessoa; revogada a sobra, a 0021 conclui com `WHERE (revoked_at IS NULL)` e a conexão `ACTIVE` antiga vira PENDING vencida e sem token; 23505 na segunda ativa; duas transações simultâneas confirmam uma só; 12 pedidos simultâneos pela rota deixam uma ativa por tipo; CHECKs (23514); 4 organizações pelo mesmo número (201, 409, 409, 409); tomada simultânea com um vencedor          |
| `api-regression.txt`     | Integração completa 269/269 em 41 arquivos com a correção                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pg-regression.txt`      | `pnpm test:pg` 32/32 em 11 arquivos com a correção (`75ad281`)                                                                                                                                                                                                                                                                                                                                                                                             |
| `web-unit-green.txt`     | Unidade do web 177/177: ações da tela iguais ao domínio em cada status, prazo igual ao domínio antes, no instante e depois, e o formulário com o mesmo veredito do contrato da API                                                                                                                                                                                                                                                                         |
| `e2e-green.txt`          | Playwright 4/4 (o spec da E2 e os 3 da trilha E, cuja conversa agora nasce de um número verificado): conectar com o token errado, prova recusada na tela, trocar o token, verificar, "Verificada" e "Recebe mensagens"; o token nunca volta para a tela                                                                                                                                                                                                    |
| `gates-summary.txt`      | Gates sem cache no commit `4364abd`: install, format, lint, typecheck, test, build, secret scan, audit critical e `db:generate`, todos com exit 0; `db-drift=NO`                                                                                                                                                                                                                                                                                           |
| `gates-*.txt`            | Saída de cada gate. `gates-test-counts.txt`: 1092 testes em 14 pacotes, nenhum ignorado. O audit tem 22 high e 9 moderate de antes da trilha, nenhum critical                                                                                                                                                                                                                                                                                              |
| `testpg.txt`             | `pnpm test:pg` no commit `4364abd`: 32/32 em 11 arquivos (os 9 de antes e os 2 da E2)                                                                                                                                                                                                                                                                                                                                                                      |
| `e2e-full.txt`           | Playwright completo no commit `4364abd` (web 3360, API 4360, PostgreSQL 5593), primeira execução: **42 de 43, exit 1**. Falhou `g3-c-lease-lifecycle.spec.ts:208` ("nova cobrança pela lista vence no dia da locação"): a cobrança existia na API com o vencimento certo (as asserções da API passaram), mas a linha não apareceu na lista em 30 s. A E2 não toca a tela nem a API de cobranças                                                            |
| `e2e-rerun-g3-c.txt`     | O spec da trilha C sozinho, no mesmo commit: 4/4                                                                                                                                                                                                                                                                                                                                                                                                           |
| `e2e-full-run2.txt`      | Playwright completo de novo, no mesmo commit e sem nenhuma mudança: **43/43**, exit 0 (inclui o spec da E2)                                                                                                                                                                                                                                                                                                                                                |

A falha da primeira execução completa é intermitente e fica registrada como está; nada foi mudado
no teste. Fica como pendência para a trilha C investigar a recarga da lista de cobranças depois do
diálogo (ver o relatório da trilha).

## Ajustes nos testes depois do RED

Nenhuma asserção foi removida ou afrouxada.

- `a099b8d`: no teste novo do número PENDING, a contagem da fila olhava todas as linhas de
  `webhook_inbox` da organização, e a aprovação da imobiliária já grava 3 linhas de outro provider.
  A asserção passou a olhar só `provider = WHATSAPP` (a intenção do teste). O `api-red.txt` foi
  gravado antes do ajuste: lá a fila tinha 4 linhas (as 3 da aprovação e a mensagem entregue sem
  prova de posse), então o RED continua valendo com o filtro. No mesmo commit, `results[0]?.` virou
  `results[0].` num teste novo de PostgreSQL por causa do lint, e o Prettier formatou os testes
  novos.
- Antes do `api-red.txt` gravado (ainda em `fbff19b`), o teste de integração da E2 passou a
  cadastrar as imobiliárias por IPs distintos (`registerAgency`, como `platform-fixtures.ts`): com
  11 cadastros do mesmo IP, o limite de 10 por minuto respondia 429 no último teste. O limite ficou
  intacto.
- Dois testes antigos gravavam a conexão do WhatsApp direto no banco com o status padrão
  (`whatsapp.test.ts` e `g3-e-whatsapp.test.ts`). Desde a 0021 o padrão é PENDING, que não recebe
  webhook: a semente passou a gravar `status: 'VERIFIED'` com `verifiedAt`. Só o dado mudou.
- O spec do Playwright da trilha E (`g3-e-portal-inbox-inspection.spec.ts`) criava a conexão sem
  token. Passou a mandar o token FAKE e a verificar a posse antes do webhook. Só a preparação
  mudou; as asserções da caixa de entrada são as mesmas.
- `testEnv` da integração e a stack do Playwright ganharam `META_TOKEN_ENCRYPTION_KEY` gerada a
  cada execução (sem chave, a API recusa guardar o token).
- O teste das regras do web (`whatsapp-connection-rules.test.ts`) foi só reformatado pelo Prettier
  no commit da tela (`710f448`).

## Verificação do orquestrador (`orquestrador/`)

Refeita pelo orquestrador em `51f751e` (a trilha e um commit que só melhora a mensagem de uma
asserção do Playwright da trilha C).

| Arquivo             | Resultado                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `gates-summary.txt` | 9 gates sem cache com exit 0; `db-drift=NO`. `gates-test-counts.txt`: 1092 testes em 14 pacotes, nenhum ignorado |
| `testpg.txt`        | `pnpm test:pg` num cluster PostgreSQL 17 descartável na porta 54336: 32/32                                       |
| `e2e-full.txt`      | Playwright completo, rodada 1: 43/43 (web 3360, API 4360, PostgreSQL 5593)                                       |
| `e2e-full-run2.txt` | Playwright completo, rodada 2: 43/43                                                                             |

**Falha intermitente da trilha C (não resolvida, registrada).** Na primeira rodada completa do agente,
`g3-c-lease-lifecycle.spec.ts:208` falhou uma vez: a cobrança existia na API com o vencimento certo,
mas a linha não apareceu na lista em 30 s. Nas outras três rodadas completas (a segunda do agente e
as duas do orquestrador) e em quatro rodadas isoladas do spec, passou. O código da lista (`useQuery`
com descarte de resposta velha e `reload` depois do `POST`) não mostra corrida. A captura e o trace
da falha foram sobrescritos pela rodada seguinte. Hipótese não provada: o limite global de 300
requisições por minuto por IP da API, que a suíte inteira divide. Para não depender de sorte na
próxima vez, a asserção da linha passou a trazer na mensagem as falhas do backend e os erros da
página vistos pela tela (`51f751e`); a asserção é a mesma.
