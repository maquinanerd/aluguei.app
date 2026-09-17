# Evidências — banco separado e storage (ops)

Execução de 2026-09-14/15 na branch `ops/storage-db`, a partir das decisões do usuário em
2026-09-14: PostgreSQL separado com backup agendado e MinIO no próprio Coolify.

| Arquivo             | O que prova                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage-red.log`   | **Controle negativo**: com endpoint próprio, o SDK assinava a URL com o bucket no host (`aluguei-private.s3.exemplo.test`), que o proxy do Coolify não atende, e o módulo `ensure-bucket` não existia. O teste de controle, sem a opção, passava. |
| `storage-green.log` | Depois da correção: pacote `@aluguei/storage` 24/24, incluindo 3 testes de path-style e 5 de `ensureBucket`.                                                                                                                                      |

## Saída do banco embutido (2026-09-17, ADR-062)

Verificação do `docker-compose.prod.yml` com `docker compose config`, sem daemon, num arquivo
temporário sem a chave `exclude_from_hc` (só o Coolify a entende; o Docker Compose a recusa).

| Arquivo                            | O que prova                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `embedded-postgres-exit-red.txt`   | Compose de `main` em `a31c88e` (o implantado): 6 falhas — serviços `postgres` e `db-copy`, imagem `postgres`, senha do banco embutido, `migrate` dependendo de `db-copy` e o volume montado para escrita                                                                                                                                             |
| `embedded-postgres-exit-green.txt` | Compose da branch: 11/11 — válido, sem banco embutido, `migrate` sem dependência, API e worker esperando `migrate`, e `aluguei-pgdata` ainda no modelo, montado só para leitura por `legacy-pgdata`. Numa primeira versão só com o volume declarado, sem serviço usando, `docker compose config --volumes` deixou de listá-lo; daí o `legacy-pgdata` |

## Registro de commits

O RED rodou antes da implementação: o log registra o commit base e a ausência de
`forcePathStyle` e de `ensure-bucket.ts`. A separação em commits, porém, não ficou no
histórico. O `.gitignore` recusava arquivos `.log`, os dois primeiros commits (teste RED e
implementação) não chegaram a ser criados e os arquivos já preparados entraram no commit
seguinte, `b21e3a3` ("feat(deploy): separate PostgreSQL resource and MinIO storage on
Coolify"), que já estava publicado. O histórico não foi reescrito.
