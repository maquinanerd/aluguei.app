# Evidências — G3, trilha F2 (backup e restauração)

Escopo (plano do G3, trilha F2, Fase 6): backup com `pg_dump`, retenção e criptografia, e
restauração testada de forma automatizada. A cópia fora do servidor depende de um destino do usuário
(Fase 7). Rascunho de decisão em `docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_F2.md`.

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1, PostgreSQL 17.10 local), sem cores ANSI.
Sem efeito externo. Cada arquivo começa com o comando, a árvore e a data (UTC) e termina com
`# exit=<código>`.

Base: `main` em `52e2582` (trilhas C, E1 e F mescladas), branch `g3/track-f2-backup`.

## RED

| Arquivo              | O que prova                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit-red.txt`       | Formato do backup antes do módulo: `@aluguei/db/backup` não existe (o arquivo de teste não carrega)                                                                                             |
| `restore-pg-red.txt` | PostgreSQL real, 4 de 4 antes da linha de comando: sem `packages/db/src/backup/cli.ts` não há backup, restauração, recusa de adulteração nem retenção                                           |
| `compose-red.txt`    | Compose e Dockerfile de `main` (`33add42`): 3 ok e 13 falhas — sem serviço de backup, sem volume `aluguei-backups`, sem chave do Coolify e com a imagem sem `pg_dump` 17 (o bookworm traz a 15) |

## GREEN

| Arquivo                | O que prova                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit-green.txt`       | 5/5: cifra e decifra sem perder byte (vazio, 17 bytes e 3 MB) e sem o conteúdo em claro no arquivo; adulteração, chave errada e truncamento recusados sem deixar saída; arquivo que não é backup recusado; chave hex de 64; nome com o instante UTC; retenção dos N mais novos                                    |
| `restore-pg-green.txt` | PostgreSQL real 4/4: backup de um banco com locação, cobrança paga, split, repasse e razão pela linha de comando; restauração num banco vazio com todas as tabelas iguais (contagem e hash das linhas); adulterado e chave errada sem tocar o destino; destino com dados recusado; retenção depois do backup      |
| `compose-green.txt`    | 16/16: compose válido; serviço `backup` na imagem server, agendado, depois de `migrate`, com healthcheck; chave de `SERVICE_HEX_64_BACKUPKEY` e banco de `DATABASE_URL`; volume `aluguei-backups` com escrita; invariantes do ADR-062; Dockerfile com `postgresql-client-17` do PGDG e `/backups` do usuário node |

O build da imagem não rodou nesta máquina: o motor do Docker não sobe (o WSL está sem distribuições).
A prova do build e do agendamento é o deploy, pelo MCP do Coolify: aplicação saudável, volume
`aluguei-backups` e `SERVICE_HEX_64_BACKUPKEY` criados, e o healthcheck do serviço verde.
