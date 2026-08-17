# Final Readiness Report — Aluguei.app

> Data: 2026-08-17. Ciclo Production Readiness Autopilot — de `FUNCTIONALLY_COMPLETE_WITH_EXTERNAL_BLOCKERS` para o estado abaixo.
> Base: execução real (PostgreSQL 17 local, migrations do zero, API + worker + web + Playwright, 250+ testes) — sem efeitos externos reais.

## 1. Executive Summary

O núcleo foi estabilizado (bug P1 corrigido com controle negativo), os gates voltaram verdes (format/lint/typecheck/test/build/secret-scan), a segurança de webhooks foi endurecida e **8 integrações saíram de "mock only" para adapters reais** (Asaas, Clicksign, Meta Graph, WhatsApp, Serasa-esqueleto, Google Places/Geocoding, Storage, IA OpenAI/Gemini) — todas `IMPLEMENTED_NOT_LIVE_VERIFIED` ou `BLOCKED_PROVIDER_CONTRACT`, com homologação documentada provider por provider. E2E de browser (Playwright) e contract tests foram implementados e passam. O mobile ganhou o fluxo de operação de campo. O que resta é essencialmente **homologação com contas reais** (credenciais/contratos), não programação.

## 2. Estado inicial

- `FUNCTIONALLY_COMPLETE_WITH_EXTERNAL_BLOCKERS` (auditoria 2026-08-17): bug `owners+mídia` (Date→string), 2 gates vermelhos (format 147 arquivos; audit 2 high), webhooks sem assinatura, providers reais inexistentes, E2E/contract tests placeholders, mobile = shell.

## 3. Correções do core

- **Bug owners+mídia corrigido estruturalmente**: normalizador de boundary `toDtoValue` (Date→ISO 8601) nos copy-loops de DTO (properties/parties). Controle negativo: teste unitário determinístico falha com o erro exato sem o fix e passa com ele; integration `owners após mídia → 201`.
- Auditoria de DTOs: inspections/payments/portal já eram explícitos; parties ajustado preventivamente.
- Out-of-order de assinatura: reconciliação no worker (SIGNER_SIGNED pós-COMPLETED converge para SIGNED).

## 4. Segurança

- Webhooks: WhatsApp e Meta POST com X-Hub-Signature-256 (constante-time); Signature com Bearer `SIGNATURE_WEBHOOK_TOKEN`; Asaas aceita `asaas-access-token`/`asaas-webhook-token` (constante-time). Produção EXIGE secret (500 se ausente). Dedup UNIQUE + replay seguro. 14 testes de segurança.
- Env tipado: `PAYMENT_PROVIDER`, `SCREENING_PROVIDER`, `SIGNATURE_PROVIDER`, `META_*`, `ASAAS_ENV` no zod; worker usa env tipado (com fallback compatível).
- Token Meta permanece criptografado AES-256-GCM em repouso, fora de prompts/MCP.
- Secret scan verde.

## 5. Storage — IMPLEMENTED_NOT_LIVE_VERIFIED

Presign PUT (existente) + **presign GET**, size limits, HEAD validation, isolamento por org. Testes unitários (8) e fake em HTTP. Homologação: bucket (R2/MinIO) + credenciais + CORS (`STORAGE_HOMOLOGATION.md`).

## 6. Pagamentos — IMPLEMENTED_NOT_LIVE_VERIFIED

`AsaasPaymentProvider` (v3): PIX/boleto, status, cancel, refund, mapeamento de webhook, erros tipados, timeout, retry classificado; registry ativado (default sandbox). Prova financeira in-process: charge→payment→webhook→confirmação no provider→PAID→ledger D=C→payout (finance.test.ts) e E2E crítico. Divergência de doc registrada (header do webhook) já tratada.

## 7. WhatsApp — IMPLEMENTED_NOT_LIVE_VERIFIED

Adapter Meta auditado p/ v25.0: `sendTemplateMessage`, `testConnection`, erros tipados retryable; payload oficial; delivery-status documentado como evolução. Homologação: WABA + número + token + `META_APP_SECRET`.

## 8. Assinatura — IMPLEMENTED_NOT_LIVE_VERIFIED

`ClicksignSignatureProvider` (v3 JSON:API): envelope, signatários com ordem, status, cancelamento, webhook HMAC (Content-Hmac). Reconciliação fora-de-ordem no worker. Gap documentado: requisito de autenticação por signatário não está na interface atual.

## 9. Crédito — BLOCKED_PROVIDER_CONTRACT

Serasa: esqueleto que valida config e falha de forma tipada (nunca inventa endpoint); doc pública confirma faixa 0–1000, TLS 1.2+, IAM, sandbox 90 dias — endpoint/autenticação exigem layout do produto contratado. SPC: sem doc pública. Domínio/LGPD intactos.

## 10. Meta Ads — IMPLEMENTED_NOT_LIVE_VERIFIED

