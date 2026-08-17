# Plano de Piloto — Aluguei.app

> Fase 18. Documento de plano; NÃO executar automaticamente. Depende de credenciais/homologação por provider.

## Objetivo

Validar ponta a ponta com UMA imobiliária real em operação controlada, sem expor todo o produto nem todos os providers de uma vez.

## Escopo recomendado

- 1 organização (1 imobiliária).
- Equipe pequena (1–3 corretores).
- 5–10 imóveis.
- Poucos proprietários e locatários.
- Providers: começar com os que tiverem credencial sandbox disponível; cada um ativado com `META_MODE`/`PAYMENT_PROVIDER`/`SIGNATURE_PROVIDER`/`SCREENING_PROVIDER`/`AI_PROVIDER` explícitos (nunca fake em prod).

## Jornadas a validar

1. Cadastro de imóvel (inclui Places/geocoding quando chave disponível; fallback manual).
2. Publicação: listing → canal (primeiro o canal com contrato; OLX Imóveis é o único com API pública documentada).
3. Lead + WhatsApp (número piloto; templates aprovados) + visita + proposta.
4. Contrato + assinatura (Clicksign sandbox) → vistoria (mobile: login → agenda → vistoria) → locação.
5. Cobrança + pagamento (Asaas sandbox, PIX) → confirmação no provider → ledger balanceado → payout (PENDING; aprovação humana) → extrato no portal do locatário.
6. Meta Ads: ad profile + campanha CREATED_PAUSED → publish via intent (máximo budget diário definido) → insights.

## Critérios de go / no-go

- Go: cadastro→cobrança funcionando sem intervenção manual; ledger D=C; portal do locatário correto; metas de conciliação ok; zero P0/P1.
- No-go/rollback: qualquer divergência de dinheiro, vazamento de PII, anúncio ativo não intencional, ou assinatura assinada sem ordem correta.

## Rollback

- Providers: reverter env para FAKE/dry_run (o sistema mantém fakes em dev/test) — nenhuma dependência de estado externo para voltar a operar localmente.
- Pagamentos: cobranças não iniciadas podem ser canceladas; iniciadas → estorno manual conforme provider.
- Meta: pausar campanhas (intent) e arquivar; nunca ativar ACTIVE direto.
- Dados: restore de backup (ver OPS_RUNBOOKS).

## Passos de entrada

1. Provisionar credenciais de homologação (lista em INTEGRATION_STATUS.md).
2. Criar organização piloto + usuários.
3. Rodar E2E (Playwright) e journey in-process contra a stack com os providers sandbox.
4. Definir janela (sugestão: 2–4 semanas), métricas e dono de cada fluxo.
5. Habilitar observabilidade (Sentry/OTEL) e alertas dos runbooks.
