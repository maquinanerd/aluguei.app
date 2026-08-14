# Blockers externos

Nenhum no bootstrap.

O agente deve registrar aqui apenas dependï¿½ncias externas reais: credenciais, App Review, conta de teste, homologaï¿½ï¿½o, contrato de portal, sandbox indisponï¿½vel etc. Nï¿½o registrar dï¿½vidas de arquitetura que ele prï¿½prio possa resolver.

## Fase 03 ï¿½ IMPLEMENTED_NOT_LIVE_VERIFIED

- `GoogleMapsGeocodingAdapter` (REST) implementado com contrato zod, timeout e mock determinï¿½stico (`GeocodingMockService` em dev/test; `null` em produï¿½ï¿½o sem chave). Sem credencial real de homologaï¿½ï¿½o ? nï¿½o validado contra a API Google live.
- `S3StorageAdapter.getPresignedPutUrl` (presigned PUT SigV4 via `@aws-sdk/s3-request-presigner`) implementado e testado com assinatura local; upload real contra Cloudflare R2 nï¿½o verificado (sem credenciais/bucket de homologaï¿½ï¿½o).

## Fase 04 ï¿½ IMPLEMENTED_NOT_LIVE_VERIFIED

- `IListingChannelAdapter` implementado com `FakeChannel` de referï¿½ncia (dev/test). Canais reais (Canal Pro/VivaReal/ZAP/OLX/Imovelweb) registrados SEM adapter ï¿½ sem contrato oficial acessï¿½vel, nenhum endpoint ï¿½ inventado (docs/INTEGRATIONS.md). A implementaï¿½ï¿½o real de cada portal exige documentaï¿½ï¿½o oficial/contratual antes de qualquer chamada.

## Fase 04 ï¿½ Dï¿½vidas registradas (pï¿½s-review)

- **LGPD ï¿½ leads de canal sem consentimento registrado**: `importLeads` (worker) cria party+lead sem gravar `party_consents` (purpose `CHANNEL_LEAD_CONTACT`). O consentimento de leads provenientes de portais deve ser registrado na fase de Screening (Fase 07) antes de qualquer uso alï¿½m de contato inicial.
- **Retry automï¿½tico de jobs**: FAILED volta elegï¿½vel quando `run_at` vence (attempts < 5); acima disso exige re-enfileiramento manual via API. Sem dead-letter queue (jobs FAILED com attempts = 5 ficam visï¿½veis no painel com last_error).

## Fase 05 ï¿½ IMPLEMENTED_NOT_LIVE_VERIFIED

- `MetaWhatsAppAdapter` (Cloud API REST) implementado com zod, timeout 10s e verify token; sem credencial real de homologaï¿½ï¿½o ? nï¿½o validado contra a Meta live (`META_MODE=dry_run` usa FakeWhatsAppMessenger).
- `AiProvider` com `MockAiProvider` (regras determinï¿½sticas); adapters OpenAI/Gemini reais adiados (registry ï¿½ o gancho; sem chave nunca chama LLM externo).
- Assinatura `X-Hub-Signature-256` validada quando `META_APP_SECRET` presente; sem secret, a seguranï¿½a vem do verify token trocado na assinatura do webhook (documentado em INTEGRATIONS.md).

## Fase 06 ï¿½ IMPLEMENTED_NOT_LIVE_VERIFIED

- `MockInspectionAiProvider` (transcriï¿½ï¿½o/sugestï¿½es determinï¿½sticas por regras) ï¿½ o padrï¿½o; adapters reais de transcriï¿½ï¿½o/visï¿½o (LLM) exigem chave e devem obedecer o contrato de payload com EVIDï¿½NCIA OBSERVï¿½VEL apenas (nunca causa/diagnï¿½stico) ï¿½ nota em docs/AI_STRATEGY.md. Sem credencial ? mock, nunca LLM externo.
- Assinatura de vistoria (SIGNED) reservada: transiï¿½ï¿½o existe na mï¿½quina, rota rejeita com 400 atï¿½ a Fase 07. PDF de relatï¿½rio adiado para a fase de relatï¿½rios (10) ï¿½ endpoint de snapshot estruturado disponï¿½vel.

## Fase 07 ï¿½ IMPLEMENTED_NOT_LIVE_VERIFIED

- `IScreeningProvider` com `FakeScreeningProvider` determinï¿½stico; Serasa/SPC reais registrados SEM adapter (sem documentaï¿½ï¿½o/credencial acessï¿½vel ï¿½ job falha com "provider nï¿½o configurado", nunca inventa endpoints).
- `ISignatureProvider` com `FakeSignatureProvider`; Clicksign/D4Sign reais sem token/doc ? 400 "assinatura nï¿½o configurada" (produï¿½ï¿½o NUNCA assina fake). Webhook de assinatura aceita payload mï¿½nimo (sem validaï¿½ï¿½o HMAC ï¿½ `SIGNATURE_WEBHOOK_TOKEN` reservado para quando o provider real documentar).
- Decisï¿½es de crï¿½dito sï¿½o AUTOMï¿½TICAS por regras determinï¿½sticas (threshold `SCREENING_APPROVE_SCORE_MIN` default 700, rastreio em `decision_rules`); revisï¿½o humana obrigatï¿½ria em casos inconclusivos (MANUAL_REVIEW com motivo).

