# syntax=docker/dockerfile:1

# Imagens de produção do Aluguei.app, usadas por docker-compose.prod.yml (Coolify).
#
# Os pacotes do workspace exportam TypeScript (`exports` -> src/*.ts) e o dist/
# gerado pelo tsc não é executável. API, worker e migrations rodam com tsx, como
# no E2E, e a instalação inclui devDependencies: o tsx é dependência de dev da
# raiz e o client do banco importa o PGlite de forma estática.

FROM node:24-bookworm-slim AS base
ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.15.1 && pnpm --version
WORKDIR /app

# Baixa as dependências só a partir do lockfile: a camada fica em cache enquanto
# o lockfile não muda, mesmo que o código mude.
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch

# API, worker, migrations e backup: mesma imagem, o comando vem do compose.
FROM fetch AS server
# pg_dump e pg_restore na versão do servidor (17), do repositório oficial do PostgreSQL (PGDG,
# assinado): o Debian bookworm traz a 15, que não lê um banco 17. Usados pelo serviço de backup
# (G3, trilha F2). A camada fica em cache enquanto o Dockerfile não muda.
RUN apt-get update  && apt-get install -y --no-install-recommends ca-certificates curl  && install -d /usr/share/postgresql-common/pgdg  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc       https://www.postgresql.org/media/keys/ACCC4CF8.asc  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main"       > /etc/apt/sources.list.d/pgdg.list  && apt-get update  && apt-get install -y --no-install-recommends postgresql-client-17  && apt-get purge -y curl && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/*  && install -d -o node -g node /backups
ENV PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump     PG_RESTORE=/usr/lib/postgresql/17/bin/pg_restore
COPY . .
RUN pnpm install --offline --frozen-lockfile \
      --filter aluguei-app \
      --filter "@aluguei/api..." \
      --filter "@aluguei/worker..." \
      --filter "@aluguei/db..."
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]

# Web (Next.js).
FROM fetch AS web
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter aluguei-app --filter "@aluguei/web..." \
 && pnpm turbo run build --filter=@aluguei/web \
 && chown -R node:node apps/web/.next
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

# Portal publico (AchouImovel). Mesma receita da gestao, outro app e outra porta.
FROM fetch AS portal
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter aluguei-app --filter "@aluguei/portal..." \
 && pnpm turbo run build --filter=@aluguei/portal \
 && chown -R node:node apps/portal/.next
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/portal
EXPOSE 3100
CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3100"]
