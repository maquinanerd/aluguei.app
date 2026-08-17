# Baseline — Production Readiness Autopilot

> Data: 2026-08-17. Estado congelado antes do ciclo de estabilização/homologação.
> Fonte: execução real desta sessão (gates frescos) — ver `docs/audit/FUNCTIONAL_STATUS_AUDIT.md`.

## Estado do repositório

- branch: `main`
- HEAD: `08ca0a5` (feat(frontend): visual fidelity V3)
- worktree: limpo (somente `docs/audit/` untracked — relatórios da auditoria funcional)
- remote: `origin https://github.com/maquinanerd/aluguei.app.git`
- Nada foi resetado; trabalho preservado.

## Baseline dos gates (2026-08-17)

| GATE | RESULTADO | OBSERVAÇÃO |
|---|---|---|
| FORMAT (`pnpm format:check`) | ❌ FAIL (147 arquivos) | Prettier não era executado desde o V3; inclui novos arquivos. Fix na Fase 2. |
| LINT (`pnpm lint`) | ✅ PASS (26 tasks) | 0 erros |
| TYPECHECK (`pnpm typecheck`) | ✅ PASS (26 tasks) | 0 erros |
| TEST (turbo) | ✅ PASS | domain 96, contracts 7, integrations 21, storage 5, config 4, observability 4, ui 6, web 6, api 1, worker 9, meta-mcp 7, integration 79 |
| INTEGRATION (fresca) | ✅ 79/79 | 16 arquivos (antes das correções desta sessão) |
| BUILD (`pnpm build`) | ✅ PASS (12 tasks) | — |
| SECRET SCAN | ✅ PASS | nenhum segredo |
| SECURITY AUDIT (`pnpm audit --prod`) | ❌ FAIL — exit 1 | 2 high (`image-size`) |

## Análise das 2 vulnerabilidades HIGH (Fase 2)

| Atributo | Valor |
|---|---|
| Pacote | `image-size@1.2.1` (latest publicada: 2.0.2) |
| Advisories | GHSA-w3rx-r6r6-pgpr (ICNS loop infinito), GHSA-5p2g-fcmc-qvqq (JXL/HEIF loop infinito) |
| Vulnerável | `<=2.0.2` · Patched | `>=2.0.3` — **versão 2.0.3 NÃO existe no npm** (verificado via `npm view image-size versions`) |
| DIRECT/TRANSITIVE | **TRANSITIVE** (via `metro@0.84.4` ← expo/react-native, exclusivamente em `apps/mobile`) |
| DEV_ONLY | Sim — metro é o bundler do mobile (build/dev); não é servido em runtime (API/web/worker) |
| PRODUCTION_REACHABLE | **Não** para superfícies de runtime do produto (API, web, worker). Apenas cenário de supply-chain/build local (imagem maliciosa processada pelo bundler durante um build mobile) |
| FIX_AVAILABLE | **NO_FIX_AVAILABLE** — patched 2.0.3 não publicado; 2.0.2 ainda vulnerável; override para versão inexistente quebraria a instalação |
| Ação | Documentar + aceitação temporária (monitorar lançamento de 2.0.3 e atualizar assim que existir) |

Decisão: **não** adicionar `auditConfig`/ignore sem justificativa — o risco fica registrado em `docs/production-readiness/` e monitorado. O gate `pnpm security:audit` permanecerá com exit 1 até o patch existir, com justificativa documentada.

## Problemas conhecidos no baseline (P0/P1)

1. **BUG (P1)**: `POST /properties/:id/owners` → 400 `createdAt: Invalid input: expected string, received Date` quando o imóvel tem mídia (Drizzle entrega Date no PG real; PGlite mascara). Fix na Fase 1.
2. **Gap de segurança (P1)**: webhooks de assinatura e Meta POST sem verificação de autenticidade. Fix na Fase 3.
3. **Gap de config**: `PAYMENT_PROVIDER`/`SCREENING_PROVIDER` lidos via `process.env` no worker, fora do zod env. Fix na Fase 3.
4. **Sem consumidor**: Google geocoding registrado mas nunca chamado (Fase 11).
5. **Adapters reais inexistentes**: Asaas, Clicksign/D4Sign, Serasa/SPC, Meta Graph, portais, IA (Fases 5–12).

## Ordem de execução do ciclo

0. Baseline (este documento) ✅
1. Core: fix owners+mídia + auditoria de DTOs ✅
2. Gates: format + audit
3. Hardening: webhooks + env tipado
4. Storage homologação
5. Asaas (prova financeira real)
6. WhatsApp
7. Assinatura (1 provider)
8. Crédito
9. Meta Graph
10. Portais (documentação)
11. Google Places no cadastro
12. IA runtime
13. E2E Playwright
14. Contract tests
15. Mobile (operação de campo)
16. Observabilidade/ops
17. Readiness dashboard
18. Plano de piloto + relatório final
