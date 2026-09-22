# G3 — Rascunho de ADR da trilha F2 (backup e restauração)

> **Consolidado** em `docs/DECISIONS.md` como ADR-079 no fechamento do G3 (2026-09-22). Este arquivo fica como registro do rascunho.

Rascunho para consolidar em `docs/DECISIONS.md` no fechamento do G3. Evidência em
`docs/audits/2026-09-10/evidence/g3/track-f2/`.

## Rascunho F2-1 — Backup cifrado com restauração provada

Contexto: a homologação tinha só o backup diário do próprio Coolify (dump sem cifra, no disco do
servidor, 14 cópias), e nenhuma restauração tinha sido provada. O plano pede backup com `pg_dump`,
retenção e criptografia, e restauração testada de forma automatizada; a cópia fora do servidor
depende de um destino do usuário (Fase 7).

Decisões:

- Linha de comando `packages/db/src/backup/cli.ts` (`@aluguei/db/backup`), com cinco comandos:
  `backup`, `restore`, `verify`, `schedule` e `health`.
- **Formato:** `ALUGUEI-BKP1` + IV + dump em formato custom cifrado com AES-256-GCM + etiqueta. A
  etiqueta autentica o arquivo inteiro: adulteração, truncamento ou chave errada falham antes de
  qualquer escrita no destino.
- **Cifra no backup:** em fluxo, direto da saída do `pg_dump`, então o dump não toca o disco em
  claro.
- **Decifra na restauração:** vai para um arquivo temporário que só sobrevive se a autenticação
  passar. Depois vem o `pg_restore --single-transaction --exit-on-error`.
- **Chave:** 32 bytes em hex (`BACKUP_ENCRYPTION_KEY`), na homologação `SERVICE_HEX_64_BACKUPKEY`
  do Coolify (`bin2hex(random_bytes(32))`). Nada de senha derivada: a chave já é aleatória e do
  tamanho certo.
- **Conexão:** por variáveis de ambiente (PGHOST, PGPASSWORD…), nunca em argumento. O log traz host,
  porta e banco, sem usuário e senha.
- **Restauração só em banco vazio:** um destino com tabelas é recusado, para ninguém restaurar por
  cima do banco em uso.
- **Retenção:** os `BACKUP_KEEP` mais novos (padrão 14), escolhidos pelo nome, que carrega o
  instante UTC. Arquivos com outro nome não são tocados.
- **Agendamento:** serviço `backup` no compose, na imagem `server` com `pg_dump` 17 do repositório
  oficial do PostgreSQL. O bookworm traz a 15, que não lê um banco 17. Um backup por dia às 06:00
  UTC, e um na subida se o último tiver mais de 24 h.
- **Saúde:** `status.json` com o último backup bom, o último erro e a próxima execução. O
  healthcheck fica vermelho sem backup bom em 26 h, e o Coolify mostra a aplicação sem saúde.
- **Prova:** `backup-restore.pg.test.ts`, em `pnpm test:pg` no CI, com o cliente 17 instalado no
  job. Faz backup de um banco com locação, cobrança paga, split, repasse e razão pela mesma linha de
  comando, restaura num banco vazio e compara todas as tabelas (contagem e hash das linhas).

Consequências:

- **Chave:** a chave existe só no Coolify. Sem uma cópia dela fora do servidor, os backups cifrados
  não abrem se o VPS se perder. A guarda da chave e o destino externo são do usuário (Fase 7).
- **Dois backups:** o backup do Coolify continua, como segundo caminho, sem cifra.
- **Sem PITR:** não há backup contínuo; depende de WAL archiving ou de destino externo.
- **Arquivos do MinIO:** seguem sem backup (limitação registrada no deploy).
