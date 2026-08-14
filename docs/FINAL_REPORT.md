# Relatório Final de Auditoria — Aluguei.app

Data: 2026-08-14 · Última fase: 12 (Final Audit) · Branch: main

## Metodologia

- Gates completos: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (20 tasks: domain 108, contracts 12, integrations 21, worker 30, meta-mcp 7, web, integration 79), `pnpm build`, `pnpm --filter @aluguei/db db:generate` (sem drift), `pnpm security:scan` (limpo), `pnpm security:audit` (0 critical; 2 high transitivos do tooling Expo — ver Classificação de dependências).
- Migrations from zero: 11 migrations (0000–0009, 0011) aplicadas do zero em PGlite a cada execução de `createTestDb`; journal íntegro (todas as .sql no disco).
- E2E crítico: `tests/integration/src/e2e-critical.test.ts` — journey completo imóvel → anúncio → lead → contrato assinado → locação → cobrança → pagamento → confirmação → portal.
- Auditoria de segurança: 2 rodadas do security-auditor (Fase 11 e Final). Resultado final: 0 P0, 3 P1 corrigidos, 7 P2 tratados (detalhes em `docs/THREAT_MODEL.md` e `docs/BLOCKERS.md`).
- Threat model, SLOs e backup/restore documentados (`docs/THREAT_MODEL.md`, `docs/SLO.md`, `docs/OPERATIONS.md`).

## Classificação de integrações (evidência exigida — nada promovido sem evidência)

### LIVE_VERIFIED (validado contra serviço real com evidência)

**Nenhuma.** Nenhuma integração externa foi validada contra ambiente real: sem credenciais, sem sandbox de homologação e sem App Review no momento da auditoria. Tudo que envolve provedor externo está classificado abaixo.

### SANDBOX_VERIFIED (validado contra sandbox real do provedor)

**Nenhuma.** Não houve acesso a sandbox real (Asaas sandbox, Meta test ad account, portal de homologação, etc.).

### MOCK_VERIFIED (validado com fakes determinísticos + testes de contrato/integração)

| Integração     | Implementação                                                                                                                              | Evidência                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Geocoding      | `GeocodingMockService` (dev/test; `null` em produção sem chave)                                                                            | `geocoding/*.test.ts`                                          |
| Canais/portais | `FakeChannel` determinístico (falhas injetáveis) + fila `channel_sync_jobs`                                                                | `channelJobs.test.ts`, integração channels                     |
| WhatsApp       | `FakeWhatsAppMessenger` + webhook com verify token, dedup e X-Hub-Signature-256 (agora validada quando `META_APP_SECRET`)                  | `whatsapp.test.ts` (6), hardening (assinatura)                 |
| AI             | `MockAiProvider` (extração determinística; LLM real exige chave, nunca chamado sem ela)                                                    | `whatsapp.test.ts`, domain                                     |
| Vistoria IA    | `MockInspectionAiProvider` (transcrição/sugestões por regras; evidência observável)                                                        | `inspectionJobs.test.ts`, integração                           |
| Crédito        | `FakeScreeningProvider` (CPF alto risco injetável) + consentimento LGPD obrigatório + regras determinísticas                               | `screeningJobs.test.ts`, integração screening                  |
| Assinatura     | `FakeSignatureProvider` + webhook idempotente + hash do documento                                                                          | integração contracts (SIGNED), signatureJobs                   |
| Pagamento      | `FakePaymentProvider` (QR Pix, status transicionável) + ledger balanceado + split + **worker confirma no provider antes de creditar**      | `finance.test.ts`, `paymentJobs.test.ts`, hardening            |
| Meta Ads       | `FakeMetaAdsProvider` determinístico + Housing/Special Ad Category + intents de alta impacto + caps de budget validados (rota/tool/worker) | `meta.test.ts` (7), `metaJobs.test.ts` (5), meta-mcp stdio (7) |

### IMPLEMENTED_NOT_LIVE_VERIFIED (implementado; validação live pendente de credencial/homologação)

