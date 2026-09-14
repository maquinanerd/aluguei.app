# Deploy de homologação — Coolify

Ambiente de homologação do Aluguei.app no Coolify do usuário (`https://vps.cinerie.com`).
Providers em **FAKE / dry-run / mock**: nenhuma cobrança, Pix, boleto, assinatura,
consulta de crédito, mensagem ou publicação real.

## Endereços

| Serviço | URL                                           |
| ------- | --------------------------------------------- |
| Web     | `https://aluguei.62.171.164.224.sslip.io`     |
| API     | `https://api.aluguei.62.171.164.224.sslip.io` |

`cinerie.com` não tem DNS curinga e o DNS fica no Cloudflare, então os domínios usam
`sslip.io` (resolve para o IP do VPS) com certificado Let's Encrypt emitido pelo proxy do
Coolify. Para um domínio próprio: criar o registro DNS apontando para o VPS e trocar os
domínios dos serviços `web` e `api` no recurso, junto com `APP_BASE_URL` e `API_BASE_URL`.

## Recurso no Coolify

| Item          | Valor                                                   |
| ------------- | ------------------------------------------------------- |
| Projeto       | `Aluguei.app` (ambiente `production`)                   |
| Aplicação     | `aluguei-app` — build pack Docker Compose               |
| Repositório   | `maquinanerd/aluguei.app` (público)                     |
| Compose       | `/docker-compose.prod.yml`                              |
| Auto-deploy   | desligado — deploy manual pelo painel ou pela API       |
| Outro projeto | `CMS Kal-El` convive no mesmo servidor e não é alterado |

## Topologia (`docker-compose.prod.yml`)

| Serviço    | Imagem / alvo           | Papel                                                                     |
| ---------- | ----------------------- | ------------------------------------------------------------------------- |
| `postgres` | `postgres:17`           | banco, volume `aluguei-pgdata`                                            |
| `migrate`  | `Dockerfile` → `server` | aplica as migrations e termina; `api` e `worker` só sobem se ela concluir |
| `api`      | `Dockerfile` → `server` | Fastify via tsx, porta 4000, healthcheck `/health/ready`                  |
| `worker`   | `Dockerfile` → `server` | fila do Postgres (pagamentos, assinatura, screening, canais, Meta)        |
| `web`      | `Dockerfile` → `web`    | Next.js (`next start`), porta 3000, healthcheck `/login`                  |

API, worker e migrations rodam TypeScript com tsx: os pacotes do workspace exportam
`src/*.ts` e o `dist/` do tsc não é executável. Por isso a imagem `server` instala também
as devDependencies.

## Variáveis

Geradas pelo Coolify (variáveis mágicas, persistem entre deploys, nunca no repositório):
`SERVICE_PASSWORD_64_POSTGRES`, `SERVICE_HEX_64_SIGNATUREWEBHOOK`,
`SERVICE_HEX_64_ASAASWEBHOOK`, `SERVICE_HEX_64_METAAPPSECRET`, `SERVICE_HEX_64_METAVERIFY`,
`SERVICE_HEX_64_METATOKENKEY`.

Definidas no recurso:

| Variável          | Valor                                         |
| ----------------- | --------------------------------------------- |
| `APP_BASE_URL`    | URL do web (também usada como `CORS_ORIGINS`) |
| `API_BASE_URL`    | URL da API — precisa ser `https://`           |
| `PUBLIC_ORG_SLUG` | opcional (vitrine pública)                    |

Fixas no compose: `NODE_ENV=production`, `COOKIE_SECURE=true`, `PAYMENT_PROVIDER=FAKE`,
`SIGNATURE_PROVIDER=FAKE`, `SCREENING_PROVIDER=FAKE`, `META_MODE=dry_run`,
`AI_PROVIDER=mock`. Os providers são fixados explicitamente porque os defaults divergem: sem
variável, o worker em produção usaria SERASA para screening.

## Limitações conhecidas desta homologação

| Limitação                                                                                                                                                                | Origem                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Pagamento FAKE não pode ser simulado: a rota `/dev/fake-payments` só existe fora de produção, então cobranças ficam `PENDING`                                            | `apps/api/src/app.ts` (proteção intencional) |
| Upload de mídia desligado: sem `STORAGE_*` a API responde "Storage não configurado"                                                                                      | Fase 7.1 (Storage em sandbox)                |
| Sem Redis: rate limit em memória por processo; preencher `REDIS_URL` derruba a API                                                                                       | P1-14 (Fase 6)                               |
| Todos os clientes dividem o mesmo limite de requisições: `trustProxy: 'loopback'` e o web chama a API pelo proxy, então a API vê um único IP (10/min nas rotas de login) | Fase 6                                       |
| O web chama a API pelo domínio público, não pela rede interna: `API_BASE_URL` sem https é recusada                                                                       | P1-15 (Fase 6)                               |
| Sem backup automático do volume do Postgres                                                                                                                              | Fase 6                                       |

## Operação

- **Deploy**: painel do Coolify → `aluguei-app` → Deploy, ou `POST /api/v1/deploy?uuid=<app>`
  com um token de API que tenha permissão de deploy. Tokens usados em sessões assistidas
  devem ser revogados depois.
- **Status e logs**: `GET /api/v1/deployments/applications/<app>` e
  `GET /api/v1/deployments/<deployment>`; logs dos containers no painel.
- **Rollback**: redeploy de um commit anterior (o schema é forward-only; migrations
  destrutivas exigem migração própria).
- **Backup manual**: no terminal do container `postgres`,
  `pg_dump -U aluguei -d aluguei --format=custom --file=/tmp/aluguei.dump`, e copiar o
  arquivo para fora do servidor.
