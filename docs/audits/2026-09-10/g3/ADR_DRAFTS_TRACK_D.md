# G3 — Rascunhos de ADR da trilha D (cadastros e identidade)

> **Consolidado** em `docs/DECISIONS.md` como ADR-080 a ADR-087 no fechamento do G3 (2026-09-22). Este arquivo fica como registro do rascunho.

Rascunhos para consolidar em `docs/DECISIONS.md` no fechamento do G3, depois dos da trilha C.
Evidência em `docs/audits/2026-09-10/evidence/g3/track-d/`.

## Rascunho D-1 — CPF e CNPJ com dígito verificador (P2-01)

Contexto: `POST /parties` só normalizava o documento (dígitos) e aceitava `12345678900` como CPF. O
dígito verificador não era conferido em lugar nenhum.

Decisões:

- `packages/domain/src/values/documents.ts`: CPF e CNPJ pelo módulo 11, recusando sequência de
  dígitos iguais (`11111111111` passa no módulo 11 e não é CPF). `assertValidIdentityValue` valida
  cada tipo de identidade — CPF, CNPJ, e-mail com domínio, telefone com DDD (10 a 13 dígitos) e
  passaporte alfanumérico — com `INVALID_INPUT` (400).
- A validação vale na criação e na edição da pessoa. A deduplicação (`POST /parties/dedupe`)
  continua aceitando valor mal formado: ela procura, não cadastra.
- A tela confere antes de enviar (`apps/web/src/lib/party-rules.ts`), comparada com o domínio em
  milhares de números gerados; o servidor continua sendo a regra.
- Três testes antigos cadastravam CPF inválido e passaram a usar CPFs válidos (só o dado mudou).

Consequências: pessoas já gravadas com documento inválido não são corrigidas pela migration; a
primeira edição da pessoa exige documento válido. O documento da imobiliária no cadastro aberto
(`POST /auth/register`) continua só com o tamanho: fica fora da trilha D.

## Rascunho D-2 — Detalhe, edição, arquivamento e documentos da pessoa (P2-01)

Contexto: não existia `GET /parties/:id` nem edição, e a tabela `party_documents` não tinha rota.

Decisões:

- `GET /parties/:id` traz identidades, endereços, papéis, consentimentos e documentos; pessoa de
  outra organização responde o mesmo 404 da inexistente (ADR-044).
- `PATCH /parties/:id` com trava de linha. Nome, tipo e status mudam campo a campo; identidades,
  papéis e endereços chegam como lista completa e substituem as atuais. Identidade que já é de outra
  pessoa da organização responde 409 (antes a UNIQUE viraria 500).
- Não há exclusão: a pessoa é arquivada (`status` `ACTIVE` | `ARCHIVED`, com CHECK). A lista mostra
  só as ativas; `?status=ARCHIVED` mostra as arquivadas; `?ids=` resolve qualquer uma (linhas
  antigas continuam com o nome).
- Auditoria com diff (`party.updated`, `party.archived`, `party.reactivated`). Das identidades o
  diff guarda só os tipos, nunca o valor do documento ou do telefone.
- Documentos: `POST /parties/:id/documents/upload-url` (chave gerada no servidor com o prefixo da
  organização e da pessoa, até 20 MB), `…/confirm` (confere o objeto no storage e o tamanho real,
  idempotente pela chave única), `GET …/documents` e `DELETE …/documents/:documentId`. Tipos
  fechados com CHECK: identidade, CPF, comprovante de renda, comprovante de endereço, estado civil,
  contrato social e outro.
- Interface: detalhe em `/app/crm/contacts/[id]` com dados, documentos e consentimentos; edição
  (nome, tipo, papéis, identificadores e endereços), arquivar e reativar com confirmação.

Consequências: excluir um documento apaga o registro, não o objeto no storage (limpeza de órfãos é o
P2-13). Sem bucket configurado, o envio mostra o erro da API ("Storage não configurado").

## Rascunho D-3 — Ciclo de vida da visita (P2-02)

Contexto: a visita nascia `SCHEDULED` e nunca mudava.

Decisões:

- Máquina de estado em `packages/domain/src/crm/visit.ts`: agendada → confirmada, realizada, não
  compareceu ou cancelada; confirmada → realizada, não compareceu, cancelada ou agendada de novo
  (reagendar tira a confirmação). Cancelar exige motivo. Status final não volta.
- `PATCH /visits/:id/status` e `POST /visits/:id/reschedule` (nova data e hora; volta para
  agendada), com trava de linha, compare-and-set no status, evento na timeline e auditoria com diff.
  `GET /visits/:id`. A criação só aceita agendada ou confirmada.
- Banco: CHECK do status e CHECK de que cancelada tem motivo (`cancel_reason`); `status_changed_at`.
- Interface: ações no detalhe da visita conforme o status, reagendamento e cancelamento em diálogo
  (motivo obrigatório).

## Rascunho D-4 — Ciclo de vida e expiração da proposta (P2-02)

Contexto: a proposta nascia `DRAFT` e nunca saía dali; `valid_until` era instante e não tinha efeito.
O formulário mandava a data do campo como instante UTC.

Decisões:

- `valid_until` passa a ser data civil (o último dia em que a proposta vale). A migration 0020 foi
  editada à mão para converter no fuso de São Paulo (`USING (valid_until AT TIME ZONE
'America/Sao_Paulo')::date`); sem isso a conversão usaria o fuso da sessão. A API aceita só
  `AAAA-MM-DD` que existe (`isoDateSchema`).
- Máquina de estado em `packages/domain/src/crm/proposal.ts`: rascunho → enviada (exige validade);
  enviada → aceita, recusada (exige motivo) ou expirada. Só o rascunho é editável (valor, condições
  e validade). O envio recusa validade anterior a hoje (data de São Paulo).
