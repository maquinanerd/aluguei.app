# ADRs propostos — Gate G3, Trilha F (operação e observabilidade)

> Rascunhos da Trilha F (achados P1-12, P1-14, P1-15, P2-10, P2-11 e o runner de migration de
> P2-12). A consolidação em `docs/DECISIONS.md` (a partir do ADR-063) é da integração do G3;
> aqui ficam o contexto e a decisão como foram implementados. Evidências em
> `docs/audits/2026-09-10/evidence/g3/track-f/`.

## G3F-1 — Configuração explícita: NODE_ENV obrigatório e fail-fast em produção (P1-12)

Status: Proposto.

Contexto: `NODE_ENV` tinha default `development` no schema, então um deploy sem a variável
subia com rotas de simulação de pagamento, cookie sem `Secure`, webhooks sem exigir segredo e
providers FAKE. A API e o worker subiam em produção sem banco e sem segredo de webhook, e só
falhavam na primeira requisição (ou silenciosamente, no caso do worker, que pulava o ciclo).

Decisões:

- `loadRuntimeEnv(serviço, source)` (`packages/config/src/runtime.ts`) é o único ponto de
  entrada de configuração da API e do worker. **NODE_ENV é obrigatório**: não há ambiente
  padrão. O default `development` continua no `envSchema` apenas para uso como biblioteca e nos
  testes (`loadEnv`, `envSchema.parse`).
- Em produção, a validação lista **todos** os problemas de uma vez, um por linha, e o processo
  termina com `exitCode 1` sem subir servidor nem loop. Exigências: `DATABASE_URL`
  (postgres/postgresql); na API, `APP_BASE_URL` https explícita, `COOKIE_SECURE` diferente de
  `false`, os quatro segredos de webhook (`ASAAS_WEBHOOK_TOKEN`, `SIGNATURE_WEBHOOK_TOKEN`,
  `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`), `META_TOKEN_ENCRYPTION_KEY` em hex de 64 e
  escolha explícita de `PAYMENT_PROVIDER`, `SIGNATURE_PROVIDER`, `META_MODE` e `AI_PROVIDER`;
  no worker, `PAYMENT_PROVIDER`, `SCREENING_PROVIDER`, `META_MODE` e `AI_PROVIDER`. Provider
  real exige credencial (`ASAAS_API_KEY` + `ASAAS_ENV`, `CLICKSIGN_API_TOKEN`, `SERASA_CLIENT_*`,
  tokens da Meta/WhatsApp no `live`, chave do OpenAI/Gemini). `D4SIGN` e `SPC` são recusados por
  não terem adapter. A mensagem nunca repete o valor de uma variável.
- **FAKE, mock e dry_run em produção só com `ALLOW_FAKE_PROVIDERS=true`** (valor exato). Com a
  permissão, o processo sobe e registra em `warn` quais providers são FAKE. A homologação recebe
  a permissão no `docker-compose.prod.yml` (api e worker).
- Fallbacks silenciosos removidos: WhatsApp e Meta Ads só usam FAKE com `dry_run` **explícito**
  (antes: qualquer modo diferente de `live`); o worker não escolhe pagamento FAKE sem
  `PAYMENT_PROVIDER` nem o esqueleto Serasa em produção sem `SCREENING_PROVIDER`. `dry_run` e
  screening FAKE continuam padrão **fora** de produção (`resolveMetaMode`,
  `resolveScreeningProvider`).
- Scripts de desenvolvimento declaram o ambiente: `dev` da API e do worker pré-carregam
  `scripts/node-env-development.mjs` (define `NODE_ENV=development` se o shell não trouxer) e a
  stack E2E passa `NODE_ENV=development` explícito.

Consequências: qualquer processo novo (CLI, job, cron) que leia configuração deve usar
`loadRuntimeEnv` e declarar o que precisa; um provider novo entra na tabela de validação e na
lista de FAKE. Rodar a API ou o worker "na mão" exige `NODE_ENV` no comando.

## G3F-2 — `.env.example` é contrato do schema, verificado por teste (P1-12)

Status: Proposto.

Contexto: o exemplo tinha 18 chaves de menos (incluindo `PAYMENT_PROVIDER`,
`SIGNATURE_WEBHOOK_TOKEN` e `PLATFORM_ADMIN_EMAILS`) e duas que nenhum processo lia
(`API_BASE_URL` não estava no schema; `SENTRY_DSN` não tinha implementação).

Decisões: `packages/config/src/env-example.test.ts` falha quando uma chave existe num lado e
não no outro, quando uma chave se repete, quando o exemplo (sem os vazios) não é configuração
válida de desenvolvimento para API e worker, ou quando um campo de segredo vem preenchido. As
variáveis lidas pelo web (`API_BASE_URL`, `API_BASE_URL_ALLOW_HTTP`, `PUBLIC_ORG_SLUG`) entram
no schema como opcionais — o web não depende de `@aluguei/config`, mas a documentação das
variáveis fica num lugar só. `SENTRY_DSN` sai do exemplo (ver G3F-7).

