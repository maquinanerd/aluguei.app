# Clicksign — Homologação

> Classificação: **IMPLEMENTED_NOT_LIVE_VERIFIED** — adapter implementado e testado com
> `fetchImpl` mockado; nenhuma chamada real foi feita (sem credencial sandbox) e nenhum
> sucesso de provider real foi declarado.

## Documentação consultada

Todas as páginas abaixo foram lidas via `https://developers.clicksign.com` em **2026-08-17** (a doc marca `updatedAt` por página).

| Página                                         | URL                                                                             | updatedAt  |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| Índice p/ agentes                              | https://developers.clicksign.com/llms.txt                                       | —          |
| Home (API 3.0, exemplo POST /api/v3/envelopes) | https://developers.clicksign.com/                                               | —          |
| Informações gerais (ambientes, auth, JSON:API) | https://developers.clicksign.com/docs/informacoes-gerais.md                     | 2026-06-04 |
| Primeiros passos (sandbox + access token)      | https://developers.clicksign.com/docs/primeiros-passos.md                       | 2026-05-27 |
| Guia de criação (fluxo de 5 etapas + ativação) | https://developers.clicksign.com/docs/guia-de-criacao-o-passo-a-passo-padrao.md | 2026-05-27 |
| Gerenciamento/consultas de envelopes           | https://developers.clicksign.com/docs/gerenciamento-consultas-envelope.md       | 2026-05-27 |
| Envelope (CRUD)                                | https://developers.clicksign.com/reference/api-envelope.md                      | 2026-03-19 |
| Criar envelope (OpenAPI)                       | https://developers.clicksign.com/reference/api-criar-envelope.md                | 2026-06-25 |
| Detalhes do envelope (OpenAPI)                 | https://developers.clicksign.com/reference/api-detalhes-do-envelope.md          | 2026-07-20 |
| Criar documento por upload (base64, OpenAPI)   | https://developers.clicksign.com/reference/api-upload-documentos.md             | 2026-07-20 |
| Listar documentos                              | https://developers.clicksign.com/reference/api-listar-documentos.md             | 2026-07-20 |
| Editar documento (cancelar/finalizar)          | https://developers.clicksign.com/reference/editar-documento.md                  | 2026-07-20 |
| Criar signatário (group = ordem)               | https://developers.clicksign.com/reference/api-criar-signatario.md              | 2026-07-20 |
| Requisito de qualificação                      | https://developers.clicksign.com/reference/criar-requisito-qualificacao.md      | 2026-05-28 |
| Requisito de autenticação                      | https://developers.clicksign.com/reference/criar-requisito-de-autenticacao.md   | 2026-05-28 |
| Visão geral webhooks                           | https://developers.clicksign.com/docs/introducao-a-webhooks.md                  | 2026-06-04 |
| Segurança de webhooks (HMAC + IPs)             | https://developers.clicksign.com/docs/seguranca-de-webhooks.md                  | 2026-08-06 |
| Melhores práticas de webhooks                  | https://developers.clicksign.com/docs/melhores-praticas-webhooks.md             | 2026-06-04 |
| Eventos do envelope                            | https://developers.clicksign.com/docs/envelope-eventos.md                       | 2026-05-27 |
| Evento `close` (payload)                       | https://developers.clicksign.com/docs/evento-close.md                           | 2026-06-04 |
| Rate limit                                     | https://developers.clicksign.com/docs/limite-de-requisicoes.md                  | 2026-05-27 |
| Mensagens de erro                              | https://developers.clicksign.com/docs/mensagens-de-erro.md                      | 2026-05-27 |

## Versão da API

**API v3** (path `/api/v3/`), padrão **JSON:API** (`Accept`/`Content-Type: application/vnd.api+json`).
OpenAPI oficial: `openapi 3.1.0`, `info.title "api-v3"`, `info.version "2.1"`.

## Endpoint base

| Ambiente | Host                                   |
| -------- | -------------------------------------- |
| Produção | `https://app.clicksign.com/api/v3`     |
| Sandbox  | `https://sandbox.clicksign.com/api/v3` |

O adapter usa sandbox por padrão (`baseUrl` opcional troca para produção).

## Autenticação

- Access token de conta (Configurações → API → Gerar Access Token), tratado como senha.
- Header `Authorization` com o token. **Ambiguidade na doc oficial**: a referência v3 e os
  exemplos curl usam token cru (`Authorization: {{access_token}}`); a página inicial usa
  `Authorization: Bearer SEU_TOKEN`. O adapter envia o token cru (segue a referência v3);
  **confirmar o esquema no sandbox antes do live** (uma linha no header do adapter).
- A doc também aceita `?access_token=` na query (usada no teste de autenticação do guia).

## Scopes

Não documentados: a API usa um access token de conta (não OAuth/escopos por recurso).
Não há lista de scopes na documentação consultada.

## Fluxo de criação do envelope (confirmado na doc)

1. `POST /envelopes` → envelope `draft` (`{ data: { type: "envelopes", attributes: { name, auto_close } } }`).
2. `POST /envelopes/{id}/documents` → upload por **base64** (`filename` + `content_base64`; formatos .pdf/.docx/.doc/.txt/.png/.jpeg). **Não há upload por URL/hash documentado**.
3. `POST /envelopes/{id}/signers` → `{ name, email?, group }` (`group` = ordem de assinatura; `email` obrigatório apenas com notificação por e-mail).
4. `POST /envelopes/{id}/requirements` → qualificação (`action: "agree"`, `role: "sign"`) vinculando signatário ↔ documento.
5. `PATCH /envelopes/{id}` `status: "running"` → ativação/envio. Exige **≥1 critério de autenticação por signatário** (`provide_evidence` + `auth`).