- `PATCH /proposals/:id`, `PATCH /proposals/:id/status` e `GET /proposals/:id`, com trava de linha,
  compare-and-set, timeline e auditoria com diff. `sent_at`, `decided_at` e `decision_reason`.
- Banco: CHECK do status, de que enviada tem validade e de que recusada tem motivo.
- Worker: job diário `PROPOSAL_EXPIRY` por organização (mesma fila dos jobs de cobrança). Proposta
  enviada com a validade anterior a hoje em São Paulo vira `EXPIRED` por compare-and-set (uma
  aceitação no mesmo instante vence), com timeline e `proposal.expired` na auditoria.
- Interface: validade como data civil no formulário e na exibição; editar no rascunho, enviar com a
  validade, aceitar e recusar com motivo no detalhe.

Consequências: expirar é só do worker; a tela não oferece "expirar". Aceitar a proposta não cria
candidatura nem locação — continua sendo passo manual.

## Rascunho D-5 — Detalhe e edição do lead (P2-03)

Contexto: não existia `GET /leads/:id`; a tela do lead buscava a lista inteira e filtrava. Não havia
edição de dados nem de responsável.

Decisões:

- `GET /leads/:id` com os imóveis de interesse; `PATCH /leads/:id` para origem, canal, responsável,
  orçamento, observações, pessoa e imóveis de interesse (lista completa). O status continua só em
  `PATCH /leads/:id/status`, pelo funil do domínio (`status` no corpo do PATCH → 400).
- O responsável precisa ser membro da organização (404 uniforme). Orçamento mínimo acima do máximo →
  400, considerando o valor já gravado quando só um limite chega; `null` limpa o limite.
- Auditoria com diff; das observações o diff guarda só o tamanho.
- `GET /me/members`: nome e função da equipe da organização ativa, sem e-mail, para qualquer membro
  (o corretor edita lead e não tem `member:read`). Usa o `meMembersResponseSchema` que já existia.
- Interface: o detalhe usa a rota própria; "Editar lead" com responsável, canal, fonte, orçamento e
  observações.

## Rascunho D-6 — Troca e recuperação de senha (P2-04)

Decisões:

- `POST /auth/change-password`: exige a senha atual (401 se errada), recusa a igual à atual e
  encerra as outras sessões do usuário — a sessão que trocou continua.
- `POST /auth/forgot-password`: resposta única com ou sem conta (sem enumeração). Token opaco de
  32 bytes; o banco guarda só o SHA-256 (`password_reset_tokens`), validade de 30 minutos, e um
  pedido novo invalida os anteriores.
- `POST /auth/reset-password`: uso único com trava na linha do token (`FOR UPDATE`) — provado em
  PostgreSQL real: um segundo uso em paralelo espera e recebe 404. Encerra todas as sessões.
- Token vencido, usado, revogado ou inexistente: o mesmo 404. O token nunca entra na auditoria.
- Interface: "Trocar senha" em Configurações; "Esqueci minha senha" no login leva a
  `/esqueci-senha`, e o link leva a `/redefinir-senha`.

## Rascunho D-7 — Convite de membro por e-mail e caixa de saída local (P2-04)

Contexto: `POST /organizations/:orgId/members` exigia o `userId` de quem já tinha conta. Não há
provider de e-mail no produto, e nenhuma trilha do G3 pode ter efeito externo.

Decisões:

- `POST /organizations/:orgId/invites` (`member:manage`): e-mail normalizado, função, token opaco
  com hash e validade de 72 horas. Quem já é membro ou já tem convite pendente → 409. O limite de
  usuários do plano é conferido no convite e de novo no aceite.
- `GET …/invites` (situação derivada: pendente, aceito, revogado, expirado) e `DELETE
…/invites/:inviteId` (revoga).
- `POST /invites/describe` e `POST /invites/accept` sem sessão, com o token no corpo (não na URL da
  API). Sem conta, o aceite cria o usuário com o nome e a senha que a própria pessoa escolhe e abre
  a sessão; com conta, só acrescenta o vínculo — a senha existente não muda e nenhuma sessão é
  aberta. Aceitar é usar o token (`accepted_at`); o reuso responde 404. Trava na linha do convite,
  provada em PostgreSQL real (sem ela o segundo aceite criava outra conta).
- Caixa de saída local `email_outbox` (tipo e status com CHECK): a recuperação de senha e o convite
  **gravam a mensagem e não enviam nada**. `GET /email-outbox` exige `org:manage` e só mostra a
  própria organização; a mensagem de senha nasce sem organização e não aparece para ninguém da
  imobiliária. `GET /dev/email-outbox?to=` existe só fora de produção (como `/dev/fake-payments`)
  para o E2E abrir o link.
- Interface: "Convidar membro" por e-mail e função, lista de convites com revogação, "Caixa de
  saída" (avisa que nenhum e-mail é enviado) e a tela `/convite`.

Consequências: sem provider de e-mail, em produção a pessoa convidada ou que esqueceu a senha não
recebe nada — o link só existe na caixa de saída. Enviar de verdade exige escolher um provider e uma
credencial (decisão de produto, fora do G3). O convite pendente não conta no limite do plano até
ser aceito.

## Rascunho D-8 — Ordem das camadas do design system

Contexto: o drawer (140) ficava por cima do modal (130), e o modal por cima do toast (120). Um
diálogo aberto a partir do detalhe em drawer (cancelar visita, recusar proposta) ficava escondido.

Decisão: `--peg-z-drawer: 130`, `--peg-z-modal: 140`, `--peg-z-toast: 150` — a mesma ordem do design
system de referência (Kal El: drawer, modal, toast). Teste em `packages/ui/src/styles/z-order.test.ts`.
