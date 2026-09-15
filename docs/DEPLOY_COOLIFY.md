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

| Serviço        | Imagem / alvo                              | Papel                                                                                                               |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `migrate`      | `Dockerfile` → `server`                    | aplica as migrations no banco próprio e termina                                                                     |
| `minio`        | `ghcr.io/coollabsio/minio` (versão fixada) | storage compatível com S3, volume `aluguei-minio-data`                                                              |
| `storage-init` | `Dockerfile` → `server`                    | garante o bucket privado e termina (idempotente)                                                                    |
| `api`          | `Dockerfile` → `server`                    | Fastify via tsx, porta 4000, healthcheck `/health/ready`; só sobe depois de `migrate` e `storage-init` concluírem   |
| `worker`       | `Dockerfile` → `server`                    | fila do Postgres (pagamentos, assinatura, screening, canais, Meta)                                                  |
| `web`          | `Dockerfile` → `web`                       | Next.js (`next start`), porta 3000, healthcheck `/login`                                                            |
| `postgres`     | `postgres:17`                              | **transitório** — banco embutido da primeira implantação, só origem da cópia                                        |
| `db-copy`      | `Dockerfile` → `dbcopy`                    | **transitório** — copiou o banco embutido no corte; nas execuções seguintes vê o destino com tabelas e não faz nada |

API, worker, migrations e `storage-init` rodam TypeScript com tsx: os pacotes do workspace exportam
`src/*.ts` e o `dist/` do tsc não é executável. Por isso a imagem `server` instala também as
devDependencies.

### Corte para o banco próprio (2026-09-15)

O banco próprio estava vazio antes do corte (os dois primeiros backups têm 836 bytes). Depois dele, a
rota pública da API responde com o erro de domínio `NOT_FOUND` para um slug inexistente: a tabela
`organizations` existe no banco que a API usa. Evidência:
`docs/audits/2026-09-10/evidence/deploy/smoke-2026-09-15.txt`.

`postgres` e `db-copy` saem do compose depois de confirmado que nenhum dado do banco embutido ficou
para trás. Até lá, o volume `aluguei-pgdata` continua registrado no recurso.

## Variáveis

Geradas pelo Coolify (variáveis mágicas, persistem entre deploys, nunca no repositório):
`SERVICE_USER_MINIO`, `SERVICE_PASSWORD_MINIO`, `SERVICE_HEX_64_SIGNATUREWEBHOOK`,
`SERVICE_HEX_64_ASAASWEBHOOK`, `SERVICE_HEX_64_METAAPPSECRET`, `SERVICE_HEX_64_METAVERIFY`,
`SERVICE_HEX_64_METATOKENKEY` e, enquanto o banco embutido existir, `SERVICE_PASSWORD_64_POSTGRES`.

Definidas no recurso:

| Variável           | Valor                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `DATABASE_URL`     | URL interna do banco próprio, com a senha — existe só no Coolify   |
| `APP_BASE_URL`     | URL do web (também usada como `CORS_ORIGINS`)                      |
| `API_BASE_URL`     | URL da API — precisa ser `https://`                                |
| `STORAGE_ENDPOINT` | URL pública do MinIO — o navegador envia o arquivo direto para ela |
| `PUBLIC_ORG_SLUG`  | opcional (vitrine pública)                                         |

Fixas no compose: `NODE_ENV=production`, `COOKIE_SECURE=true`, `STORAGE_BUCKET=aluguei-private`,
`STORAGE_REGION=us-east-1`, `STORAGE_FORCE_PATH_STYLE=true`, `PAYMENT_PROVIDER=FAKE`,
`SIGNATURE_PROVIDER=FAKE`, `SCREENING_PROVIDER=FAKE`, `META_MODE=dry_run`, `AI_PROVIDER=mock`. Os
providers são fixados explicitamente porque os defaults divergem: sem variável, o worker em produção
usaria SERASA para screening.

`STORAGE_FORCE_PATH_STYLE=true` é obrigatório com MinIO atrás de domínio próprio: sem ele o SDK assina
a URL com o bucket no host (`aluguei-private.s3.aluguei…`), que o proxy não atende.

## Limitações conhecidas desta homologação

| Limitação                                                                                                                                                                                   | Origem                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Backups do banco no mesmo servidor: protegem contra erro humano e corrupção, não contra perda do VPS; falta cópia fora do servidor                                                          | Fase 6                                       |
| Arquivos do MinIO sem backup                                                                                                                                                                | Fase 6                                       |
| MinIO comunitário: a MinIO deixou de publicar imagens da edição comunitária; a imagem usada é a build mantida pelo Coolify, com versão fixada. Reavaliar storage gerenciado antes do piloto | ADR-046                                      |
| Existência do bucket só inferida (a API depende de `storage-init`); a prova direta é o primeiro upload autenticado                                                                          | deploy de 2026-09-15                         |
| Cadastro de imobiliária aberto, sem aprovação e sem admin da plataforma                                                                                                                     | próximo trabalho (decisão de 2026-09-14)     |
| Pagamento FAKE não pode ser simulado: a rota `/dev/fake-payments` só existe fora de produção, então cobranças ficam `PENDING`                                                               | `apps/api/src/app.ts` (proteção intencional) |
| Sem Redis: rate limit em memória por processo; preencher `REDIS_URL` derruba a API                                                                                                          | P1-14 (Fase 6)                               |
| Todos os clientes dividem o mesmo limite de requisições: `trustProxy: 'loopback'` e o web chama a API pelo proxy, então a API vê um único IP (10/min nas rotas de login)                    | Fase 6                                       |
| O web chama a API pelo domínio público, não pela rede interna: `API_BASE_URL` sem https é recusada                                                                                          | P1-15 (Fase 6)                               |
| Web sem `Strict-Transport-Security`; CSP com `'unsafe-inline'` e `'unsafe-eval'`                                                                                                            | Fase 6                                       |

## Operação

- **Deploy**: painel do Coolify → `aluguei-app` → Deploy, ou `POST /api/v1/deploy?uuid=<app>` com um
  token de API que tenha permissão de deploy. Tokens usados em sessões assistidas devem ser
  revogados depois.
- **Status**: `GET /api/v1/deployments/applications/<app>` e `GET /api/v1/deployments/<deployment>`.
  Logs de build e de containers exigem a permissão `read:sensitive` no token, ou o painel.
- **Rollback**: redeploy de um commit anterior (o schema é forward-only; migrations destrutivas
  exigem migração própria).
- **Backup e restauração do banco**: painel do Coolify → `aluguei-postgres` → Backups. Para uma
  cópia fora do servidor, baixar o dump pelo painel ou configurar um destino S3 externo.
- **Arquivos**: bucket `aluguei-private`, no volume `aluguei-minio-data` do recurso `aluguei-app`.
