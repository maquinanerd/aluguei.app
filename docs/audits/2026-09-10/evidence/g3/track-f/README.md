# Evidências — G3, trilha F (operação e observabilidade)

Escopo (plano do G3, trilha F): P1-12 (fail-fast de configuração e fim dos providers FAKE por
omissão), P1-14 (Redis do rate limit), P1-15 (API interna por http no web), P2-10 (worker: log
por job, health e parada graciosa), P2-11 (OTEL, captura de erro, redação de dado pessoal e diff
no `audit_events.payload`) e o runner de migration de P2-12. Itens F-1 a F-10 do pedido da
trilha. Rascunhos de decisão em `docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_F.md`.

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1), sem cores ANSI. Sem efeito externo:
providers FAKE, Meta em dry-run, IA mock, nenhuma credencial real, nenhum Redis real (duplo em
memória) e nenhum coletor OTEL externo (exportador em memória e um coletor OTLP/HTTP local da
própria suíte). Cada arquivo começa com o comando, a árvore e a data (UTC) e termina com
`# exit=<código>`. Um `*-red` é o teste permanente rodando **sem** a correção e precisa falhar; o
`*-green` correspondente é o mesmo teste com ela.

Base: `main` em `3aa922b`. Cada item tem o commit do teste (RED) antes do commit da correção; o
cabeçalho de cada arquivo diz o commit e o que havia na árvore. Os GREEN foram gravados com a
correção na árvore, antes do commit dela.

## RED

| Arquivo                             | O que prova                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f10-migration-runner-red.txt`      | PostgreSQL real, 1 de 5 falha: com as duas execuções do runner esperando juntas pela tabela de controle do drizzle, a segunda aplica a mesma cadeia e morre com `23505` em `pg_type` (`app_metadata`). As 4 guardas de senha (sucesso, banco inexistente, servidor inalcançável e URL malformada) já passavam   |
| `f3-redis-red.txt`                  | 4 de 4 falham com `TypeError: this.redis.defineCommand is not a function`: com `REDIS_URL` a API não sobe                                                                                                                                                                                                       |
| `f4-web-internal-http-red.txt`      | 20 de 22 falham: http recusado mesmo para a API na rede interna e sem mensagem de como liberar; produção sem `API_BASE_URL` aceita (cairia em `http://localhost:4000`)                                                                                                                                          |
| `f1-config-unit-red.txt`            | `loadRuntimeEnv` não existe (o arquivo não carrega): não havia validação de configuração na subida                                                                                                                                                                                                              |
| `f1-registries-red.txt`             | 9 de 11 falham: WhatsApp e Meta Ads devolvem o FAKE com modo ausente, vazio ou digitado errado (`dryrun`, `LIVE`, `live `)                                                                                                                                                                                      |
| `f1-worker-defaults-red.txt`        | 3 de 3: sem `PAYMENT_PROVIDER` o job de pagamento termina `SUCCESS` no FAKE implícito; em produção sem `SCREENING_PROVIDER` e com credenciais Serasa, o job de screening chega ao processamento (havia provider: o esqueleto Serasa); em produção sem `META_MODE`, o job da Meta roda no FAKE                   |
| `f1-boot-red.txt`                   | Pontos de entrada reais, 5 de 7: API e worker em produção sem configuração e sem `NODE_ENV` continuam no ar depois de 30 s. As 2 guardas (configuração da homologação com a permissão sobe) já passavam                                                                                                         |
| `f2-env-example-red.txt`            | 1 de 4: 18 chaves do schema fora do `.env.example` (entre elas `PAYMENT_PROVIDER`, `SIGNATURE_WEBHOOK_TOKEN`, `META_TOKEN_ENCRYPTION_KEY` e `PLATFORM_ADMIN_EMAILS`) e `API_BASE_URL` e `SENTRY_DSN` no exemplo sem estar no schema                                                                             |
| `f8-redaction-red.txt`              | 4 de 6: cookie de requisição e de resposta, CPF, e-mail, telefone, documento e identidades saem no log, por caminho e em texto livre, inclusive na mensagem e na pilha do erro. As 2 guardas (UUID, data, epoch e centavos legíveis; objeto de quem loga intacto) já passavam                                   |
| `f8-api-request-log-red.txt`        | 1 de 1: o CPF digitado na busca (`GET /parties?q=...`) aparece na URL do log de requisição da API                                                                                                                                                                                                               |
| `f5-worker-red.txt`                 | 7 testes falham e 2 módulos não existem: nenhuma das três filas registra início, fim ou falha de job; SIGTERM e SIGINT chamam `process.exit` na hora; não há health HTTP nem fechamento do pool; `job-loop` e `health` não existem                                                                              |
| `f6-otel-unit-red.txt`              | `startTelemetry` não existe (o arquivo não carrega)                                                                                                                                                                                                                                                             |
| `f6-otel-pg-red.txt`                | PostgreSQL real: API e worker como processos reais com `OTEL_EXPORTER_OTLP_ENDPOINT` apontando para o coletor local — o coletor não recebe nenhum span (2 de 2 falham). A suíte com exportador em memória não passou do `beforeAll` (a exportação não existia); por isso os 2 testes dela aparecem como skipped |
| `f7-error-capture-red.txt`          | `captureError`, `errorDetails` e `installProcessErrorHandlers` não existem (o arquivo não carrega)                                                                                                                                                                                                              |
| `f7-error-capture-api-red.txt`      | 1 de 2: um 5xx gera só `incoming request`, `unhandled error` e `request completed`, sem registro com origem, rota e pilha. A guarda de 4xx já passava                                                                                                                                                           |
| `f7-job-error-red.txt`              | 1 de 4: a falha de job não traz tipo nem pilha do erro                                                                                                                                                                                                                                                          |
| `f9-audit-diff-red.txt`             | 8 de 8: `auditDiff` não existe                                                                                                                                                                                                                                                                                  |
| `f9-audit-diff-integration-red.txt` | 2 de 2: `PATCH /properties/:id` e a troca de papel de membro gravam `audit_events.payload` sem o que mudou (`fields` indefinido)                                                                                                                                                                                |

