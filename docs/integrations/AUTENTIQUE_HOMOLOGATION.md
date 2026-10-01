# Homologação — Autentique (assinatura eletrônica)

Decisão do dono em 01/10/2026: a assinatura do contrato passa a ser pela Autentique, no lugar da
Clicksign (ADR-106). Status: **`IMPLEMENTED_NOT_LIVE_VERIFIED`** — adapter, webhook e testes com
`fetch` simulado; nenhum documento foi enviado à Autentique.

## Documentação consultada (2026-10-01)

Documentação oficial em `https://docs.autentique.com.br/api` (índice em `llms.txt`, páginas em
Markdown com o sufixo `.md`): introdução, preço da API, sandbox, criação de documento, consulta de
documentos, mensagens de erro e webhooks (versão nova, não a "deprecated").

## Endpoint e autenticação

- `POST https://api.autentique.com.br/v2/graphql` — só GraphQL, sem REST.
- `Authorization: Bearer <chave>`; a chave é gerada no painel, em `painel.autentique.com.br/perfil/api`.
- Limite: 10 requisições por minuto no plano gratuito, 60 no profissional, 200 no corporativo.

## Sandbox

Não há ambiente separado: é a mesma conta e a mesma chave, com `sandbox: true` na criação do
documento. O documento de teste não consome crédito, não tem validade jurídica, não gera trilha de
auditoria e é apagado em alguns dias. A doc pede para **não usar documento real no sandbox**. No
produto, `AUTENTIQUE_ENV=sandbox` liga isso, e o painel mostra o "modo de teste"
(`AUTENTIQUE_SANDBOX` em `GET /capabilities`).

O pedido de assinatura sai de verdade no sandbox (a doc não diz o contrário): as partes recebem o
e-mail. Na homologação, use partes com e-mails seus.

## Preço (para o dono decidir o plano)

Por documento criado pela API: US$ 0,01; por pedido de assinatura por e-mail: US$ 0,002 (WhatsApp
US$ 0,02; SMS US$ 0,03). Consulta de documento e entrega de webhook também são cobradas, em frações
de centavo. O valor do plano é um compromisso mínimo mensal; o plano gratuito tem 10 documentos por
mês. O sandbox não é cobrado.

## O que o adapter faz (`packages/integrations/src/signature/autentique.ts`)

- **Criação** — mutation `createDocument(sandbox, document, signers, file)` em
  `multipart/form-data` (graphql-multipart-request-spec: `operations`, `map`, `file`). O arquivo é o
  PDF gerado do texto da versão do contrato (P1-11). O nome do documento é "Contrato de locação ·
  versão N" (ou "de compra e venda"), sem dado pessoal.
- **Signatários** — cada parte vai como `{ email, action: "SIGN" }`, na ordem de assinatura. Do
  cadastro só sai o e-mail; nome e CPF a pessoa informa ao assinar. Sem e-mail no cadastro, a API
  recusa o envio com 400 antes de chamar a Autentique; duas partes com o mesmo e-mail também.
- **Ligação parte ↔ assinatura** — a resposta traz um `public_id` por assinatura. O envelope guarda
  `[{ signOrder, providerSignerId }]` em `signature_envelopes.provider_signers` (migration 0040),
  ligado pelo e-mail ou, se a resposta não trouxer e-mail, pela ordem.
- **Consulta** — query `document(id)` com `signatures { signed rejected }`: rejeitada → `FAILED`;
  todas assinadas → `SIGNED`; algumas → `PARTIALLY_SIGNED`; nenhuma → `SENT`.
- **Novas tentativas** — a criação não repete: a API não tem chave de idempotência, e repetir depois
  de tempo esgotado pode criar (e cobrar) um segundo documento. A consulta tenta duas vezes em
  limite, tempo esgotado ou 5xx.
