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

# API, worker e migrations: mesma imagem, o comando vem do compose.
FROM fetch AS server
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