## GREEN

| Arquivo                               | O que prova                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f10-migration-runner-green.txt`      | 5/5 em PostgreSQL real: as duas execuções simultâneas terminam com 0 e cada migration aparece uma vez (18 linhas e 18 hashes distintos); a saída nunca traz a senha                                                                                                                                               |
| `f3-redis-green.txt`                  | 4/4: a API sobe com `REDIS_URL`, o limite global e o de `/auth/register` (429 na 11ª) são contados no Redis, a requisição passa com o Redis fora do ar e o erro vai para o log, e o client fecha sem abrir conexão                                                                                                |
| `f4-web-internal-http-green.txt`      | 22/22: https passa; http só com `API_BASE_URL_ALLOW_HTTP=true` (valor exato) e para endereço interno (nome de serviço, loopback, IP privado, `.internal`, `.local`); http público recusado mesmo com a permissão; produção sem `API_BASE_URL` recusada; desenvolvimento como antes                                |
| `f1-config-unit-green.txt`            | 33/33: `NODE_ENV` obrigatório; em produção, a lista completa do que falta para API e worker; FAKE, mock e dry_run só com `ALLOW_FAKE_PROVIDERS=true`; credenciais dos providers reais; D4SIGN e SPC recusados; mensagem sem o valor das variáveis                                                                 |
| `f1-registries-green.txt`             | 11/11: FAKE só com `dry_run` explícito                                                                                                                                                                                                                                                                            |
| `f1-worker-defaults-green.txt`        | 3/3: os três jobs falham como "não configurado"                                                                                                                                                                                                                                                                   |
| `f1-boot-green.txt`                   | 7/7 pelos pontos de entrada atuais (API `apps/api/src/index.ts`, worker `apps/worker/src/main.ts`): terminam sozinhos com a lista do que falta; a configuração da homologação com a permissão sobe                                                                                                                |
| `f1-boot-api-message.txt`             | A mensagem real da API em produção sem nenhuma variável: 11 problemas, um por linha, `exit=1`                                                                                                                                                                                                                     |
| `f1-boot-worker-message.txt`          | A mensagem real do worker: 5 problemas, `exit=1`                                                                                                                                                                                                                                                                  |
| `f2-env-example-green.txt`            | 4/4: exemplo e schema com as mesmas chaves, sem repetição, válido como configuração de desenvolvimento para API e worker, com os segredos vazios                                                                                                                                                                  |
| `f8-redaction-green.txt`              | 6/6: redação por caminho e por padrão de valor, com identificadores, datas e valores preservados                                                                                                                                                                                                                  |
| `f8-api-request-log-green.txt`        | 1/1: a URL do log de requisição sai com `q=[REDACTED]` e sem o cookie de sessão; `limit=20` continua legível                                                                                                                                                                                                      |
| `f5-worker-green.txt`                 | 23/23: log por job nas três filas; loop que não sobrepõe ciclos e para esperando o ciclo em andamento (ou desiste no limite); health 200/503 com o motivo; SIGTERM e SIGINT sem `process.exit`, com health e pool fechados; job preso: `worker.shutdown_timeout`, `exitCode 1` e exit forçado só depois do limite |
| `f6-otel-unit-green.txt`              | 4/4: telemetria desligada sem destino; `/v1/traces` acrescentado uma vez; request HTTP com span de servidor e o `fetch` com span de cliente no mesmo trace; `withSpan` marca erro                                                                                                                                 |
| `f6-otel-pg-green.txt`                | 4/4 em PostgreSQL real: em memória, span `GET /health/ready` com `http.route` e a query `pg.query` no mesmo trace; job do worker com span próprio (fila, id, tentativa) e as queries dele no mesmo trace; no coletor local, os spans da API e do worker (`worker.cycle` com as queries) chegam só em `/v1/traces` |
| `f7-error-capture-green.txt`          | 5/5: registro com origem e pilha e span ativo marcado com exceção e status de erro; mensagem saneada também na pilha; `unhandledRejection` e `uncaughtException` registrados e repassados a quem encerra                                                                                                          |
| `f7-error-capture-api-green.txt`      | 2/2: 5xx sai como `error.captured` com `kind=http_5xx`, método, rota e pilha; 4xx não                                                                                                                                                                                                                             |
| `f7-job-error-green.txt`              | 4/4: a falha de job leva `err` com tipo, mensagem saneada e pilha                                                                                                                                                                                                                                                 |
| `f9-audit-diff-green.txt`             | 8/8: só os campos alterados, carimbos fora, campo pessoal como `[REDACTED]`, texto livre redigido, objeto e lista pelo conteúdo, texto longo cortado                                                                                                                                                              |
| `f9-audit-diff-integration-green.txt` | 2/2: o payload de `property.updated` traz `bedrooms`, `description` (com o telefone e o e-mail redigidos) e `title`; o de `member.role_changed` traz `agent → finance` e só o id do usuário, sem e-mail e nome                                                                                                    |
| `gates-summary.txt`                   | Os 9 gates sem cache, em ordem, no commit `8284995`: install, format, lint, typecheck, test, build, secret scan, audit critical e `db:generate`, todos com exit 0; `db-drift=NO` (a trilha não tem migration)                                                                                                     |
| `gates-*.txt`                         | Saída de cada gate: lint 26/26, typecheck 26/26, test 24/24 e build 12/12 tarefas, nenhuma do cache; secret scan sem achado; audit sem vulnerabilidade crítica (22 high e 9 moderate, as mesmas de antes da trilha); `db:generate` sem mudança de schema                                                          |
| `gates-test-counts.txt`               | 878 testes em 14 pacotes, nenhum com falha, skip ou todo (config 41, observability 18, integrations 172, api 20, worker 35, web 127, integração 213, entre outros)                                                                                                                                                |
| `testpg.txt`                          | `pnpm test:pg` no commit `8284995`, cluster PostgreSQL 17 descartável na porta 54332 (criado, usado, parado e apagado nesta execução): 18/18 em 6 arquivos — os 9 do G1 e G2 e os 9 da trilha (runner de migration 5, OTEL em memória 2, OTEL no coletor local 2)                                                 |
| `e2e-full.txt`                        | Playwright completo no commit `8284995`, com a stack e o cluster descartáveis do próprio Playwright (web 3310, API 4310, PostgreSQL 5543; as portas 3300/4300/5533 estavam com outra trilha): 28/28, nenhum ignorado. A stack sobe com `NODE_ENV=development` explícito e o worker pelo `main.ts` novo            |

## Ajustes nos testes depois do RED

Nenhuma asserção foi removida ou afrouxada. Quando o ajuste mudou o teste de um RED já gravado, o
RED foi refeito com o teste corrigido e sem a correção na árvore.

- **F-3**: o `vi.mock('ioredis')` do primeiro teste (`de5040f`) não alcançava o ioredis importado
  por `@aluguei/integrations` (outro caminho no pnpm); o mock passou a usar o caminho resolvido a
  partir da integração (`eb8aed8`), o teste ganhou a exigência de client sem fila offline e de
  fechamento sem abrir conexão, e `f3-redis-red.txt` foi refeito (os mesmos 4 de 4).
- **F-2**: as duas listas de diferença viraram uma asserção só (`287c42c`) para a falha mostrar os
  dois lados; RED refeito.
- **F-1**: o teste P1-13 de `finance-concurrency.pg.test.ts` contava com o FAKE por omissão do
  worker; passou a mandar `PAYMENT_PROVIDER=FAKE` ao worker, como já mandava à API. Depois do F-6 o
  ponto de entrada do worker virou `apps/worker/src/main.ts`, e `config-fail-fast.test.ts` passou a
  chamá-lo (`4fd2a42`); `f1-boot-green.txt` foi regravado.
- **F-5 e F-7**: `job-logging.test.ts` ganhou, no RED do F-7, a exigência de tipo e pilha na falha
  de job. `index.test.ts` esperava `undefined` de `run --run-once`; passou a conferir o controle de
  parada que `run` devolve (`8284995`).
- **F-6**: em `otel-memory.pg.test.ts`, o span de pg do mesmo trace passou a ser procurado pelo nome
  `pg.query` (o `pg-pool.connect` também está no trace) — mais estrito. O antigo `initTracer` saiu
  junto com o seu teste em `observability.test.ts`; o caso equivalente (sem destino, nada é ligado e o
  shutdown não falha) está em `telemetry.test.ts`.
- **F-9**: o papel `manager` não existe no domínio e virou `finance` (`34defe0`); a coluna de
  `audit_events` é `occurred_at`, não `created_at`; e 11 dígitos soltos são ambíguos (CPF sem máscara
  ou celular com DDD) e saem como `[REDACTED:DOC]` (`a63b480`). RED refeito.
- **Lint** (`e9ef691`): sem optional chain nos pipes do `spawn` e `SpanKind` reexportado por
  `@aluguei/observability` para comparar o tipo do span sem número cru.