Consequências: chave nova no schema exige linha no exemplo (e vice-versa) no mesmo commit.

## G3F-3 — Rate limit com Redis: client do ioredis e falha aberta (P1-14)

Status: Proposto.

Contexto: com `REDIS_URL` preenchida a API caía no boot com
`TypeError: this.redis.defineCommand is not a function`: o `@fastify/rate-limit` registra
comandos Lua e precisa do client do ioredis, mas recebia o adapter `get/set/del` de
`createRedisClient`.

Decisões: `createRateLimitRedis` (`packages/integrations/src/redis/rate-limit.ts`) devolve o
client do ioredis com `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`,
`commandTimeout: 500 ms`, `connectTimeout: 2 s` e reconexão progressiva até 5 s — nenhuma
requisição espera pelo cache. Erro de conexão vai para o log em `warn` e o client fecha no
`onClose` (QUIT se conectado, senão só desconecta). Chaves com prefixo `aluguei:rate-limit:`.
Com o Redis fora do ar, `skipOnError: true`: **a requisição passa sem contar**. Preferimos
perder o limite temporariamente a derrubar a API inteira por causa do cache do contador; o erro
de conexão fica no log e a proteção volta sozinha.

Consequências: durante uma queda do Redis, brute-force de login fica só com as defesas do
domínio (hash com custo, mesma resposta para e-mail inexistente). Se o limite passar a ser
controle de segurança crítico, a decisão deve ser revista para falha fechada com página de erro.

## G3F-4 — API interna por http no web só com permissão explícita (P1-15)

Status: Proposto.

Contexto: o web de produção exige `API_BASE_URL` https (o BFF repassa o cookie de sessão).
Com a API na rede interna do deploy (`http://api:4000`) o painel caía no login, então a
homologação fala com a API pelo domínio público — tráfego interno saindo e voltando pelo proxy.

Decisões: `assertSecureApiBase` continua exigindo https em produção. Com
`API_BASE_URL_ALLOW_HTTP=true` (valor exato) aceita http **apenas** para endereço interno: nome
de serviço sem domínio (Docker/Coolify), `localhost`/loopback, IPv4 privado (10/8, 172.16/12,
192.168/16) ou domínio `.internal`/`.local`. http para endereço público continua recusado, com
mensagem própria. Produção sem `API_BASE_URL` passa a ser recusada em vez de cair em
`http://localhost:4000`.

Consequências: a homologação pode passar a chamar a API pela rede interna com duas variáveis
(`API_BASE_URL=http://api:4000` e a permissão), o que também tira o tráfego do proxy do rate
limit — a troca fica para o deploy, com smoke (não foi ativada nesta trilha).

## G3F-5 — Worker operável: log por job, health HTTP e parada graciosa (P2-10)

Status: Proposto.

Contexto: o worker só logava "worker started" (um job que falhava não deixava rastro), não tinha
health — um worker travado ou sem banco parecia saudável — e no SIGTERM chamava `process.exit`
na hora, cortando o job em andamento e deixando o pool aberto.

Decisões:

- **Log por job** nas três filas (inbox, canais, Meta): `job.started`, `job.finished` e
  `job.failed` com fila, id, tipo, tentativa, organização, duração em ms, status gravado na fila
  e a mensagem de erro saneada (mais tipo e pilha, ver G3F-7). Ciclo em `debug`
  (`worker.cycle`), falha de ciclo em `error`.
- **Loop com parada** (`job-loop.ts`): um ciclo por vez, o primeiro logo ao iniciar; `stop`
  para de pegar jobs e espera o ciclo em andamento até o limite, devolvendo `drained` ou
  `timeout`. O estado (falhas seguidas, último ciclo bem-sucedido, ciclo em andamento) alimenta
  o health.
- **Health HTTP** em `WORKER_HEALTH_PORT` (ausente: sem servidor): `GET /health` responde 200
  com o loop saudável e 503 com o motivo — `stopping`, `not_started`, `cycle_stuck` (ciclo
  passando de 5 min, o mesmo limite do reaper), `failing` (3 falhas seguidas) ou `stale` (sem
  ciclo bem-sucedido por 12 intervalos de poll, no mínimo 60 s). O corpo só tem estado do loop.
- **SIGTERM/SIGINT**: registra `worker.stopping`, para de pegar jobs, espera os em andamento até
  `WORKER_SHUTDOWN_TIMEOUT_MS` (padrão 20 s), fecha health e pool e deixa o processo terminar
  sozinho (`worker.stopped`). Estourado o limite: `worker.shutdown_timeout` em `error`,
  `exitCode 1` e `process.exit(1)` só depois de 1 s de folga — a execução interrompida volta à
  fila pelo reaper. No compose, `stop_grace_period: 30s` e healthcheck na porta 4001.

