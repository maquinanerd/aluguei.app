# ADRs propostos — Gate G2, trilha A (contratos, crédito, assinatura, vistoria)

> Rascunhos da trilha A. **Não** foram registrados em `docs/DECISIONS.md` (fora do escopo da
> trilha). Numeração provisória `G2A-n`; o número definitivo (ADR-046 em diante) sai na
> consolidação do gate, junto com os ADRs das outras trilhas.

## G2A-1 — Contrato: versões imutáveis e texto congelado no envio (P0-04)

Status: Proposto.

Contexto: a auditoria provou (P0-04) que `POST /contracts/:id/generate` só barrava `GENERATED` e
validava a transição a partir do literal `DRAFT`: um contrato `SIGNED` voltava a `GENERATED` com
conteúdo e hash reescritos, `signed_at` preservado e a locação `ACTIVE` apontando para ele. Não
havia versão anterior do texto.

Decisões:

- O texto só é gerado em `DRAFT` ou, com pedido explícito (`{ "regenerate": true }`), em
  `GENERATED` sem envelope. Em `SENT_FOR_SIGNATURE`, `PARTIALLY_SIGNED`, `SIGNED` e `VOID` a
  resposta é `409` sem nenhuma escrita, com ou sem `regenerate`.
- Cada geração grava uma linha em `contract_versions` (versão, conteúdo, hash SHA-256, template e
  versão do template, autor). `contracts.content`, `content_hash` e `current_version` espelham a
  versão vigente. Repetir `generate` em `GENERATED` é idempotente; regenerar o mesmo texto não cria
  versão.
- O envelope registra a versão enviada (`signature_envelopes.contract_version`).
  `send-for-signature` grava envelope e status numa transação, com trava da linha e
  compare-and-set de versão e hash: se outra requisição regenerou o contrato durante a chamada ao
  provider, nada é gravado (`409`).
- Defesa no banco (migration 0014, gatilhos `BEFORE UPDATE`, `check_violation` 23514): texto,
  hash e versão imutáveis a partir do envio; status não regride (`SIGNED`/`VOID` terminais,
  `SENT_FOR_SIGNATURE` não volta a `DRAFT`/`GENERATED`, `PARTIALLY_SIGNED` não volta);
  `signed_at` imutável em `SIGNED`; linhas de `contract_versions` imutáveis. `UNIQUE (org_id, id)`
  em `contracts` e FK composta de `contract_versions`, no padrão do ADR-045.
- Pré-voo da 0014 aborta com `RAISE EXCEPTION` se já houver contrato corrompido pelo defeito:
  `signed_at` com status fora de `SIGNED`/`VOID`, `contract.generated` depois de
  `contract.sent_for_signature` na auditoria, conteúdo ausente fora de `DRAFT` ou hash que não
  confere com o conteúdo.

Consequências: a UI regera contrato `GENERATED` enviando `regenerate: true`. Cancelar (`VOID`) um
contrato já enviado não cancela o envelope no provider — pendência da Fase 7.3 (Clicksign). A
exclusão física de contrato não existe na API e não foi coberta pelos gatilhos.

Alternativas descartadas: histórico em coluna `jsonb` (sem unicidade nem gatilho por versão);
trava só na API (sem defesa contra escrita direta ou rota futura).

## G2A-2 — Decisão de crédito com origem obrigatória e trilha auditável (P1-06)

Status: Proposto.

Contexto: P1-06 — `SUBMITTED → SCREENING → APPROVED` por `PATCH`, sem screening, sem motivo e com
`decided_by` nulo; o worker decidia sem registrar a origem; `CONTRACTING` nunca era gravado.

Decisões:

- A máquina de estados recebe a origem da transição (`ApplicationTransitionSource`):
  `SUBMITTED → SCREENING` só pelo pedido de screening; `SCREENING → APPROVED | REJECTED |
MANUAL_REVIEW` só pelo resultado do provider, com resultado gravado; `MANUAL_REVIEW → APPROVED |
REJECTED` só por uma pessoa, com motivo, responsável e resultado existente; `APPROVED →
CONTRACTING` só pela criação do contrato; `CONTRACTING → APPROVED` só pelo cancelamento do último
  contrato ativo.
- Nova coluna `rental_applications.decision_source` (`MANUAL` | `AUTOMATIC`). Em `APPROVED`,
  `REJECTED` e `CONTRACTING`, motivo não vazio, `decided_at` e origem são obrigatórios (CHECK na
  migration 0015). `decided_by` fica fora do CHECK porque a FK é `ON DELETE SET NULL`.
- Decisão automática: `decided_by` nulo (não há pessoa), motivo gerado pelo domínio
  (`Decisão automática (<provider>): <decisão> — <regra>: <detalhe>`), auditoria
  `rental_application.decided` com `source: AUTOMATIC` e o id do resultado de screening; resultado,
  decisão, timeline e auditoria numa transação, com a chamada ao provider fora dela.
- API: aprovação ou rejeição sem motivo → `400` (validação do contrato da API); transição fora da
  origem → `409`; destino repetido → `200` sem reescrever a decisão; compare-and-set em toda
  mudança de status. `POST /screening` é idempotente com pedido pendente, recusa (`409`) fora de
  `SUBMITTED` e cria um job de inbox por pedido (antes a chave por candidatura descartava um
  segundo pedido).