`MetaGraphAdsProvider` (Graph API v25.0): campaigns (HOUSING, sempre PAUSED), ad sets, creatives, ads, status, budget/schedule, archive, insights. Pipeline (MCP/worker/intents/budget caps) inalterado. Ajustes de pipeline documentados (image_hash upload, page_id, creative imutável).

## 11. Portais — DOCUMENTED

ZAP/Viva Real (feed XML VRSync, partner-only), OLX Imóveis (API REST pública — primeiro candidato a adapter), ImovelWeb (partner), CanalPro (console do Grupo OLX). Consentimento LGPD `LEAD_IMPORT` implementado no import de leads. Adapters reais exigem contrato/credencial por portal.

## 12. Google — IMPLEMENTED_NOT_LIVE_VERIFIED

Places autocomplete + details (rotas `/places/*` RBAC) + UI AddressSearch no cadastro (combobox a11y, fallback manual sempre disponível) + geocoding consumido no PUT de endereço (best-effort lat/lng, nunca bloqueia).

## 13. IA — IMPLEMENTED_NOT_LIVE_VERIFIED

`OpenAiAiProvider`, `GeminiAiProvider`, `OpenAiInspectionAiProvider` (whisper + sugestões multimodais). Fallback determinístico nas regras em QUALQUER falha; JSON validado por zod; limites de tokens/timeout; estratégia com PII/revisão humana em `AI_RUNTIME.md`. IA nunca decide crédito/assinatura/dinheiro/legal.

## 14. Mobile — MVP de operação de campo

Login → agenda (visitas) → detalhe da visita → vistoria (ambientes, observações, transições da máquina de estado com erros da API) → revisão (observações + sugestões IA). Sem dependências novas; mesma API/contracts; banner offline + error boundary. Próxima iteração: fotos/áudio nativos, resolução de sugestões, persistência de sessão.

## 15. E2E — GREEN

Playwright (browser): registro/login/criação de imóvel pela UI + jornada completa via API (screening→assinatura→locação→cobrança→PIX→portal) + telas refletem dados. **3/3 passando** contra a stack local (fakes via env). Boot script incluído (webServer).

## 16. Observabilidade

Logs estruturados, request/job ids, health/readiness, OTEL/Sentry configuráveis no env. Runbooks em `OPS_RUNBOOKS.md`.

## 17. Credenciais faltantes

| Provider    | O que falta                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| Storage     | bucket R2/MinIO + `STORAGE_*`                                                        |
| Asaas       | `ASAAS_API_KEY` sandbox (`$aact_hmlg_*`) + `ASAAS_WEBHOOK_TOKEN`                     |
| WhatsApp    | WABA + número verificado + `WHATSAPP_ACCESS_TOKEN` + `META_APP_SECRET` (+ templates) |
| Clicksign   | conta sandbox + `CLICKSIGN_API_TOKEN` + webhook HMAC secret                          |
| Serasa/SPC  | contrato + layout + credenciais IAM (BLOCKED_PROVIDER_CONTRACT)                      |
| Meta Ads    | app + ad account + system user token (`ads_management`) + page_id                    |
| Google      | `GOOGLE_MAPS_API_KEY` (Maps+Places, billing)                                         |
| IA          | `OPENAI_API_KEY` / `GEMINI_API_KEY` (opcional — mock default)                        |
| OLX Imóveis | conta anunciante + OAuth                                                             |

## 18. Contratos comerciais faltantes

1. Serasa "Score e Atributos via API" (layout + IAM).
2. Portais ZAP/Viva Real/ImovelWeb/CanalPro (planos/feeds).
3. OLX Imóveis (parceiro/homologação; publicação paga).
4. D4Sign (não implementado — Clicksign escolhido como primeiro provider).

## 19. Sandbox status

Nenhum sandbox exercitado (sem credenciais). Todos os adapters prontos para conectar assim que as credenciais de sandbox existirem.

## 20. Production blockers

1. Credenciais/contas de sandbox por provider (lista §17).
2. Contratos Serasa + portais (§18).
3. `image-size` (2 high, transitivo mobile/metro) — NO_FIX_AVAILABLE (2.0.3 não publicado); documentado; monitorar.
4. Pipeline Meta: image_hash upload + page_id resolvers (documentados) antes de campanha real.

## 21. Próximo passo operacional

1. Provisionar credenciais de sandbox (Asaas → WhatsApp → Clicksign → Meta → Google → Storage).
2. Rodar smoke sandbox por provider (usando `META_MODE=live` apenas com conta de teste/ad account de teste).
3. OLX Imóveis como primeiro adapter de portal.
4. Seguir o `PILOT_PLAN.md` com 1 organização e 5–10 imóveis.

## 22. Veredito

**HOMOLOGATION_READY**

O código-base está tecnicamente pronto para homologação: núcleo estável, gates verdes, segurança de webhooks implementada, adapters reais implementados e documentados para todos os providers prioritários, E2E e contract tests verdes, mobile operacional. A ativação real (LIVE_VERIFIED) depende exclusivamente de credenciais/contas/contratos externos — não de desenvolvimento.