Consequências: o orquestrador passa a ter sinal de saúde do worker (o Coolify mostra
`unhealthy` sem reiniciar); um deploy derruba o worker esperando os jobs em andamento. Job
travado além do limite ainda termina em exit forçado — com log e reenfileiramento.

## G3F-6 — OTEL: instrumentação de HTTP, fetch e pg, ligada por endpoint (P2-11)

Status: Proposto.

Contexto: o tracer subia sem instrumentação nenhuma — com `OTEL_EXPORTER_OTLP_ENDPOINT`
definido, nenhum span era criado. O endpoint ia cru para o exportador (o coletor recebia POST na
raiz, não em `/v1/traces`) e o SDK ligava também exportadores de métricas e logs para
`localhost:4318`.

Decisões:

- `startTelemetry` (`packages/observability/src/telemetry.ts`) substitui `initTracer` e registra
  `@opentelemetry/instrumentation-http` (servidor e cliente `node:http`),
  `@opentelemetry/instrumentation-undici` (`fetch`, usado por todos os providers) e
  `@opentelemetry/instrumentation-pg`. Versões exatas do mesmo trem do `sdk-node` 0.221.0 já
  usado (`0.221.0`, `0.73.0` e `0.31.0`, todas Apache-2.0, do repositório oficial
  open-telemetry). Métricas e logs OTLP ficam desligados (esta fase é só tracing) e não há
  detectores de recurso — nada de linha de comando, usuário e máquina no recurso.
- Só liga com `OTEL_EXPORTER_OTLP_ENDPOINT` (a base do coletor; `/v1/traces` é acrescentado uma
  vez) ou com exportador injetado nos testes. Sem endpoint, nenhum instrumentador é registrado:
  a homologação atual não paga nada por telemetria.
- **Ordem de carga**: os instrumentadores só enxergam módulos carregados depois do
  `startTelemetry`. Os pontos de entrada validam a configuração, sobem a telemetria e só então
  importam o app por **import dinâmico**. O worker passa a entrar por
  `apps/worker/src/main.ts` (o `index.ts` continua sendo a biblioteca, importada pelos testes e
  pela API); compose, stack E2E e scripts apontam para o novo caminho.
- Spans do produto: request com a rota do Fastify (`http.route` e nome `GET /rota`), ciclo do
  worker (`worker.cycle`) e job (`job <tipo>`, com fila, id, tipo, tentativa e organização) —
  as queries pg e as chamadas de provider de cada job entram no mesmo trace.

Consequências: quem quiser traces aponta `OTEL_EXPORTER_OTLP_ENDPOINT` para um coletor e recebe
HTTP + pg + jobs correlacionados. Qualquer ponto de entrada novo precisa repetir a ordem
(configuração → telemetria → import dinâmico do app), e o `index.ts` do worker não deve voltar a
ser o comando do container.

## G3F-7 — Captura de erro sem Sentry: log estruturado com pilha e marca no span (P2-11)

Status: Proposto.

Contexto: não havia captura de erro. Um 5xx saía como `unhandled error` sem rota nem pilha
utilizável; falha de job só deixava a mensagem; `unhandledRejection` e `uncaughtException`
derrubavam o processo sem rastro. A opção óbvia seria o Sentry (`SENTRY_DSN` já aparecia no
`.env.example`, sem implementação).

Decisões: **não adotar Sentry nesta fase**. O SDK atual do Sentry para Node traz o próprio
OpenTelemetry e registra provider e instrumentadores por conta — conviveria com o tracing desta
trilha exigindo configuração para não duplicar, além de mandar dado de erro (com PII potencial)
para fora do servidor, o que a homologação não precisa. No lugar:

- `captureError` (`packages/observability/src/errors.ts`) registra `event=error.captured` com
  origem (`http_5xx`, `job_failed`, `unhandled_rejection`, `uncaught_exception`), contexto e
  pilha, e marca o span ativo com exceção e status de erro — o mesmo trace que já carrega HTTP e
  pg. `errorDetails` troca a primeira linha da pilha pela mensagem saneada, para que URL e token
  do provider não voltem pela pilha.
- 5xx da API sai com método, rota, código do Postgres e causa; 4xx não vira erro de servidor.
  Falha de job leva tipo e pilha junto da mensagem saneada. `unhandledRejection` e
  `uncaughtException` registram e levam ao encerramento gracioso com `exitCode 1`.
- `SENTRY_DSN` sai do `.env.example`. Se o produto precisar de agregação com alerta, o caminho é
  um coletor OTLP (os spans de erro já vão para lá) ou o Sentry com
  `skipOpenTelemetrySetup`, reutilizando o tracer desta trilha — decisão de outra fase.

