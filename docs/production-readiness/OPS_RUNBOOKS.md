# Runbooks Operacionais — Aluguei.app

> Fase 16. Runbooks para operação; nenhum efeito externo real nesta sessão.

## Requisitos de observabilidade

- Logs estruturados (pino) em API e worker; `LOG_LEVEL` por env.
- Request-id (Fastify) e job-id (filas `webhook_inbox`/`channel_sync_jobs`/`meta_sync_jobs`).
- Health: `/health` liveness · `/health/ready` readiness (checa DB).
- Credenciais de integração NUNCA em logs (adapters não logam secrets; erros tipados sem corpo de secret).

## 1. Restore de banco

1. Pare os consumidores: pause o worker (remova o env `DATABASE_URL` ou derrube o processo) e o deploy da API.
2. Restore do backup (pg_restore/dump) no mesmo cluster/versão.
3. Suba API + worker. Verifique `/health/ready` e um GET de leitura (ex.: `/leads?limit=1`).
4. Fila: eventos pendentes antigos no `webhook_inbox` podem referenciar estados antigos — os handlers são idempotentes (dedup UNIQUE + transições guardadas); se um job falhar 3x, inspecione `last_error` e apague/republique com critério.

## 2. Pagamento falhou (charge travada)

- Sintoma: charge `OPEN`/`OVERDUE` com `provider_charge_id` preenchido.
- Diagnóstico: `webhook_inbox` rows `provider='PAYMENT'` com `last_error`; conferir no painel do Asaas o status real da cobrança (o worker SEMPRE confirma no provider antes de creditar).
- Ação: se o provider confirma pago mas o ledger não creditou, reenvie o webhook (replay) ou corrija o job manualmente; nunca force `PAID` sem confirmação do provider.
- Pós: conferir `ledger_entries` (D=C) e `payouts` PENDING.

## 3. Payout não processado

- Payouts nascem `PENDING`. Se permanecer `PENDING` além do esperado: conferir `bank_accounts` da parte, job `PAYMENT_RECONCILE`, e rate limits do provider de pagamento.
- Em produção, aprovacao de payout deve ter controle humano antes de envio (operação sensível).

## 4. Webhook replay

- Dedup: `UNIQUE(provider, provider_event_id)` — reenvio do MESMO evento é no-op.
- Para reenfileirar um evento não processado: corrija a causa do `last_error` e reinicie o job (UPDATE `webhook_inbox` SET `status='PENDING', attempts=0`), ou reenvie o webhook do provider com novo evento.
- Sempre valide assinatura/token antes de reenfileirar.

## 5. Canal com sync preso

- Sintoma: `channel_sync_jobs` `RUNNING` > 5 min (reaper deveria resetar) ou `FAILED` com attempts=5.
- Ação: inspecione `last_error`; se falha do provider (ex.: rate limit), o retry com backoff já cobre; se falha de schema, corrija o adapter e rode `POST /channels/:channel/reconcile`.
- Reaper: jobs `RUNNING` com `started_at` antigo voltam a `PENDING` automaticamente.

## 6. Reconciliação de assinatura

- Eventos fora de ordem convergem (SIGNER_SIGNED após COMPLETED finaliza). Se um contrato ficar `PARTIALLY_SIGNED` com todos os signatários assinados: reenvie o webhook `COMPLETED` do provider ou o job de reconciliação (se houver). Confirme o status real no painel da Clicksign.

## 7. Outage de provider

- Adapters têm timeout (AbortSignal) e erros tipados. Webhooks retornam 200 rápido (fila) — o provider não reenvia em loop.
- Jobs falham com retry exponencial (3–5x) e ficam `FAILED` com `last_error` — sem perda de evento (payload persistido).

## 8. Pausa de emergência de campanha Meta

- `POST /meta/campaigns/:id/pause` (intent → worker → PAUSED). No MCP: `meta_pause_campaign`.
- Em emergência, pausar no painel da Meta também é válido; a reconciliação de insights captura o estado real na próxima sync.
- Nunca deletar a campanha antes de arquivar (archive) para preservar histórico/auditoria.

## Backup/SLO

- Ver `docs/OPERATIONS.md` (backup/restore) e `docs/SLO.md`.