| Integração                                          | Status                                                                                 | Blocker                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Google Maps Geocoding (REST)                        | Sem credencial                                                                         | `docs/BLOCKERS.md` Fase 03                                     |
| Storage R2/S3 (presigned PUT)                       | Assinatura testada local; bucket real não verificado                                   | `docs/BLOCKERS.md` Fase 03                                     |
| Canais reais (Canal Pro/VivaReal/ZAP/OLX/Imovelweb) | Registrados SEM adapter (sem contrato oficial)                                         | `docs/BLOCKERS.md` Fase 04                                     |
| Meta WhatsApp (Cloud API)                           | Adapter com zod/timeout/verify; sem homologação                                        | `docs/BLOCKERS.md` Fase 05                                     |
| OpenAI/Gemini (AI)                                  | Registry pronto; sem chave nunca chama LLM                                             | `docs/BLOCKERS.md` Fase 05                                     |
| Serasa/SPC                                          | Registrados SEM adapter                                                                | `docs/BLOCKERS.md` Fase 07                                     |
| Clicksign/D4Sign                                    | Registrados SEM adapter                                                                | `docs/BLOCKERS.md` Fase 07                                     |
| Asaas (pagamento)                                   | Registrado SEM adapter; webhook valida `ASAAS_WEBHOOK_TOKEN` quando configurado        | `docs/BLOCKERS.md` Fase 08                                     |
| Meta Graph (Ads)                                    | Registrado SEM adapter; token criptografado AES-256-GCM                                | `docs/BLOCKERS.md` Fase 09                                     |
| MCP `aluguei-meta` (stdio)                          | 17 tools testadas por protocolo (in-memory); smoke real por stdio exige Postgres local | `docs/BLOCKERS.md` Fase 09 (`enabled: false` no opencode.json) |
| Entrega de token de portal                          | Manual no MVP (sem provider de e-mail)                                                 | `docs/BLOCKERS.md` Fase 10                                     |
| Backup/restore                                      | Documentado; não executado em infra real                                               | `docs/BLOCKERS.md` Fase 11                                     |

## Dependências

- `pnpm security:audit --audit-level=critical`: **0 critical** (gate bloqueante verde).
- `pnpm audit --prod`: 2 high — `image-size` (DoS em parser usado pelo tooling Expo/Metro). Fix publicado exige `>=2.0.3`, **inexistente no npm** (última 2.0.2; 2.x quebra o metro). Não exposto no runtime da API/CRM. Moderate `uuid` **zerado** via `pnpm.overrides` (`pnpm-workspace.yaml`).

## Cobertura de segurança (resumo do threat model)

- Cross-tenant: isolamento por org + associação em 100% das rotas; testes negativos (`cross-org`, `portal`, `hardening`, `meta`, `reporting`).
- Auth: sessões opacas (SHA-256 no DB, expiração/revogação), argon2id, rate limit 10/min no login, anti-enumeração.
- Portal externo: token one-time de consumo único + revogação em cascata + kind obrigatório.
- Webhooks: dedup UNIQUE + 200 imediato + rate limits; payments confirma no provider antes de creditar; WhatsApp valida X-Hub-Signature-256; payments/assinatura validam token quando configurado.
- Uploads: presigned PUT, MIME whitelist, revalidação de tamanho, storageKey com prefixo de org.
- Segredos: secret scan no CI, redação em logs (pino) e erros de tool MCP, token Meta AES-256-GCM, allowlist por valor exato.
- Financeiro: centavos inteiros, ledger balanceado idempotente, split nunca excede pagamento, refund com reversão contábil + confirmação no provider.
- Meta Ads: Housing/Special Ad Category obrigatório, caps de budget por org (rota + tool + worker), intents de alta impacto nunca ativam anúncio sem intent de runtime.

## Pendências conhecidas (não bloqueiam o MVP em dev/dry-run)

1. Nenhuma integração externa `LIVE_VERIFIED` — exigência de credenciais/homologação antes de qualquer operação real.
2. `image-size` (2 high, tooling Expo) — sem fix publicado; monitorado.
3. Canais/Asaas/Serasa/SPC/Clicksign/D4Sign/Graph: adapters reais pendentes de documentação oficial/credencial (nunca inventar endpoints).
4. Entrega de token de portal por e-mail e coleta de métricas de produção dependem de infra (e-mail provider, deploy com OTEL).

## Conclusão

O Aluguei.app está **verde em todas as fases** (01–12) com gates completos, migrations from zero, E2E crítico ponta-a-ponta e auditoria de segurança sem P0/P1 remanescentes. Nenhum status foi promovido sem evidência: tudo que depende de provedor externo está `IMPLEMENTED_NOT_LIVE_VERIFIED`; comportamento interno está `MOCK_VERIFIED` com fakes determinísticos e testes de contrato/integração.