- **Erros** — 401/403 e `unauthorized` viram `AUTH`; 429 vira `RATE_LIMIT`; erro do GraphQL vira
  `PROVIDER_REJECTED` sem repetir valor de variável (a mensagem de variável inválida ecoa o valor,
  que pode ser um e-mail): só passam códigos e frases curtas sem aspas, e da validação só os nomes
  dos campos. Na API, entrada recusada é 400 e o resto é 502.

## Webhook (`POST /webhooks/signature/autentique`)

- **Autenticidade** — HMAC-SHA256 em hex do corpo cru, com o segredo do endpoint, no cabeçalho
  `x-autentique-signature` (exemplos oficiais em Node e PHP). Em produção o segredo
  (`AUTENTIQUE_WEBHOOK_SECRET`) é obrigatório; assinatura errada é 401.
- **Eventos** — `signature.accepted` → `SIGNER_SIGNED` da parte (pelo `public_id`);
  `signature.rejected` e `document.deleted` → `FAILED`; `document.finished` → um `SIGNER_SIGNED`
  por assinatura feita e `COMPLETED`. Os outros respondem 200 sem efeito.
- **Idempotência** — a Autentique pode repetir um evento, até com outro id, e não garante a ordem.
  A chave é tipo + id do objeto (`signature.accepted:<public_id>`); o `document.finished` usa a
  mesma chave do aceite, então um aceite perdido ainda fecha o contrato e um repetido é descartado.
  O worker já converge com eventos fora de ordem (`apps/worker/src/signatureJobs.ts`).
- **Formato** — a doc mostra o objeto ora em `data.object`, ora direto em `data`; o parser aceita
  os dois, e o documento da assinatura como texto ou como objeto com `id`.

## Configuração

| Variável                    | Valor                                                           |
| --------------------------- | --------------------------------------------------------------- |
| `SIGNATURE_PROVIDER`        | `AUTENTIQUE` (vazia no Coolify: `FAKE`)                         |
| `AUTENTIQUE_API_TOKEN`      | chave da API                                                    |
| `AUTENTIQUE_ENV`            | `sandbox` ou `production` — obrigatória em produção, sem padrão |
| `AUTENTIQUE_WEBHOOK_SECRET` | segredo do endpoint cadastrado no painel da Autentique          |

## O que falta para homologar

1. **Conta e chave** — criar a conta, gerar a chave da API e colocá-la no Coolify
   (`AUTENTIQUE_API_TOKEN`), com `SIGNATURE_PROVIDER=AUTENTIQUE` e `AUTENTIQUE_ENV=sandbox`.
2. **Webhook** — cadastrar `https://api.achouimovel.online/webhooks/signature/autentique` no painel,
   com os quatro eventos acima, e colocar o segredo do endpoint em `AUTENTIQUE_WEBHOOK_SECRET`.
3. **Fluxo** — contrato com partes que têm e-mail (seus) → enviar para assinatura → conferir o
   documento no painel da Autentique (com "mostrar sandbox" ligado na página de chaves) → assinar
   pelos e-mails → conferir o contrato `SIGNED` no produto.
4. **Depois** — trocar para `AUTENTIQUE_ENV=production` só com plano contratado e documentos reais.

## Suposições sinalizadas (não confirmadas ao vivo)

- Onde fica o segredo do webhook: a doc mostra a verificação, mas não a tela; supomos que o painel
  mostra um segredo por endpoint.
- O `public_id` e o `email` de cada assinatura na resposta do `createDocument` (pedidos no
  `signatures { public_id email }`), e a mesma ordem dos signatários enviados.
- O autor (dono da chave) não entra como signatário quando não é enviado — se entrar, a ligação
  pelo e-mail continua certa e a assinatura dele é ignorada.
- No sandbox, o pedido de assinatura sai por e-mail como em produção.
- O tipo do argumento `id` da query `document`: a consulta usa literal (id validado antes), como nos
  exemplos da doc, para não depender do nome do tipo.
