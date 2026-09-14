# Homologação — Asaas (pagamentos)

> Classificação: **IMPLEMENTED_NOT_LIVE_VERIFIED**
> Sem credencial real (sandbox/produção) não há validação ao vivo; nenhuma
> chamada externa real foi feita. Adapter, testes unitários com fetch mockado e
> documentação estão prontos.

## Documentação consultada (2026-08-17)

| Tema                                               | URL                                                                            | updatedAt (docs) |
| -------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| Referência API (OpenAPI 3.0.1, info.version 3.0.0) | https://docs.asaas.com/reference                                               | 2026-06-03       |
| Criar nova cobrança                                | https://docs.asaas.com/reference/criar-nova-cobranca                           | 2026-06-03       |
| Recuperar uma única cobrança                       | https://docs.asaas.com/reference/recuperar-uma-unica-cobranca                  | 2026-06-03       |
| Obter QR Code Pix                                  | https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix         | 2026-06-03       |
| Excluir cobrança                                   | https://docs.asaas.com/reference/excluir-cobranca                              | 2026-07-14       |
| Estornar cobrança                                  | https://docs.asaas.com/reference/estornar-cobranca                             | 2026-06-03       |
| Criar novo cliente                                 | https://docs.asaas.com/reference/criar-novo-cliente                            | 2026-06-03       |
| Listar clientes                                    | https://docs.asaas.com/reference/listar-clientes                               | 2026-06-03       |
| Autenticação                                       | https://docs.asaas.com/docs/autenticação-1                                     | 2026-07-31       |
| Webhooks de cobranças                              | https://docs.asaas.com/docs/webhook-para-cobrancas                             | 2026-08-13       |
| Receber eventos no endpoint                        | https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook | 2026-06-22       |
| Criar Webhook pela API                             | https://docs.asaas.com/docs/criar-novo-webhook-pela-api                        | 2026-06-19       |
| Idempotência em Webhooks                           | https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks          | 2026-06-22       |
| Rate limits                                        | https://docs.asaas.com/reference/rate-e-quota-limit                            | 2025-09-08       |
| Sandbox                                            | https://docs.asaas.com/docs/sandbox                                            | 2026-08-03       |

## Versão da API

OpenAPI `3.0.1` / `info.version 3.0.0`; prefixo de paths `/v3`. O adapter usa
exclusivamente endpoints documentados desta referência.

## Endpoint base

| Ambiente | URL                                               |
| -------- | ------------------------------------------------- |
| Produção | `https://api.asaas.com` (paths `/v3/...`)         |
| Sandbox  | `https://api-sandbox.asaas.com` (paths `/v3/...`) |

Chave de Produção usada em Sandbox (ou vice-versa) → `401 invalid_environment`.
Prefixos documentados: sandbox `$aact_hmlg_*`, produção `$aact_prod_*`. O
adapter detecta troca de ambiente e lança `ENV_MISMATCH` antes de qualquer chamada.

## Autenticação

- Header `access_token` com a API Key (obrigatório).
- Header `User-Agent` **obrigatório** para contas criadas após 13/06/2024 —
  o adapter envia `AlugueiApp/0.1.0` (configurável via `userAgent`).
- `Content-Type: application/json` apenas em requisições com body.
- GET com body → `403 Forbidden` (adapter nunca envia body em GET).
- Scopes: a documentação consultada **não define scopes** — a API Key dá acesso
  à conta; mecanismos adicionais são whitelist de IPs e authToken de webhook.

## Endpoints usados pelo adapter

