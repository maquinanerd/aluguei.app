# CURRENT_UI_INVENTORY (gerado — Phase 01 Discovery)

Inventário mecânico do estado real do frontend em `apps/web` e `packages/ui`.

## Stack

- Next.js **16.3.0** (App Router, Turbopack default, `params`/`searchParams` async — REQUER `await props.params`).
- React 19.2.3, TypeScript 6.0.3 strict (base `tsconfig.base.json` com `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- Vitest 4.1.10 (`environment: node`), sem Playwright configurado (nenhum `playwright.config.*` nem `*.spec.ts` no repo).
- UI: sem design system; `packages/ui` exporta placeholder `export const ui = {}`.
- CSS: `globals.css` com tokens antigos ad-hoc (`--bg:#f6f7f9`, `--primary:#0f5fd0` — azul, fora da identidade) e topbar simples.
- Fontes: `system-ui` stack (sem Inter, sem next/font).

## Rotas existentes em apps/web

| Rota | Tipo | Implementação |
|---|---|---|
| `/` | pública (marketing mínimo) | `page.tsx` — título estático |
| `/login` | pública | `login-form.tsx` (client, fetch `/api/auth/login`) |
| `/register` | pública | `register-form.tsx` (client) |
| `/dashboard` | app legado | `dashboard/page.tsx` + `lead-status.tsx` — listagem simples de leads/canais, estilo antigo |
| `/imoveis` | público | `imoveis/page.tsx` — lista pública (fetch `public-api.ts`) |
| `/imoveis/[slug]` | público | `imoveis/[slug]/page.tsx` — detalhe público |
| `/inquilino` | portal | `inquilino/page.tsx` — extrato/cobranças simples |
| `/proprietario` | portal | `proprietario/page.tsx` — extrato/imóveis simples |
| `/api/auth/login` | proxy | Route Handler → `apiProxy('/auth/login')` + isSameOrigin |
| `/api/auth/register` | proxy | idem |
| `/api/auth/logout` | proxy | idem |
| `/api/leads/[id]/status` | proxy | PATCH → `/leads/:id/status` |
| `/api/portal/auth/consume` | proxy | POST → `/portal/auth/consume` |
| `/api/portal/auth/logout` | proxy | POST → `/portal/auth/logout` |

## Libs existentes

- `src/lib/api-server.ts` — `apiBase()`, `isSameOrigin()` (login-CSRF), `ApiError`, `apiFetch<T>()` (server components, cookie forward), `apiProxy()` (Route Handlers, repassa Set-Cookie).
- `src/lib/public-api.ts` — fetch público (sem cookie), `fetchPublicListings`, `fetchPublicListing`, `formatBRL(cents)`.

## Testes existentes

- `src/app/page.test.tsx` — renderiza título home.
- `src/app/imoveis/page.test.tsx` — mocka `public-api`, verifica render da lista.
- Config: `vitest.config.ts` (node env), `tsconfig` com path `@/*` → `./src/*`.

## O que NÃO existe (lacunas)

- packages/ui: zero componentes.
- Nenhuma rota `/app/*` (painel administrativo).
- Nenhum layout de app shell (sidebar/topbar) com identidade PEG.
- Nenhum cliente HTTP client-side unificado (mutations com estado).
- Nenhuma cobertura de estados (loading/skeleton/empty/error/permission) além de poucos try/catch.
- Nenhum componente de tabela densa, filtros, paginação, drawers, modais, toasts, inspector.
- Nenhuma biblioteca de ícones; sem Inter; sem tokens semânticos Aluguei.
- Nenhum teste de acessibilidade, visual, responsivo ou E2E.
