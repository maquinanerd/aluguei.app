# Operações — backup/restore e deploys

Documento operacional mínimo (Fase 11). Assume PostgreSQL gerenciado e storage S3-compatível (R2/S3) como infraestrutura.

## Topologia

- **API**: `apps/api` (Fastify) — stateless; sessões e fila vivem no Postgres.
- **Worker**: `apps/worker` — processa `webhook_inbox`, `channel_sync_jobs`, `meta_sync_jobs`.
- **MCP**: `apps/meta-mcp` (stdio) — usa o mesmo Postgres.
- **Web**: `apps/web` (Next.js) — proxy para a API.
- **Storage**: presigned PUT em R2/S3 (mídia de imóveis/vistorias).

## Dados

| Dado                                                                         | Local    | Estratégia                                                                     |
| ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| Dados transacionais (org, parties, leases, charges, ledger, contratos, Meta) | Postgres | backup diário + PITR                                                           |
| Mídia (fotos de imóveis, vistorias)                                          | R2/S3    | versionamento do bucket + replicação                                           |
| Sessões/fila                                                                 | Postgres | incluídas no backup (tolerância a perda de jobs em andamento: reaper recupera) |

## Backup do Postgres

```bash
# Full dump (schema + dados), diário, fora do horário de pico
pg_dump --format=custom --file=backup-$(date +%F).dump "$DATABASE_URL"

# Backup contínuo/PITR: habilitar WAL archiving do provider gerenciado
# (RDS/Cloud SQL/Supabase: point-in-time recovery com retenção >= 7 dias)
```

Restauração:

```bash
# Recriar banco a partir do dump
createdb "$DATABASE_URL_NOVA"
pg_restore --dbname="$DATABASE_URL_NOVA" --no-owner backup-$(date +%F).dump
# Migrations já estão embutidas no dump (estado final). Para drift: pnpm --filter @aluguei/db db:generate
```

Verificação: restaurar mensalmente em banco de teste e rodar `/health/ready` + contagem de orgs.

## Restore de storage

```bash
# R2/S3: reverter por version ID ou copiar de bucket de backup
aws s3 cp s3://bucket/backups/2026-08-14/ s3://bucket/ --recursive
```

Mídia é referenciada por `storage_key` estável (uuid) — restaurar para o mesmo prefixo não quebra referências.

## Health e readiness

- `GET /health` — liveness (processo vivo).
- `GET /health/ready` — readiness (checa `select 1` no Postgres; 503 quando indisponível).
- Usar readiness como probe de deploy/rollback e no load balancer.

## SLOs (ver docs/SLO.md)

- Disponibilidade do plano de dados: 99.9% mensal (manutenções programadas fora do SLO).
- p95 de latência da API < 300ms (exclui webhooks/importação).
- RPO ≤ 24h (backup diário) + PITR ≤ 5min quando habilitado; RTO ≤ 4h (restore guiado).

## Deploy seguro

1. Rodar `pnpm check` (format/lint/typecheck/test) + `pnpm security:scan`.
2. Aplicar migrations antes de subir nova versão da API (`db:generate` valida drift no CI).
3. `GET /health/ready` verde antes de liberar tráfego.
4. Rollback: reverter o deploy da API (schema é forward-only nesta fase; mudanças destrutivas exigem migração própria).