| Operação                               | Endpoint                                                               | Notas                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `createCharge`                         | `POST /v3/payments`                                                    | `customer`, `billingType`, `value` (reais), `dueDate`, `description`. `billingType` PIX/BOLETO/UNDEFINED (default PIX).             |
| QR Pix (createCharge PIX/UNDEFINED)    | `GET /v3/payments/{id}/pixQrCode`                                      | retorna `payload` (copia e cola) → `pixQrCode`.                                                                                     |
| Boleto (createCharge BOLETO/UNDEFINED) | campo `bankSlipUrl` da resposta                                        | → `boletoUrl`.                                                                                                                      |
| `getChargeStatus`                      | `GET /v3/payments/{id}`                                                | mapeia o enum de status (ver abaixo).                                                                                               |
| `cancelCharge`                         | `DELETE /v3/payments/{id}`                                             | `404` tratado como já-removida (idempotente).                                                                                       |
| `refundPayment`                        | `POST /v3/payments/{id}/refund`                                        | sem body = estorno integral.                                                                                                        |
| find-or-create cliente                 | `GET /v3/customers?externalReference=…&limit=1` + `POST /v3/customers` | dedupe por `externalReference` (`aluguei:payer:{documento}`); `notificationDisabled: true` (o domínio cuida das suas notificações). |

Cliente obrigatório na criação de cobrança: sem `customerId` no adapter, usa
`payerName` + `payerDocument` para find-or-create com cache em memória.

## Mapeamento de status (GET /v3/payments/{id} → domínio)

| Asaas                                                                  | Domínio                   | Observação                  |
| ---------------------------------------------------------------------- | ------------------------- | --------------------------- |
| PENDING, AWAITING_RISK_ANALYSIS, REFUND_REQUESTED, REFUND_IN_PROGRESS  | PENDING                   | transitórios                |
| RECEIVED, CONFIRMED, RECEIVED_IN_CASH                                  | CONFIRMED                 | valor disponível/confirmado |
| OVERDUE, DUNNING_REQUESTED, DUNNING_RECEIVED                           | FAILED                    | não paga                    |
| CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE, AWAITING_CHARGEBACK_REVERSAL | FAILED                    | conservador: não creditar   |
| REFUNDED                                                               | REFUNDED                  |                             |
| outro                                                                  | **erro** `UNKNOWN_STATUS` | nunca mapeia em silêncio    |

## Webhook

