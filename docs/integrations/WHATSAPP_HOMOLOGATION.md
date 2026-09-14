# WhatsApp Cloud API (Meta) — Homologação

Status: **IMPLEMENTED_NOT_LIVE_VERIFIED**

> O adapter `MetaWhatsAppAdapter` (REST da Cloud API) está implementado e testado com
> fetch mock, mas **nenhuma chamada real foi feita** (sem WABA/número/token de homologação).
> Nada abaixo foi validado contra o ambiente live/sandbox da Meta — o que foi confirmado
> vem exclusivamente da documentação oficial consultada (abaixo).

## Documentação consultada (17/08/2026)

O site de docs da Meta bloqueia fetch automatizado direto (`HTTP 400` para
`developers.facebook.com/docs/whatsapp/cloud-api` e variações). O conteúdo foi consultado
via **Wayback Machine** em snapshots de 05/07/2026 a 10/08/2026. A doc foi **migrada** de
`/docs/whatsapp/cloud-api/*` para `/documentation/business-messaging/whatsapp/*`
(301 observado no snapshot de 10/08/2026).

| Fonte                                             | URL (canônico)                                                                                | O que confirmou                                                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| About the WhatsApp Business Platform (2026-08-10) | https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform  | Payload de envio, metadata de phone number (GET), autenticação OAuth, rate limits, throughput 80 msg/s, test resources                      |
| Graph API Changelog (2026-07-09)                  | https://developers.facebook.com/docs/graph-api/changelog                                      | Versão vigente da Graph API: **v25.0** (introduzida 2026-02-18); v21.0 ainda disponível; v20.0 expira 2026-09-24                            |
| WhatsApp error codes (2026-07-05)                 | https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes | Códigos 131026, 131047, 131048, 131049, 131050, 131051, 131056, 130429, 80007, 132000/132001, estrutura `error`                             |
| Message templates — overview (2026-07-28)         | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview  | Criação via `POST /<WABA_ID>/message_templates` (category, language, parameter_format named/positional, components), envio `type: template` |
| Webhooks (referência)                             | https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview   | Payload `entry[].changes[].value` com `messages[]`, `statuses[]`, `contacts[]`, `metadata.phone_number_id`                                  |

## Versão da API

- **Graph API vigente: `v25.0`** (changelog oficial em 09/07/2026). Versões mantidas:
  v25.0 (2026-02-18), v24.0 (2025-10-08), v23.0 (2025-05-29), v22.0 (2025-01-21), v21.0 (2024-10-02).
  **v20.0 expira em 24/09/2026** e versões anteriores já expiraram.
- O adapter usava default `v21.0`; **atualizado para `v25.0`** (`META_GRAPH_DEFAULT_VERSION`),
  mantendo `apiVersion` configurável por opção. Ajustar antes de qualquer upgrade de versão
  futura da Graph API (changelog: https://developers.facebook.com/docs/graph-api/changelog).

## Endpoint base

`https://graph.facebook.com/v25.0/` (base do Graph API; a doc de exemplos usa `v17.0`–`v23.0`,
mas a versão vigente é v25.0).

| Operação                     | Endpoint                                                 | Uso no adapter                             |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Enviar mensagem              | `POST /<PHONE_NUMBER_ID>/messages`                       | `sendText`, `sendTemplateMessage`          |
| Metadata do número (conexão) | `GET /<PHONE_NUMBER_ID>`                                 | `testConnection`                           |
| Criar message template       | `POST /<WHATSAPP_BUSINESS_ACCOUNT_ID>/message_templates` | criação manual (WhatsApp Manager) / futura |

Payload de envio de texto (exemplo oficial, seção "Technical foundations"):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+16505555555",
  "type": "text",
  "text": { "preview_url": true, "body": "..." }
}
```

O adapter envia exatamente este shape (sem `preview_url`, opcional).

## Autenticação

- **Token permanente** (system user access token) via header `Authorization: Bearer <token>`
  (o adapter faz isso). A doc descreve autenticação como OAuth (não OAuth 2.0) com access tokens;
  para servidor-a-servidor usa-se **system user token** criado no Business Manager.
- Validação com o Token Debugger: https://developers.facebook.com/tools/debug/accesstoken
- Token expirado → código `190` (o adapter propaga `WhatsAppProviderError` com `providerCode`).

## Scopes / permissões

Requisitos esperados (validar com o Token Debugger na homologação — a lista exata concedida
por app depende do Business Manager):

- `whatsapp_business_messaging` — enviar/receber mensagens.
- `whatsapp_business_management` — gerenciar WABA, números e templates.
- `waba_management` / `business_management` — gestão de ativos no Business Manager
  (necessárias para criar templates/ler metadata via API).

Falha de permissão → `error.code` `10`/`131005` (permissão revogada/não concedida).

## Webhook

Formato (`/webhooks/whatsapp` da nossa API):

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<WABA_ID>",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
            "contacts": [{ "profile": { "name": "..." }, "wa_id": "..." }],
            "messages": [
              {
                "from": "...",
                "id": "...",
                "timestamp": "...",
                "type": "text",
                "text": { "body": "..." }
              }
            ],
            "statuses": [
              {
                "id": "...",
                "status": "delivered|read|sent|failed",
                "timestamp": "...",
                "errors": []
              }
            ]
          }
        }
      ]
    }
  ]
}
```

