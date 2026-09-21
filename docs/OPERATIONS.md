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

O backup é a linha de comando `packages/db/src/backup/cli.ts` (G3, trilha F2), a mesma que o
serviço `backup` do compose agenda:

- **`backup`**: `pg_dump` em formato custom, cifrado em fluxo com AES-256-GCM (o dump não toca o
  disco em claro), em `BACKUP_DIR/aluguei-AAAAMMDDTHHMMSSZ.dump.enc`, mantendo os `BACKUP_KEEP`
  mais novos (padrão 14). A conexão vai por variáveis de ambiente, e a senha não aparece em
  argumento nem no log.
- **`schedule`**: um backup por dia em `BACKUP_HOUR_UTC` (padrão 6) e um logo ao subir, se o último
  tiver mais de 24 h. Grava `status.json` com o último backup bom, o último erro e a próxima
  execução.
- **`verify <arquivo>`**: decifra, autentica e confere o sumário com `pg_restore --list`.
- **`restore <arquivo>`**: decifra, autentica e restaura em `TARGET_DATABASE_URL` numa transação
  só. O destino precisa estar vazio.

Chave: `BACKUP_ENCRYPTION_KEY`, hex de 64 caracteres (32 bytes); na homologação,
`SERVICE_HEX_64_BACKUPKEY` do Coolify. **Sem a chave, o backup não abre**: guarde uma cópia dela
fora do servidor, junto com os arquivos.

```bash
# Backup manual (a partir da raiz do repositório)
DATABASE_URL=… BACKUP_DIR=./backups BACKUP_ENCRYPTION_KEY=…   node --import tsx packages/db/src/backup/cli.ts backup
```

Restauração:

```bash
# 1. Banco novo e vazio
createdb aluguei_restaurado
# 2. Conferir o arquivo e restaurar (pg_dump e pg_restore 17, ou PG_DUMP e PG_RESTORE)
BACKUP_ENCRYPTION_KEY=… node --import tsx packages/db/src/backup/cli.ts verify aluguei-….dump.enc
TARGET_DATABASE_URL=postgresql://…/aluguei_restaurado BACKUP_ENCRYPTION_KEY=…   node --import tsx packages/db/src/backup/cli.ts restore aluguei-….dump.enc
# 3. Apontar a aplicação para o banco restaurado e rodar /health/ready. As migrations já estão
#    no dump (estado final), inclusive a tabela de controle do drizzle.
```

Arquivo adulterado, truncado ou com a chave errada falha na autenticação ("Backup corrompido ou com
a chave errada") antes de qualquer escrita no destino. Destino com tabelas é recusado.

Verificação: `tests/integration/src/backup-restore.pg.test.ts` (em `pnpm test:pg`, no CI) faz
backup de um banco com locação, cobrança paga, split, repasse e razão, restaura num banco vazio e
compara todas as tabelas linha a linha.

Backup contínuo (PITR) depende de WAL archiving do provedor ou de um destino fora do servidor
(Fase 7).

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