`getStatus` → `GET /envelopes/{id}`; estados: `draft` | `running` | `closed` | `canceled`.
Mapeamento p/ o domínio: `draft → PENDING`, `running → SENT`, `closed → SIGNED`, `canceled → FAILED`.

Cancelamento: `PATCH /envelopes/{id}/documents/{doc_id}` `status: "canceled"` (só documentos `running`);
`DELETE /envelopes/{id}` só para rascunho. Download: `links.files.original` (a v3 **não documenta** URL separada do assinado).

## Webhooks

- Configurados por conta; **responder 200 rápido** (sem redirect; 2xx exigido).
- Header `Event` com o tipo; body JSON (ex. evento `close`: `{ "event": { "name": "close", "data": {...} }, "document": {...} }`).
- **Autenticação/HMAC (confirmado)**: a cada disparo a Clicksign envia `Content-Hmac: sha256=<hex>` —
  HMAC-SHA256 do **body cru** com o segredo gerado por webhook. IPs fixos:
  produção `34.204.113.69`, sandbox `3.232.199.65`.
- No nosso produto: `POST /webhooks/signature` deduplica por `(provider, provider_event_id)` e enfileira
  em `webhook_inbox` (provider SIGNATURE). `SIGNATURE_WEBHOOK_TOKEN` está reservado para o HMAC quando
  o payload real do provider for validado em homologação.

## Rate limits

| Ambiente | Limite           |
| -------- | ---------------- |
| Produção | 50 req/conta/10s |
| Sandbox  | 20 req/conta/10s |

Headers: `X-Rate-Limit`, `X-Rate-Limit-Remaining`, `X-Rate-Limit-Reset`. Excedeu → `429`.
Links de download (S3) não contam. Polling de documentos é desaconselhado/limitado (preferir webhooks).

## Sandbox

Conta gratuita em `https://sandbox.clicksign.com/signup`; token em Configurações → API.
Documentos sem validade jurídica; mesma versão da produção.

## Idempotência

- **Webhook**: idempotente no nosso lado (`UNIQUE(provider, provider_event_id)` no inbox + insert `onConflictDoNothing`).
- **API**: a doc não documenta idempotency key nas operações de criação. `createEnvelope` faz várias
  chamadas; falha no meio deixa recursos órfãos (envelope draft/documentos/signatários) recuperáveis
  via `DELETE` (rascunho) ou `PATCH canceled`. Item a confirmar com o suporte em homologação.

## Erros

JSON:API `errors[]` com `code`, `status`, `title`, `detail`, `source` (quando aplicável).

| HTTP | Significado (doc oficial)                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| 400  | bad_request (validação do cliente)                                                                                 |
| 401  | unauthorized — Access Token inválido                                                                               |
| 403  | forbidden — token sem permissão                                                                                    |
| 404  | not found                                                                                                          |
| 422  | unprocessable entity (ex.: status inválido)                                                                        |
| 429  | rate limit excedido                                                                                                |
| 500  | erro interno                                                                                                       |
| 503  | service unavailable — conta sem envelope ativo (contas criadas antes de 01/07/2024 precisam ativação pelo suporte) |

O adapter mapeia: 401/403 → `AUTH`, 429 → `RATE_LIMIT`, demais → `HTTP` (todos `SignatureProviderError` com `status`/`details`).

## O que falta para homologar

1. **Credencial sandbox**: access token de conta sandbox (nunca colocar em código/commit/log).
2. **Esquema do header Authorization**: confirmar token cru vs `Bearer` (adapter envia token cru).
3. **Critério de autenticação**: ativação exige ≥1 requisito de autenticação por signatário (`provide_evidence`),
   que exige e-mail/telefone/CPF — a interface `EnvelopeParty` **não carrega identidade real**. Para live,
   ampliar `CreateEnvelopeInput` (sem quebrar `types.ts` hoje) ou definir fluxo alternativo (ex.: embedded signature).
4. **Nome do signatário**: a interface não tem nome/e-mail; o adapter usa rótulo determinístico
   `Proprietário 1`/`Locatário N`/`Fiador N` com `signature_request: "none"` (e-mail não obrigatório).
   Identidade real é pré-requisito p/ envio real.
5. **Documento**: o produto hoje envia `documentRef = contentHash`; a v3 só aceita upload base64.
   `createEnvelope` lança `SignatureProviderError('UNSUPPORTED_DOCUMENT_REF')` para URL/hash.
   O fluxo `send-for-signature` precisa passar o documento renderizado em base64/data URI.
6. **Webhook real**: confirmar header `Event`/payload, mapear eventos para `SIGNER_SIGNED`/`COMPLETED`/`FAILED`
   e validar `Content-Hmac` (usar `SIGNATURE_WEBHOOK_TOKEN`).
7. **Download do assinado**: confirmar que `links.files.original` serve o arquivo assinado após `closed`.
8. **Idempotência de createEnvelope**: confirmar com suporte (sem idempotency key documentada).

## Suposições sinalizadas (não confirmadas na doc)

- Esquema do `Authorization` (token cru vs `Bearer`) — a própria doc oficial diverge entre páginas.
- `links.files.original` como URL do documento assinado após `closed`.
- Exigência prática de requisito de autenticação para ativação em contas sandbox novas (a doc afirma a regra,
  mas o comportamento real será verificado com a conta).
