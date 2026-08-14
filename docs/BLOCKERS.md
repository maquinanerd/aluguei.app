# Blockers externos

Nenhum no bootstrap.

O agente deve registrar aqui apenas depend�ncias externas reais: credenciais, App Review, conta de teste, homologa��o, contrato de portal, sandbox indispon�vel etc. N�o registrar d�vidas de arquitetura que ele pr�prio possa resolver.

## Fase 03 � IMPLEMENTED_NOT_LIVE_VERIFIED

- `GoogleMapsGeocodingAdapter` (REST) implementado com contrato zod, timeout e mock determin�stico (`GeocodingMockService` em dev/test; `null` em produ��o sem chave). Sem credencial real de homologa��o ? n�o validado contra a API Google live.
- `S3StorageAdapter.getPresignedPutUrl` (presigned PUT SigV4 via `@aws-sdk/s3-request-presigner`) implementado e testado com assinatura local; upload real contra Cloudflare R2 n�o verificado (sem credenciais/bucket de homologa��o).

## Fase 04 � IMPLEMENTED_NOT_LIVE_VERIFIED

- `IListingChannelAdapter` implementado com `FakeChannel` de refer�ncia (dev/test). Canais reais (Canal Pro/VivaReal/ZAP/OLX/Imovelweb) registrados SEM adapter � sem contrato oficial acess�vel, nenhum endpoint � inventado (docs/INTEGRATIONS.md). A implementa��o real de cada portal exige documenta��o oficial/contratual antes de qualquer chamada.

## Fase 04 � D�vidas registradas (p�s-review)

- **LGPD � leads de canal sem consentimento registrado**: `importLeads` (worker) cria party+lead sem gravar `party_consents` (purpose `CHANNEL_LEAD_CONTACT`). O consentimento de leads provenientes de portais deve ser registrado na fase de Screening (Fase 07) antes de qualquer uso al�m de contato inicial.
- **Retry autom�tico de jobs**: FAILED volta eleg�vel quando `run_at` vence (attempts < 5); acima disso exige re-enfileiramento manual via API. Sem dead-letter queue (jobs FAILED com attempts = 5 ficam vis�veis no painel com last_error).

## Fase 05 � IMPLEMENTED_NOT_LIVE_VERIFIED

- `MetaWhatsAppAdapter` (Cloud API REST) implementado com zod, timeout 10s e verify token; sem credencial real de homologa��o ? n�o validado contra a Meta live (`META_MODE=dry_run` usa FakeWhatsAppMessenger).
- `AiProvider` com `MockAiProvider` (regras determin�sticas); adapters OpenAI/Gemini reais adiados (registry � o gancho; sem chave nunca chama LLM externo).
- Assinatura `X-Hub-Signature-256` validada quando `META_APP_SECRET` presente; sem secret, a seguran�a vem do verify token trocado na assinatura do webhook (documentado em INTEGRATIONS.md).

## Fase 06 � IMPLEMENTED_NOT_LIVE_VERIFIED

- `MockInspectionAiProvider` (transcri��o/sugest�es determin�sticas por regras) � o padr�o; adapters reais de transcri��o/vis�o (LLM) exigem chave e devem obedecer o contrato de payload com EVID�NCIA OBSERV�VEL apenas (nunca causa/diagn�stico) � nota em docs/AI_STRATEGY.md. Sem credencial ? mock, nunca LLM externo.
- Assinatura de vistoria (SIGNED) reservada: transi��o existe na m�quina, rota rejeita com 400 at� a Fase 07. PDF de relat�rio adiado para a fase de relat�rios (10) � endpoint de snapshot estruturado dispon�vel.

## Fase 07 � IMPLEMENTED_NOT_LIVE_VERIFIED

- `IScreeningProvider` com `FakeScreeningProvider` determin�stico; Serasa/SPC reais registrados SEM adapter (sem documenta��o/credencial acess�vel � job falha com "provider n�o configurado", nunca inventa endpoints).
- `ISignatureProvider` com `FakeSignatureProvider`; Clicksign/D4Sign reais sem token/doc ? 400 "assinatura n�o configurada" (produ��o NUNCA assina fake). Webhook de assinatura aceita payload m�nimo (sem valida��o HMAC � `SIGNATURE_WEBHOOK_TOKEN` reservado para quando o provider real documentar).
- Decis�es de cr�dito s�o AUTOM�TICAS por regras determin�sticas (threshold `SCREENING_APPROVE_SCORE_MIN` default 700, rastreio em `decision_rules`); revis�o humana obrigat�ria em casos inconclusivos (MANUAL_REVIEW com motivo).

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

- 2 vulnerabilidades pnpm audit --prod: image-size (DoS em ICNS/JXL/HEIF) — fix publicado exige >=2.0.3 que NAO existe no npm (ultima 2.0.2; 2.x quebra o metro). Mantido 1.2.1 por compatibilidade; nao exposto em runtime da API/CRM; monitorado no CI via pnpm security:audit (informativo) + gate bloqueante para novos critical (docs/THREAT_MODEL.md). A vuln moderate uuid (bounds check) foi zerada via pnpm.overrides (pnpm-workspace.yaml).
- Observabilidade/SLOs definidos em docs/SLO.md com medidores via @aluguei/observability (pino + OTEL); coleta de metricas em producao depende da implantacao (fora do MVP).
- Backup/restore documentado em docs/OPERATIONS.md (pg_dump + PITR; RPO/RTO em SLO.md) — procedimento nao executado em ambiente real (sem infraestrutura).

## Fase 12 - Final Audit

- Auditoria de seguranca final: 0 P0, 3 P1 corrigidos (webhook payments agora confirma no provider antes de creditar + valida ASAAS_WEBHOOK_TOKEN; webhook WhatsApp valida X-Hub-Signature-256 quando META_APP_SECRET configurado; UPDATE_BUDGET valida caps da org na rota, tool MCP e worker) e 7 P2 tratados (ownership em intents, MCP_ALLOWED_ORG_ID, redacao EAAG, refund com reversao contabil + confirmacao no provider, overrides uuid). P2-7 (content de contrato antes de SIGNED para staff) e decisao documentada: staff interno revisa antes de enviar — portal externo segue o gate SIGNED.