- **Verify (GET)**: `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` → retorna o challenge.
- **Assinatura (POST)**: header `X-Hub-Signature-256: sha256=<HMAC-SHA256 do raw body com o app secret>`.
  A rota já valida em tempo constante quando `META_APP_SECRET` está configurado (obrigatório em produção).
- **Retry da Meta**: a Meta reenvia com backoff se não receber 200 rápido — a rota responde 200
  imediato e processa assíncrono via `webhook_inbox` (dedup por UNIQUE provider_event_id).
- **Delivery status**: `statuses[]` (sent/delivered/read/failed) chegam no mesmo webhook. O contrato
  `WhatsAppMessenger.parseWebhookEvent` retorna `[]` para status (por design — interface só cobre
  mensagens). Para rastrear entregas será preciso evoluir a interface/consumidor (fora deste escopo).

## Templates (message templates)

- **Criação**: WhatsApp Manager (https://business.facebook.com/wa/manage/home/) ou
  `POST /<WABA_ID>/message_templates` com `name`, `category` (`AUTHENTICATION` | `MARKETING` | `UTILITY`),
  `language`, `parameter_format` (`named` | `positional`, default positional) e `components`.
  Limites: **250 templates por WABA**; **100 criações/hora**; revisão (APPROVED) antes de usar;
  templates com má qualidade são pausados (132015) ou desativados (132016).
- **Envio** (única forma de iniciar conversa fora da janela de atendimento — ver erro 131047):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+16505551234",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "en_US" },
    "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "Jessica" }] }]
  }
}
```

- Adapter: `MetaWhatsAppAdapter.sendTemplateMessage({ to, templateName, languageCode, bodyParameters })`
  envia exatamente este shape com parâmetros posicionais do body. **Não altera a interface**
  `WhatsAppMessenger` (método extra do adapter concreto).

## Rate limits

| Limite                          | Valor                                                                               | Fonte da doc (2026)                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Throughput por número           | **80 mensagens/s por número** (default; upgrade disponível)                         | About the platform → Throughput                     |
| Pair rate limit (mesmo usuário) | 1 msg a cada 6 s (~10/min, ~600/h); burst de até 45 em 6 s "empresta" da cota       | About the platform → Pair rate limits (erro 131056) |
| Messaging limits (24h)          | Máximo de usuários únicos fora da janela, janela móvel de 24 h, nível do portfolio  | About the platform → Messaging limits               |
| Endpoints de gestão WABA        | 200 req/h por app por WABA; 5.000 req/h para WABA ativo com número registrado       | About the platform → Rate limits                    |
| Legado "1k msgs/dia por número" | Não consta na doc vigente; era o messaging limit clássico de contas não verificadas | Confirmar com a Meta na homologação                 |

O adapter não implementa throttling próprio (a Meta responde `429`/`130429`/`131056`); erros
transitórios são marcados `retryable` para o worker decidir retry com backoff (`4^X` segundos,
conforme docs).

## Sandbox / test resources

- Ao criar o app (get-started) a Meta cria automaticamente **test WhatsApp Business Account** e
  **test business phone number** (números `555...`) com limites relaxados e **sem necessidade de
  payment method** para enviar templates.
- O webhook pode ser testado com o bot eco ("Create a test webhook endpoint") usando o verify token.
- Para produção é preciso verificação do negócio + número real + display name aprovado.

## Erros relevantes (doc oficial 2026-07-05)

| Código               | Significado                                                               | Tratamento recomendado                |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| 131026               | Mensagem não entregue (número não é WhatsApp, ToS não aceito, app antigo) | Informar usuário; não retentar        |
| 131030               | **Não listado na doc vigente** (estava em versões antigas)                | Tratar como genérico (PROVIDER_ERROR) |
| 131047               | >24 h desde a última resposta do usuário — usar template                  | Trocar por template message           |
| 131048               | Número limitado por mensagens bloqueadas/spam                             | Checar quality rating                 |
| 131049               | Não entregue por limite de marketing templates por usuário                | Aguardar ≥24 h                        |
| 131050               | Usuário optou out de marketing                                            | Não retentar                          |
| 131051               | Tipo de mensagem não suportado                                            | Corrigir payload                      |
| 131052/131053        | Falha ao baixar/enviar mídia                                              | Validar mídia                         |
| 131056               | Pair rate limit (muitas msgs ao mesmo usuário)                            | Retry com backoff (4^X s)             |
| 130429               | Cloud API message throughput atingido                                     | Retry com backoff (retryable)         |
| 80007                | WABA atingiu rate limit                                                   | Retry com backoff (retryable)         |
| 131016/133004        | Serviço temporariamente indisponível                                      | Retry (retryable)                     |
| 131021               | Remetente = destinatário                                                  | Corrigir `to`                         |
| 131042               | Erro de payment method                                                    | Corrigir billing                      |
| 131045               | Número não registrado                                                     | Registrar número                      |
| 132000/132001/132012 | Parâmetros de template inválidos/não aprovados                            | Corrigir template                     |
| 190                  | Token expirado                                                            | Renovar token                         |
| 10 / 131005          | Permissão não concedida                                                   | Revisar scopes                        |
| 33                   | Número excluído                                                           | Verificar número                      |
| 100                  | Parâmetro inválido                                                        | Corrigir payload                      |

Estrutura de erro da Graph API (o adapter parseia e expõe): `error.{message, type, code, error_subcode, error_data.details, fbtrace_id}`.

## Implementado hoje (adapter)

- `packages/integrations/src/whatsapp/meta.ts`:
  - `sendText` (payload oficial com `recipient_type`), validação de vazio/4096 chars, timeout 10 s (configurável).
  - `sendTemplateMessage` (método extra do adapter; interface intacta) — envio `type: template`.
  - `testConnection` (método extra) — `GET /<PHONE_NUMBER_ID>` retorna metadata (verified_name,
    quality_rating, code_verification_status, display_phone_number, platform_type, throughput.level).
  - `WhatsAppProviderError` tipado: `providerCode`, `providerSubcode`, `providerDetails`, `fbtraceId`,
    `status` e `retryable` (429/5xx/códigos de throttling) — sem quebrar a interface.
  - `parseWebhookEvent`/`verifyWebhook` inalterados (contrato).
- `packages/integrations/src/whatsapp/whatsapp.test.ts` — 17 testes com fetch mock (envio, template,
  erro tipado 131026, rate limit retryable, timeout, payload inválido, testConnection, parse).
- Default da Graph API: **v25.0** (configurável via `apiVersion`).

## O que falta para homologar (credenciais/contas)

1. **Meta for Developers app** + **WABA real** (WhatsApp Business Account) vinculada ao app.
2. **Número de telefone real** registrado na WABA com display name aprovado (ou usar os **test phone
   numbers `555...`** do sandbox primeiro).
3. **System user access token** (permanente) com `whatsapp_business_messaging` (+ gestão para templates):
   criar em Business Manager > System users; validar no Token Debugger.
4. **`META_APP_SECRET`** (para X-Hub-Signature-256) e **`META_WEBHOOK_VERIFY_TOKEN`** (verify do GET).
5. **URL pública HTTPS** do webhook (`POST/GET /webhooks/whatsapp`) acessível pela Meta.
6. Configurar env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
   `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_MODE=live` (nunca em dev).
7. **Templates aprovados** para mensagens fora da janela (ex.: lembrete de visita, cobrança).
8. Homologar no sandbox (test numbers, webhook eco) e depois validar envio/status/erros em live
   com um único destinatário real; registrar evidência e reclassificar.
9. Após validação real: atualizar `docs/EXECUTION_STATE.md`, `docs/BLOCKERS.md` e a classificação
   para `LIVE_VERIFIED` com evidência (nunca simular sucesso).

## Classificação

**IMPLEMENTED_NOT_LIVE_VERIFIED** — código pronto e testado contra a doc oficial; sem credencial de
homologação, nenhuma chamada real foi executada nem será simulada como sucesso.
