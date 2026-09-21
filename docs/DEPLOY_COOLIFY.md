# Deploy de homologação — Coolify

Ambiente de homologação do Aluguei.app no Coolify do usuário (`https://vps.cinerie.com`).
Providers em **FAKE / dry-run / mock**: nenhuma cobrança, Pix, boleto, assinatura, consulta de
crédito, mensagem ou publicação real.

## Endereços

| Serviço          | URL                                           |
| ---------------- | --------------------------------------------- |
| Web              | `https://aluguei.62.171.164.224.sslip.io`     |
| API              | `https://api.aluguei.62.171.164.224.sslip.io` |
| Storage (API S3) | `https://s3.aluguei.62.171.164.224.sslip.io`  |

`cinerie.com` não tem DNS curinga e o DNS fica no Cloudflare, então os domínios usam `sslip.io`
(resolve para o IP do VPS) com certificado Let's Encrypt emitido pelo proxy do Coolify. Para um
domínio próprio: criar os registros DNS apontando para o VPS e trocar os domínios dos serviços
`web`, `api` e `minio` no recurso, junto com `APP_BASE_URL`, `API_BASE_URL` e `STORAGE_ENDPOINT`.

O console do MinIO (porta 9001) não tem domínio público: expô-lo com as credenciais root seria risco
sem necessidade.

## Recursos no Coolify

| Item            | Valor                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| Projeto         | `Aluguei.app` (ambiente `production`)                                          |
| Aplicação       | `aluguei-app` — build pack Docker Compose, `/docker-compose.prod.yml`          |
| Banco           | `aluguei-postgres` — PostgreSQL 17, recurso próprio, sem porta pública         |
| Backup do banco | diário às 05:00 (relógio do servidor), 14 cópias retidas, no disco do servidor |
| Repositório     | `maquinanerd/aluguei.app` (público)                                            |
| Auto-deploy     | desligado — deploy manual pelo painel ou pela API                              |
| Outro projeto   | `CMS Kal-El` convive no mesmo servidor e não é alterado                        |

## Onde ficam os dados

| Dado                                                                 | Onde                                                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Imobiliárias, usuários, imóveis, leads, contratos, cobranças, ledger | banco `aluguei-postgres`                                                                                        |
| Sessões e fila de jobs                                               | banco `aluguei-postgres`                                                                                        |
| Fotos de imóveis e mídias de vistoria                                | MinIO, bucket privado `aluguei-private`, volume `aluguei-minio-data`; o banco guarda só a chave de cada arquivo |
| Backups do banco                                                     | `/data/coolify/backups/databases/…` no próprio servidor                                                         |

## Topologia (`docker-compose.prod.yml`)