- Formato: `POST` JSON `{ id: "evt_…", event: "PAYMENT_RECEIVED", dateCreated, account, payment: { id, value, status, … } }`.
- Eventos relevantes: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` (Pix não passa por CONFIRMED: `PAYMENT_CREATED → PAYMENT_RECEIVED`), `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`.
- Entrega **at least once** → idempotência obrigatória por `id` do evento (o `webhook_inbox` já deduplica por `(provider, provider_event_id)`).
- Responder 2xx rápido; 15 falhas → fila interrompida; eventos retidos 14 dias.
- **Token**: `authToken` (32–255 chars) configurado na criação do webhook e enviado no header **`asaas-access-token`**.
- `mapAsaasPaymentWebhook(body)` (adapter) normaliza para o schema interno
  (`paymentWebhookEventSchema`): `PAYMENT_CONFIRMED/RECEIVED → PAYMENT_CONFIRMED`,
  `PAYMENT_REFUNDED → PAYMENT_REFUNDED`, `PAYMENT_OVERDUE → PAYMENT_OVERDUE`,
  `PAYMENT_DELETED → PAYMENT_FAILED`. Eventos sem mapeamento (ex. `PAYMENT_CREATED`,
  chargebacks, `PAYMENT_PARTIALLY_REFUNDED`) retornam `null` → ignorar.
- O worker **sempre** confirma via `getChargeStatus` antes de creditar (P1) —
  o adapter real não expõe `confirmCharge`.

> ⚠️ **Divergência encontrada (precisa de ajuste fora do escopo desta tarefa):**
> a rota atual `apps/api/src/routes/webhooks.ts` valida o header
> **`asaas-webhook-token`**, mas a documentação oficial vigente (2026-06-22) diz
> que o token é enviado no header **`asaas-access-token`**. O `ASAAS_WEBHOOK_TOKEN`
> configurado deve ser validado contra o header correto antes do go-live.

## Rate limits

- Headers `RateLimit-Limit/Remaining/Reset` por endpoint; `429 Too Many Requests` ao atingir.
- Cota: 25.000 requisições/12h por conta (todos os endpoints).
- 50 GETs concorrentes.
- Classificação no adapter: `429`/`408`/5xx → `retryable: true`; 4xx → `false`.

## Sandbox

- Público e gratuito: criar conta em https://sandbox.asaas.com → API Key `$aact_hmlg_*`.
- Aprovação automática de contas com dados válidos; confirmação manual de cobranças;
  cartões fictícios; não compartilha dados com Produção.
- Notificações por e-mail/SMS funcionam — usar somente dados próprios/ficcional.

## Idempotência

- A API **não documenta** header de idempotência em `POST /v3/payments`.
- Idempotência é **responsabilidade do chamador**: persistir `providerChargeId`
  antes de re-tentar; consultar o status antes de creditar (o worker já faz);
  webhooks deduplicados por `id` do evento.
- `createCharge` não é atômico: se falhar após criar a cobrança (ex. timeout na
  busca do QR), um re-try cria outra cobrança — documentado; mitigação via
  `getChargeStatus(providerChargeId)` quando o id já é conhecido.

## Erros (formato)

`{ errors: [{ code, description }] }` com status 400/401/403/404/429/5xx.
O adapter mapeia para `AsaasPaymentError` (tipado): `code` (primeiro do body ou
`http_<status>`), `providerStatusCode`, `providerCodes`, `retryable`.
Erros adicionais: `TIMEOUT` (AbortSignal), `NETWORK`, `INVALID_RESPONSE` (2xx fora
do contrato zod — retryable), `CUSTOMER_REQUIRED`, `ENV_MISMATCH`, `UNKNOWN_STATUS`.

## O que falta para homologar

1. **Credencial sandbox**: conta em https://sandbox.asaas.com + API Key (`$aact_hmlg_*`).
2. Configurar `ASAAS_API_KEY` (e `PAYMENT_PROVIDER=ASAAS`) + `ASAAS_WEBHOOK_TOKEN`.
3. Criar o webhook (app web ou `POST /v3/webhooks`) apontando para
   `https://…/webhooks/payments` com `authToken` (32–255 chars) e eventos
   `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`,
   `PAYMENT_REFUNDED`; **validar header `asaas-access-token` na rota** (ver divergência acima).
4. Homologar fluxos: criar cliente → cobrança PIX (QR) e BOLETO → pagamento
   simulado no sandbox → webhook → conciliação; cancelamento; estorno (observar
   que taxas não são devolvidas — estorno total pode exigir saldo, `400`).
5. Definir whitelist de IPs do Asaas se desejado.
6. Após validação, repetir com conta Produção (chave `$aact_prod_*`) e `env: 'production'`.

## Export no index do pacote (fora do escopo desta tarefa)

`packages/integrations/src/index.ts` não foi editado (instrução). Para expor o
adapter e o mapper pelo pacote, adicionar:

```ts
export { AsaasPaymentProvider, mapAsaasPaymentWebhook } from './payments/asaas.js';
export type { AsaasPaymentProviderOptions, AsaasPaymentWebhookEvent } from './payments/asaas.js';
```

## Suposições sinalizadas (não confirmadas ao vivo)

- `getChargeStatus` para `CHARGEBACK_*` → `FAILED` (conservador, sem crédito).
- `PAYMENT_PARTIALLY_REFUNDED` ignorado (`null`) — modelo interno não suporta estorno parcial.
- `cancelCharge` trata `404` como sucesso (cancelamento idempotente).
- `notificationDisabled: true` no cliente Asaas (evita notificação duplicada).
- `paidAt` normalizado para ISO UTC (Asaas envia data-hora sem timezone).
- User-Agent `AlugueiApp/0.1.0` (doc recomenda identificar a aplicação).