Consequências: alerta depende de quem lê log/coletor; não há notificação automática de erro
enquanto não houver coletor na homologação.

## G3F-8 — Redação de dado pessoal nos logs: por caminho e por padrão de valor (P2-11)

Status: Proposto.

Contexto: o `redact` do logger cobria senha, token e `authorization`, mas não cookie, CPF,
e-mail nem telefone. A busca de pessoas aceita CPF, e-mail e telefone em `q`, e a URL inteira ia
para o log de requisição; mensagens de violação de unicidade do PostgreSQL trazem o valor
(`Key (email)=(...)`).

Decisões:

- **Por caminho** (pino `redact`): `cookie` e `set-cookie` em qualquer cabeçalho até dois
  níveis, além de `cpf`, `cnpj`, `document`, `email`, `phone`, `waContactId` e o valor das
  identidades.
- **Por padrão de valor** (`packages/observability/src/pii.ts`): e-mail, CPF e CNPJ formatados,
  telefone com `+55`, com DDD entre parênteses ou com hífen, `wa_id` (55 + 10 ou 11 dígitos) e
  11 dígitos soltos (ambíguos entre CPF sem máscara e celular com DDD, marcados como
  `[REDACTED:DOC]`). Vale na mensagem e nos argumentos (hook `logMethod`), numa **cópia** do
  objeto do log (o objeto de quem loga não é alterado) e no erro serializado — mensagem, pilha e
  causas.
- **Requisição do Fastify**: serializer próprio com os campos do padrão e a URL redigida; os
  valores de `q`, `query`, `search`, `email`, `cpf`, `cnpj` e `phone` saem inteiros.
- Identificador (UUID), data ISO, epoch em ms e s e valores em centavos continuam legíveis —
  há teste para isso, porque uma redação gulosa deixaria o log inútil.

Consequências: log de produção não serve para achar "o CPF que a pessoa digitou"; a
investigação usa id de entidade e de requisição. Padrão novo (por exemplo, RG ou CNH) precisa
entrar na lista com teste.

## G3F-9 — `audit_events.payload` com o diff dos campos alterados, sem dado pessoal (P2-11)

Status: Proposto.

Contexto: o payload chegava vazio nas atualizações — a trilha dizia "imóvel atualizado" sem
dizer o que mudou, e quem operasse não tinha como conferir uma alteração indevida.

Decisões: `auditDiff(before, after, opts)` (`apps/api/src/plugins/audit.ts`) compara o corpo da
atualização com o registro atual **pelo conteúdo** (datas em ISO; objeto e lista pela
serialização) e devolve `{ fields, changes: { campo: { from, to } } }` só com o que mudou.
`id`, `orgId`, `createdAt` e `updatedAt` ficam fora. Campo conhecido como pessoal (nome, e-mail,
telefone, documento, CPF, CNPJ, nascimento, contato de WhatsApp, IP, user agent, senha) aparece
como alterado com valor `[REDACTED]`; texto livre passa pela redação por padrão de valor e é
cortado em 200 caracteres. Aplicado em `PATCH /properties/:id` e na troca de papel de membro
(que grava só o id do usuário ao lado do diff do papel).

Consequências: rota de atualização nova deve passar o diff no `writeAudit`; campo pessoal novo
entra na lista de `PERSONAL_FIELDS` (ou é declarado por quem chama). O payload é trilha, não
cópia do registro: não serve para restaurar valor antigo de texto longo.

## G3F-10 — Runner de migration com trava consultiva e saída sem segredo (P2-12)

Status: Proposto.

Contexto: duas execuções simultâneas de `packages/db/scripts/apply-migrations.mjs` (dois
deploys, ou `migrate` reiniciado antes de o anterior terminar) leem "nada aplicado" e aplicam a
mesma cadeia ao mesmo tempo: a segunda falha no meio (`23505` em `pg_type`), deixando o deploy
vermelho com o banco em estado indefinido. A saída do script vai para o log do deploy.

Decisões: o runner usa um único cliente e uma trava consultiva do PostgreSQL —
`pg_try_advisory_lock` e, se ocupada, log de espera e `pg_advisory_lock` com `lock_timeout` de
10 minutos. Quem chega depois encontra a cadeia aplicada e não faz nada. A trava é da sessão:
se o processo morrer, o servidor a solta. Falha vira uma linha com motivo e código (sem pilha
nem objeto do driver), com a URL e a senha trocadas por `***`; em produção, sem `DATABASE_URL`,
o runner não cai no banco local padrão. Saída por `process.exitCode`, sem `process.exit`.

Consequências: o serviço `migrate` pode ser reexecutado sem risco de disputa; uma execução presa
bloqueia as outras por até 10 minutos (com log dizendo que está esperando).
