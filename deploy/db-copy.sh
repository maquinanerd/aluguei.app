#!/bin/sh
# Copia o banco embutido da primeira implantação (SOURCE) para o recurso
# PostgreSQL próprio do Coolify (TARGET), uma única vez: se o destino já tem
# tabelas, não faz nada. As URLs contêm senha e nunca são impressas.
set -eu

count_tables() {
  psql "$1" -tAc "select count(*) from pg_tables where schemaname in ('public', 'drizzle')"
}

existing=$(count_tables "$TARGET")
if [ "$existing" -gt 0 ]; then
  echo "db-copy: destino já tem $existing tabela(s); cópia ignorada"
  exit 0
fi

pg_dump --format=custom --no-owner --no-privileges --file=/tmp/aluguei.dump "$SOURCE"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" /tmp/aluguei.dump
rm -f /tmp/aluguei.dump

echo "db-copy: cópia concluída ($(count_tables "$TARGET") tabela(s) no destino)"