## Fase 08 - IMPLEMENTED_NOT_LIVE_VERIFIED

- IPaymentProvider com FakePaymentProvider deterministico (dev/test); Asaas real registrado SEM adapter (sem documentacao/credencial acessivel - rotas respondem 400 Pagamento nao configurado e worker nunca confirma pagamento fake em producao). Webhook /webhooks/payments aceita payload minimo sem validacao HMAC (ASAAS_WEBHOOK_TOKEN reservado para quando o provider real documentar).
- Ledger dupla entrada via postLedgerTransaction (balance = 0, DEBIT positivo / CREDIT negativo, idempotente por UNIQUE transaction+account); contas CASH/AR_RECEIVABLE/AGENCY_FEE_REVENUE/LANDLORD_PAYABLE criadas por org sob demanda.
- Split deterministico: comissao da agencia (default 10%) nunca excede o valor pago; payout PENDING criado para o landlord, execucao de transferencia real adiada (sem credencial bancaria).

## Fase 09 - IMPLEMENTED_NOT_LIVE_VERIFIED

- IMetaAdsProvider com FakeMetaAdsProvider deterministico (dry_run); adapter Graph API real registrado SEM adapter (sem doc oficial/scopes/credencial validados - rotas respondem 400 Meta Ads nao configurado e worker nunca simula campanha ACTIVE em producao). Housing/Special Ad Category aplicado nas regras de dominio (validateHousingTargeting) e no AdProfile (special_ad_categories: ['HOUSING']); versao Graph e scopes a validar contra docs oficiais antes de qualquer adapter real.
- `apps/meta-mcp` implementado com @modelcontextprotocol/sdk 1.30.0 (stdio); 17 tools verificadas por teste de protocolo (Client + InMemoryTransport sobre PGlite) e por testes de integracao da API. Smoke real por stdio (spawn dev:stdio contra Postgres local) NAO executado: sem credencial de Postgres no ambiente - para habilitar `aluguei-meta` no opencode.json: (1) Postgres com migrations aplicadas (0000-0009), (2) DATABASE_URL no env do opencode, (3) META_MODE=dry_run (ou META_ACCESS_TOKEN + adapter validado em live), (4) opcional META_TOKEN_ENCRYPTION_KEY hex 64. Enquanto isso, permanece enabled: false.
- Token Meta por conexao criptografado AES-256-GCM (encryptSecret/decryptSecret em @aluguei/config, META_TOKEN_ENCRYPTION_KEY + tokenKeyId); OAuth real nao homologado (conexao FAKE em dry-run).
- High-impact (publish/pause/resume/budget/schedule/creative/archive) e por INTENT em meta_sync_jobs: em dry_run o worker executa no fake; em live exige adapter homologado e nunca ativa anuncio pago sem intencao explicita de runtime (SECURITY.md).

## Fase 10 - IMPLEMENTED_NOT_LIVE_VERIFIED

- Portal externo (proprietario/locatario) com acesso via portal_access (grant por party+kind) + token one-time consumido uma unica vez -> sessao opaca propria (portal_sessions). Entrega do token de convite e MANUAL no MVP (sem provider de e-mail/SMS): admin copia o token gerado pelo POST /portal/access. Envio real por e-mail exige integracao futura.
- Extrato do locatario/proprietario, contratos (content apenas SIGNED), vistorias (relatorio estruturado, observacoes CONFIRMED, SEM midia bruta - ADR-033) e inicio de pagamento com QR Pix usam FakePaymentProvider em dev; providers reais (banco/Asaas) seguem ADR-024 (IMPLEMENTED_NOT_LIVE_VERIFIED).
- Reporting: KPIs (leads-funnel, revenue-monthly via ledger AGENCY_FEE_REVENUE, meta-spend via snapshots) e exportacao CSV/JSON com RBAC
  report:export, max 10.000 linhas, rate limit 10/min, auditoria e whitelist de colunas por papel (sem PII desnecessaria) - ADR-034.


## Fase 11 - Hardening

- 3 vulnerabilidades pnpm audit --prod: 2 high (image-size DoS em ICNS/JXL/HEIF) e 1 moderate (uuid bounds check em v3/v5/v6) — TODAS transitivas do tooling Expo (metro/@expo/config-plugins via apps/mobile), nao expostas em runtime da API/CRM. Sem fix sem upgrade do SDK Expo (versoes estaveis/suportadas exigidas); monitoradas no CI via pnpm security:audit (informativo) + gate bloqueante para novos critical (docs/THREAT_MODEL.md).
- Observabilidade/SLOs definidos em docs/SLO.md com medidores via @aluguei/observability (pino + OTEL); coleta de metricas em producao depende da implantacao (fora do MVP).
- Backup/restore documentado em docs/OPERATIONS.md (pg_dump + PITR; RPO/RTO em SLO.md) — procedimento nao executado em ambiente real (sem infraestrutura).
