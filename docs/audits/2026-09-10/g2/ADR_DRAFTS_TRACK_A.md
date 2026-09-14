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