- Pré-voo da 0015 aborta se houver candidatura decidida sem motivo, sem data, sem responsável nem
  motivo `auto:` do worker antigo, candidatura em `MANUAL_REVIEW`/`APPROVED`/`REJECTED` sem
  resultado de screening, ou em `SCREENING` sem pedido. Backfill: `decision_source` pela presença
  de `decided_by`; `APPROVED` com contrato não cancelado vira `CONTRACTING`.

Consequências: a UI de crédito precisa oferecer decisão só em `MANUAL_REVIEW`, com motivo digitado
(não fixo), e pedir screening só em `SUBMITTED`; a tela de contratos deixa de listar `CONTRACTING`
como elegível. Candidaturas legadas sem trilha bloqueiam a migration até revisão humana — decisão
deliberada: aprovação de crédito sem análise não é reclassificada como aceitável.

## G2A-3 — Texto do contrato em R$ e trilha de eventos de assinatura (P2-08)

Status: Proposto.

Contexto: P2-08 — o corpo do contrato saía com o aluguel em centavos crus ("ALUGUEL 250000"); o
template era obrigado a usar todas as variáveis oferecidas; `signature_events` nunca era gravada;
`PATCH /contracts/:id/status` gravava `VOID` e respondia `400` (schema de resposta errado).

Decisões:

- A geração oferece um conjunto fixo de variáveis (`CONTRACT_TEMPLATE_VARIABLES`: `tenantName`,
  `landlordName`, `propertyTitle`, `monthlyRent`, `monthlyRentCents`). Valor monetário é formatado
  no domínio (`formatCentsBRL`: centavos inteiros, sem ponto flutuante e sem depender de ICU,
  `R$ 2.500,00`); dado ausente vira `—`, nunca `R$ 0,00`.
- `monthlyRentCents` fica como nome legado e renderiza o mesmo valor em R$: templates aprovados
  são imutáveis (mudar exige nova versão e nova aprovação) e nenhum contrato deve exibir centavos
  crus. Templates novos devem usar `monthlyRent`.
- `renderTemplate` deixa de recusar variável oferecida e não usada; continua recusando
  placeholder sem variável (erro de digitação) e passa a usar `Object.hasOwn`, para que
  `{{constructor}}` não resolva para o protótipo do objeto.
- `POST /webhooks/signature` grava `signature_events` na chegada, na mesma transação do inbox,
  com dedup por `UNIQUE (provider, provider_event_id)`; envelope desconhecido continua ignorado
  (`200`) e sem linha.
- `PATCH /contracts/:id/status` responde `{ contract: agregado }`, no mesmo formato de `generate`.

Consequências: os placeholders ainda não são validados no cadastro/aprovação do template — o erro
aparece só ao gerar (`400`). `occurred_at` do evento é a hora do recebimento: o contrato atual do
webhook não traz a hora do evento no provider.

## G2A-4 — Documento de assinatura em PDF (pdf-lib) e provider real no envelope (P1-11, parte interna)

Status: Proposto.

Contexto: P1-11 — `send-for-signature` mandava `content_hash` como documento e gravava
`provider: 'FAKE'` fixo. O adapter Clicksign v3 só aceita arquivo em base64 e recusava o envio (a
API respondia `500`); e, como o webhook localiza o envelope por `(provider, provider_envelope_id)`,
um evento `CLICKSIGN` nunca casaria com um envelope gravado como `FAKE`.

Decisões:

- Dependência nova: `pdf-lib` 1.17.1 (MIT), versão fixa, em `@aluguei/integrations`. JavaScript
  puro, sem binário nativo nem script de instalação; transitivas `pako` (MIT AND Zlib), `tslib`
  (0BSD), `@pdf-lib/standard-fonts` e `@pdf-lib/upng` (MIT). Sem advisory crítico (gate
  `security:audit --audit-level=critical`).
- `renderContractPdf` (`packages/integrations/src/signature/document.ts`): A4 com cabeçalho
  (contrato e versão), texto quebrado por largura e paginado, rodapé com o SHA-256 do texto; título
  e assunto nos metadados. Determinístico: `updateMetadata: false` (sem datas nem produtor
  automático) e sem identificador aleatório — a mesma versão gera os mesmos bytes.
- Fonte padrão Helvetica (WinAnsi): cobre os acentos do português; caractere fora dela vira `?` em
  vez de derrubar a geração.
- `ISignatureProvider.name` (`CLICKSIGN | D4SIGN | FAKE`): o envelope grava o nome do provider que o
  criou. O documento segue como data URI `application/pdf`; o envelope guarda `document_hash`
  (SHA-256 dos bytes enviados) ao lado de `contract_version`.
- Migration 0016: coluna `document_hash`; pré-voo aborta se houver envelope gravado como `FAKE` com
  id que não é do provider FAKE, ou com provider desconhecido.

Consequências: o PDF enviado não é armazenado — é reproduzível byte a byte a partir de
`contract_versions` enquanto o renderizador (layout e versão da `pdf-lib`) não mudar; mudar um dos
dois exige antes armazenar o documento enviado (Storage, Fase 7.1) ou versionar o renderizador. O
arquivo assinado devolvido pelo provider fica para a Fase 7.3, assim como HMAC do webhook e URL
base de produção da Clicksign. Nome com caractere fora do WinAnsi sai com `?`; embutir fonte TTF
(fontkit) foi adiado por peso e por falta de caso real.

Alternativas descartadas: `pdfkit` (mais pesado, depende de fontkit e streams), Chromium/Puppeteer
(binário nativo), armazenar só o hash sem gerar documento (o provider exige o arquivo).
