# G3 — Rascunhos de ADR da trilha E (portal, vistoria e WhatsApp)

Rascunhos para consolidar em `docs/DECISIONS.md` no fechamento do G3. Evidência em
`docs/audits/2026-09-10/evidence/g3/track-e/`.

A trilha foi dividida em duas entregas. A **E1** (este PR) fecha o que não muda o schema. A **E2**
fica para depois da trilha D, porque precisa de migration e a 0020 é da trilha D: a prova de posse
do número do WhatsApp e o índice parcial de concessão ativa do portal.

## Rascunho E-1 — Portal: extrato, contagem, vistoria visível e pagamento com encargos (P2-05)

Contexto: o extrato do locatário somava a cobrança cancelada em `billedCents`. `GET
/portal/tenant/charges` devolvia em `total` o id de uma cobrança, porque selecionava `charges.id`
como se fosse contagem. As listas de vistoria do portal ignoravam `canPortalReadInspection`, que
já existia no domínio: o locatário e o proprietário viam vistoria intermediária e rascunho. E o
pagamento pelo portal usava o valor de face (`recalculate: false`), sem a multa e os juros do
atraso (achado da trilha C).

Decisões:

- `buildTenantStatement` mantém a cobrança cancelada na lista, para o locatário ver o que
  aconteceu, e a deixa fora dos totais. A cobrança estornada continua em `billedCents` (foi
  cobrada) e fora de `paidCents`.
- `total` da lista de cobranças do locatário é `count(*)` com o mesmo filtro da página.
- `canPortalSeeInspection` (domínio) junta tipo e status: o portal só vê vistoria de entrada ou saída
  já concluída ou assinada. As duas listas de vistoria do portal passam por ela.
- O pagamento pelo portal recalcula multa e juros na data de São Paulo, como o backoffice. O
  caminho idempotente segue devolvendo o QR emitido pelo provider (teste de regressão: a segunda
  tentativa traz o mesmo QR, com o id da cobrança no provider).

Consequências: a tela do portal não muda; os números passam a bater com o que é devido.

## Rascunho E-2 — Evidência de vistoria imutável depois de concluída (P1-24)

Contexto: ambiente, mídia, observação e sugestão de IA continuavam mutáveis depois de COMPLETED, e
apagar mídia não deixava rastro na auditoria.

Decisões:

- `INSPECTION_EVIDENCE_WRITABLE_STATUSES` (DRAFT, CAPTURING, PROCESSING, REVIEW) e
  `assertInspectionEvidenceWritable` no domínio, no mesmo padrão do conteúdo do contrato (ADR-047).
  Ambiente, URL de upload, confirmação de mídia, remoção de mídia, observação e resolução de
  sugestão recusam com 409 depois de COMPLETED ou SIGNED.
- Remover mídia grava `inspection.media_removed` na auditoria (mídia e tipo).
- A tela da vistoria esconde as ações de evidência e explica por quê
  (`apps/web/src/lib/inspection-rules.ts`, comparado com o domínio no teste).

Consequências: a comparação entrada × saída passa a exigir que as observações entrem antes de
concluir cada vistoria (o teste antigo registrava observação depois de COMPLETED). Correção de
vistoria concluída exige uma vistoria nova; não há "reabrir".

## Rascunho E-3 — Handoff do WhatsApp até a equipe devolver (P1-18, primeira parte)

Contexto: o gateway voltava a conversa para ACTIVE a cada mensagem recebida, então o handoff durava
uma mensagem só. Na caixa de entrada, o botão de uma conversa já em atendimento humano chamava o
próprio handoff de novo ("Assumir"), sem efeito, e não havia como devolver a conversa ao bot.

Decisões:

- O gateway não tira a conversa de NEEDS_HUMAN. O UPDATE para ACTIVE filtra `status <>
'NEEDS_HUMAN'`, o que também cobre o handoff pedido pela equipe enquanto a mensagem é processada.
- `POST /conversations/:id/resume` (permissão `conversation:write`) devolve ao atendimento
  automático: só de NEEDS_HUMAN (senão 409), com compare-and-set, evento `HANDOFF_RETURNED` na linha
  do tempo e auditoria `conversation.handoff_returned`. O handoff pedido pela equipe passa a ser
  auditado também.
- Caixa de entrada: "Passar para a equipe" em conversa aberta ou ativa e "Devolver ao atendimento
  automático" em conversa com a equipe (`apps/web/src/lib/conversation-rules.ts`, comparado com
  `canTransitionConversation`).

## Pendente para a E2 (depois da trilha D)

- **Prova de posse do número (P1-18, segunda parte).** Hoje qualquer organização com `org:manage`
  reivindica qualquer `phoneNumberId`, e quem reivindica primeiro recebe o webhook daquele número;
  a credencial da Meta é uma só para a plataforma. Uma prova real exige credencial por conexão (o
  token da conta do WhatsApp Business da própria imobiliária, guardado cifrado como o token da Meta
  Ads, ADR-028) e verificação na Graph API com ela. Proposta: conexão nasce PENDING e não recebe
  webhook; `POST /whatsapp/connections/:id/verify` confere o número com o token da própria conexão
  (FAKE em teste e homologação); reivindicação PENDING vencida pode ser tomada por quem provar a
  posse. Precisa de coluna nova (token cifrado) e CHECK de status: migration depois da 0020.
- **Índice parcial de concessão ativa do portal** (pendência do ADR-061): trocar
  `portal_access_org_party_kind_active_unique` por índice parcial `WHERE revoked_at IS NULL`, com
  pré-voo que aborta diante de duplicata ativa. Pode ir para a E2 ou para a trilha G (P2-12).
