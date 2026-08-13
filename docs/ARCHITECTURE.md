# Arquitetura técnica

## Princípio

Um monorepo TypeScript reduz linguagens, duplica menos contratos e permite compartilhar schemas entre web, mobile, API, worker e MCP. Começar como modular monolith + workers; microserviços apenas quando uma fronteira operacional provar necessidade.

## Stack base

- Node.js: versão LTS/suportada detectada na Fase 1 e fixada no repositório
- pnpm workspaces + Turborepo
- TypeScript strict
- Web: Next.js estável
- Mobile: React Native + Expo estável
- API: Fastify + Zod
- DB: PostgreSQL
- ORM/query: Drizzle ORM (ou equivalente somente se ADR justificar troca antes de primeira migration)
- Queue: BullMQ + Redis quando houver operação realmente assíncrona
- Storage: S3-compatible, baseline Cloudflare R2
- MCP: SDK oficial TypeScript, versão estável da especificação vigente
- Observabilidade: OpenTelemetry + logs estruturados
- Testes: Vitest + Playwright; contratos/integrations com fixtures; mobile com testes adequados à camada

## Estrutura alvo

```text
apps/
  web/
  mobile/
  api/
  worker/
  meta-mcp/
packages/
  contracts/
  domain/
  db/
  integrations/
  config/
  observability/
  ui/
tests/
  contract/
  integration/
  e2e/
docs/
orchestration/
.opencode/
```

## Fronteiras

### `packages/domain`

Regras puras: estados, transições, cálculo financeiro, políticas, erros de domínio. Não conhece HTTP, SDK Meta, Redis, R2 ou framework web.

### `packages/contracts`

Schemas Zod versionados usados em API, eventos, MCP e validação de payloads externos.

### `packages/db`

Schema, migrations, repositories e transações. Multi-tenant por `organization_id`; RLS pode ser adicionada quando o modelo estiver estável, mas autorização também é obrigatória na aplicação.

### `packages/integrations`

Interfaces e adapters: Meta, WhatsApp, Google, canais imobiliários, crédito, assinatura, pagamento, IA, storage.

### `apps/api`

HTTP, auth, autorização, orquestração de application services, webhooks e OpenAPI.

### `apps/worker`

Jobs idempotentes: mídia/IA, sincronização de portais, assinatura, pagamento, Meta insights, notificações.

### `apps/meta-mcp`

Servidor MCP interno. Não replica regra de negócio; chama application services/adapters autorizados do Aluguei.app.

## Consistência

- transações locais no PostgreSQL
- outbox para eventos que disparam workers
- inbox/idempotency para webhooks e consumidores
- retries apenas para falhas transitórias
- DLQ/estado de erro auditável para falhas persistentes

## Deploy inicial

Arquitetura deve rodar localmente e em uma VPS/host gerenciado sem serviços proprietários obrigatórios. Containers são permitidos, mas desenvolvimento não deve depender exclusivamente deles se o ambiente não oferecer Docker.