| Serviço         | Imagem / alvo                              | Papel                                                                                                                                                               |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate`       | `Dockerfile` → `server`                    | aplica as migrations no banco próprio e termina                                                                                                                     |
| `minio`         | `ghcr.io/coollabsio/minio` (versão fixada) | storage compatível com S3, volume `aluguei-minio-data`                                                                                                              |
| `storage-init`  | `Dockerfile` → `server`                    | garante o bucket privado e termina (idempotente)                                                                                                                    |
| `api`           | `Dockerfile` → `server`                    | Fastify via tsx, porta 4000, healthcheck `/health/ready`; só sobe depois de `migrate` e `storage-init` concluírem                                                   |
| `worker`        | `Dockerfile` → `server`                    | fila do Postgres (pagamentos, assinatura, screening, canais, Meta); entra por `apps/worker/src/main.ts`, com health HTTP na porta 4001 (só dentro do container)     |
| `web`           | `Dockerfile` → `web`                       | Next.js (`next start`), porta 3000, healthcheck `/login`                                                                                                            |
| `legacy-pgdata` | `busybox:1.36`                             | monta só para leitura o volume `aluguei-pgdata` (dados do banco embutido da primeira implantação) e termina; existe só para o volume continuar no recurso (ADR-062) |

API, worker, migrations e `storage-init` rodam TypeScript com tsx: os pacotes do workspace exportam
`src/*.ts` e o `dist/` do tsc não é executável. Por isso a imagem `server` instala também as
devDependencies.

### Corte para o banco próprio (2026-09-15)

O banco próprio estava vazio antes do corte (os dois primeiros backups têm 836 bytes). Depois dele, a
rota pública da API responde com o erro de domínio `NOT_FOUND` para um slug inexistente: a tabela
`organizations` existe no banco que a API usa. Evidência:
`docs/audits/2026-09-10/evidence/deploy/smoke-2026-09-15.txt`.

### Saída do banco embutido (2026-09-17, ADR-062)

`postgres` e `db-copy` saíram do compose. A cópia do corte rodou antes de `migrate`, com o banco
próprio vazio, e a API só sobe depois de `migrate`; como a API subiu no corte usando o banco próprio,
a cópia terminou sem erro. Depois do corte nenhum serviço escreveu no banco embutido. O volume
`aluguei-pgdata` continua no servidor, montado só para leitura pelo serviço `legacy-pgdata`.

Implantado em 2026-09-17 (deployment `ywliscni4xixfdzkmhllpws3`, merge `0673a54`): o registro do
volume no recurso é o mesmo de antes, agora montado em `/legacy-pgdata`, e o smoke passou 14/14.
Evidência: `docs/audits/2026-09-10/evidence/deploy/coolify-mcp-2026-09-17-sem-postgres-embutido.txt`
e `smoke-2026-09-17-sem-postgres-embutido.txt`.

- **Voltar a ler os dados antigos**: acrescentar ao compose um serviço `postgres:17` com
  `aluguei-pgdata:/var/lib/postgresql/data` e a senha da variável `SERVICE_PASSWORD_64_POSTGRES`, que
  continuou no recurso depois da saída (conferido pelo MCP em 2026-09-17).
- **Apagar os dados antigos** (irreversível): tirar `legacy-pgdata` e o volume do compose, implantar
  e apagar o volume em Storages do recurso no painel do Coolify. Só com pedido explícito do usuário.

## Variáveis

Geradas pelo Coolify (variáveis mágicas, persistem entre deploys, nunca no repositório):
`SERVICE_USER_MINIO`, `SERVICE_PASSWORD_MINIO`, `SERVICE_HEX_64_SIGNATUREWEBHOOK`,
`SERVICE_HEX_64_ASAASWEBHOOK`, `SERVICE_HEX_64_METAAPPSECRET`, `SERVICE_HEX_64_METAVERIFY`,
`SERVICE_HEX_64_METATOKENKEY`. `SERVICE_PASSWORD_64_POSTGRES`, senha do banco embutido, não é mais
usada pelo compose.

Definidas no recurso:

| Variável                | Valor                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | URL interna do banco próprio, com a senha — existe só no Coolify                             |
| `APP_BASE_URL`          | URL do web (também usada como `CORS_ORIGINS`)                                                |
| `API_BASE_URL`          | URL da API — precisa ser `https://`                                                          |
| `STORAGE_ENDPOINT`      | URL pública do MinIO — o navegador envia o arquivo direto para ela                           |
| `PUBLIC_ORG_SLUG`       | opcional (vitrine pública)                                                                   |
| `PLATFORM_ADMIN_EMAILS` | e-mails dos admins da plataforma, separados por vírgula; vazio: ninguém acessa `/plataforma` |

Fixas no compose: `NODE_ENV=production`, `COOKIE_SECURE=true`, `STORAGE_BUCKET=aluguei-private`,
`STORAGE_REGION=us-east-1`, `STORAGE_FORCE_PATH_STYLE=true`, `PAYMENT_PROVIDER=FAKE`,
`SIGNATURE_PROVIDER=FAKE`, `SCREENING_PROVIDER=FAKE`, `META_MODE=dry_run`, `AI_PROVIDER=mock`,
`ALLOW_FAKE_PROVIDERS=true`, `WORKER_HEALTH_PORT=4001` e `WORKER_SHUTDOWN_TIMEOUT_MS=20000`.

Desde o G3 (Trilha F) a escolha de provider é obrigatória em produção e **não há mais default**:
sem `PAYMENT_PROVIDER`, `SIGNATURE_PROVIDER`, `SCREENING_PROVIDER`, `META_MODE` ou `AI_PROVIDER`, a
API e o worker não sobem e imprimem a lista do que falta (o mesmo vale para `NODE_ENV`,
`DATABASE_URL`, `APP_BASE_URL` https, `COOKIE_SECURE` diferente de `false`, os quatro segredos de
webhook e `META_TOKEN_ENCRYPTION_KEY`). Como a homologação usa FAKE, mock e dry-run de propósito,
`ALLOW_FAKE_PROVIDERS=true` é a permissão explícita para isso — sem ela, os dois processos recusam
a subida dizendo quais providers são FAKE. Com ela, cada um registra um aviso no boot.

Opcionais, não definidas hoje:

| Variável                      | Para quê                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                   | rate limit compartilhado entre instâncias da API (P1-14 corrigido: com a URL preenchida a API sobe; com o Redis fora do ar a requisição passa sem contar e o erro vai no log) |
| `API_BASE_URL_ALLOW_HTTP`     | `true` libera o web a falar com a API pela rede interna (`API_BASE_URL=http://api:4000`), só para endereço interno; sem ela, `API_BASE_URL` continua tendo de ser https       |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | base de um coletor OTLP/HTTP (ex.: `http://coletor:4318`); com ela, API e worker exportam spans de HTTP, `fetch`, `pg`, ciclo e job. Sem ela, nada de telemetria              |

`STORAGE_FORCE_PATH_STYLE=true` é obrigatório com MinIO atrás de domínio próprio: sem ele o SDK assina
a URL com o bucket no host (`aluguei-private.s3.aluguei…`), que o proxy não atende.

## Limitações conhecidas desta homologação

| Limitação                                                                                                                                                                                   | Origem                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Backups do banco no mesmo servidor: protegem contra erro humano e corrupção, não contra perda do VPS; falta cópia fora do servidor                                                          | Fase 6                                       |
| Arquivos do MinIO sem backup                                                                                                                                                                | Fase 6                                       |
| MinIO comunitário: a MinIO deixou de publicar imagens da edição comunitária; a imagem usada é a build mantida pelo Coolify, com versão fixada. Reavaliar storage gerenciado antes do piloto | ADR-046                                      |
| Existência do bucket só inferida (a API depende de `storage-init`); a prova direta é o primeiro upload autenticado                                                                          | deploy de 2026-09-15                         |
| Aprovação do cadastro sem aviso: a imobiliária só descobre a aprovação, a recusa ou a suspensão ao entrar (envio real de e-mail ou WhatsApp está fora desta fase)                           | ADR-060 (Fase 7)                             |
| Suspensão fecha painel, portal e site público, mas não despublica anúncios já enviados a canais externos nem para jobs do worker (webhooks de pagamento seguem sendo processados)           | ADR-060                                      |
| Pagamento FAKE não pode ser simulado: a rota `/dev/fake-payments` só existe fora de produção, então cobranças ficam `PENDING`                                                               | `apps/api/src/app.ts` (proteção intencional) |
| Sem Redis: rate limit em memória por processo (uma instância hoje). Preencher `REDIS_URL` já é seguro — a API não cai mais no boot                                                          | P1-14 fechado no G3 (Trilha F)               |
| Sem coletor OTLP: nenhum span é exportado (a instrumentação existe e liga com `OTEL_EXPORTER_OTLP_ENDPOINT`); a investigação hoje é por log estruturado                                     | Trilha F (G3)                                |
| Captura de erro sem serviço externo: erro 5xx, falha de job e exceção sem tratamento ficam no log (`event=error.captured`) e no span; não há alerta automático                              | ADR G3F-7                                    |
| Todos os clientes dividem o mesmo limite de requisições: `trustProxy: 'loopback'` e o web chama a API pelo proxy, então a API vê um único IP (10/min nas rotas de login)                    | Fase 6                                       |
| O web chama a API pelo domínio público, não pela rede interna. A troca é possível desde o G3 (`API_BASE_URL=http://api:4000` com `API_BASE_URL_ALLOW_HTTP=true`), mas exige smoke no deploy | P1-15 (opção liberada na Trilha F)           |
| Web sem `Strict-Transport-Security`; CSP com `'unsafe-inline'` e `'unsafe-eval'`                                                                                                            | Fase 6                                       |

## Admin da plataforma

Cadastro aberto de imobiliária nasce **em análise** e só opera depois de aprovado em `/plataforma`
(ADR-060). Quem acessa a área é definido pela variável `PLATFORM_ADMIN_EMAILS`:

1. Painel do Coolify → `aluguei-app` → Environment Variables → `PLATFORM_ADMIN_EMAILS` com o seu
   e-mail (vários separados por vírgula) → Redeploy.
2. Conta com esse e-mail:
   - **Já existe** (por exemplo, a sua imobiliária cadastrada antes): nada a fazer. Ao entrar, o menu
     da conta mostra "Admin da plataforma".
   - **Não existe**: o cadastro aberto recusa e-mails da lista, então a conta nasce no servidor.
     Painel do Coolify → `aluguei-app` → Terminal → container `api`:

     ```bash
     node --import tsx apps/api/src/cli/create-platform-admin.ts --email voce@exemplo.com --name "Seu nome"
     ```

     A senha é pedida sem eco (mínimo de 12 caracteres) e nunca vai em argumento ou log.

3. Entrar em `/login`: sem imobiliária, a pessoa cai direto em `/plataforma`.

Na área: fila de cadastros em análise, busca por nome, e-mail do responsável ou CNPJ, aprovar
(escolhendo o plano), recusar e suspender com motivo (a imobiliária vê o motivo), reativar, trocar
plano e criar ou editar planos. Imobiliárias que já existiam antes da migration 0018 continuam ativas,
no plano ILIMITADO.

## Operação

- **Deploy**: painel do Coolify → `aluguei-app` → Deploy, ou `POST /api/v1/deploy?uuid=<app>` com um
  token de API que tenha permissão de deploy. Tokens usados em sessões assistidas devem ser
  revogados depois.
- **Saúde do worker**: healthcheck do próprio container em `http://127.0.0.1:4001/health` (200 com
  o loop de jobs saudável; 503 com o motivo — parando, ciclo preso há mais de 5 min, três falhas
  seguidas ou nenhum ciclo bem-sucedido há mais de 60 s). Sem domínio público. No deploy, o worker
  recebe SIGTERM, para de pegar jobs e espera os em andamento até 20 s (`stop_grace_period` de 30 s).
- **Status**: `GET /api/v1/deployments/applications/<app>` e `GET /api/v1/deployments/<deployment>`.
  Logs de build e de containers exigem a permissão `read:sensitive` no token, ou o painel.
- **Rollback**: redeploy de um commit anterior (o schema é forward-only; migrations destrutivas
  exigem migração própria).
- **Backup e restauração do banco**: painel do Coolify → `aluguei-postgres` → Backups. Para uma
  cópia fora do servidor, baixar o dump pelo painel ou configurar um destino S3 externo.
- **Arquivos**: bucket `aluguei-private`, no volume `aluguei-minio-data` do recurso `aluguei-app`.
