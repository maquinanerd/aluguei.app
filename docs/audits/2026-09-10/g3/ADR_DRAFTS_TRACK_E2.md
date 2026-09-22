# G3 — Rascunhos de ADR da trilha E2 (posse do número do WhatsApp e concessão ativa do portal)

Rascunhos para consolidar em `docs/DECISIONS.md` no fechamento do G3. Evidência em
`docs/audits/2026-09-10/evidence/g3/track-e2/`. A E2 fecha as duas pendências da E1
(`ADR_DRAFTS_TRACK_E.md`, "Pendente para a E2"), ambas na migration 0021.

## Rascunho E2-1 — Prova de posse do número do WhatsApp (P1-18, segunda parte)

Contexto: qualquer organização com `org:manage` reivindicava qualquer `phoneNumberId` com
`POST /whatsapp/connections`, e o webhook entregava as mensagens daquele número à organização que
reivindicou primeiro — inclusive as dos clientes de outra imobiliária. A credencial da Meta era uma
só para a plataforma, então não havia com o que provar a posse. A tela de integrações ainda tinha o
botão "Conectar (teste)", que reivindicava o número fixo `fake-phone-1` sem token.

Decisões:

- **Credencial por conexão.** `POST /whatsapp/connections` exige `accessToken`: o token da conta do
  WhatsApp Business da própria imobiliária (usuário do sistema da WABA). O token é cifrado com o
  mesmo helper e a mesma chave do token da Meta Ads (`encryptSecret`, AES-256-GCM,
  `META_TOKEN_ENCRYPTION_KEY`, formato `keyId:iv:ciphertext` e `token_key_id`, ADR-028). Sem a
  chave, o pedido é recusado (400) — o token nunca é guardado em claro. O token não volta em
  nenhuma resposta nem na auditoria (a auditoria já redige chaves `token`, e o payload nem as
  contém). `phoneNumberId` e `businessAccountId` passam a aceitar só dígitos.
- **Status com CHECK.** `PENDING | VERIFIED | DISABLED` (`whatsapp_connections_status_valid`), com
  `VERIFIED` exigindo `verified_at` e `PENDING` exigindo `claim_expires_at`. O padrão da coluna
  passa a `PENDING`. O `ACTIVE` antigo deixa de existir: a 0021 converte as conexões antigas em
  `PENDING` já vencidas e sem token — elas nunca provaram a posse. A organização informa o token e
  verifica de novo; enquanto isso, o número não recebe mensagens.
- **Só VERIFIED recebe webhook.** O webhook resolve a conexão pelo número e, se o status não passa
  em `canReceiveWhatsAppWebhook` (domínio), ignora com 200 e registra só o número e o status no log
  — nada é enfileirado, nenhum conteúdo é gravado, e nada chega a outra organização. Não há
  dead-letter: guardar a mensagem de um número sem dono comprovado seria justamente reter dado de
  cliente de terceiro.
- **Quem pode reivindicar** (`decideWhatsAppClaim`, domínio): número livre cria a reivindicação
  `PENDING` com prazo de 24 h; a própria organização troca o token (e renova o prazo) enquanto
  pendente ou desativada; número `VERIFIED` responde 409 para todos (a própria dona também, porque
  trocar o token de um número verificado sem nova prova o devolveria a um estado sem prova);
  pendente de outra organização responde 409 no prazo; **vencida, só é tomada por quem provar a
  posse no próprio pedido** — a reivindicação antiga continua até alguém provar. Assim quem só
  reivindica sem token válido bloqueia o número por no máximo 24 h, uma vez.
- **Concorrência.** A decisão roda com a linha do número travada (`SELECT … FOR UPDATE`); duas
  criações simultâneas do mesmo número esbarram no `UNIQUE (phone_number_id)`, e a segunda
  responde 409. Na tomada, a prova (chamada externa) fica fora da transação, e a confirmação trava
  a linha de novo e confere que é a mesma reivindicação, ainda vencida: um único vencedor
  (`whatsapp-claim-concurrency.pg.test.ts`). A tomada apaga a linha antiga e grava uma nova (id
  novo): a organização que perdeu recebe 404 no id antigo.
- **Verificação.** `POST /whatsapp/connections/:id/verify` (`org:manage`, 404 fora da
  organização) decifra o token e chama o `WhatsAppNumberVerifier`: em `live`,
  `MetaWhatsAppNumberVerifier` reusa `MetaWhatsAppAdapter.testConnection()`
  (`GET /<PHONE_NUMBER_ID>`) com o token da conexão — nunca com `WHATSAPP_ACCESS_TOKEN`; em `dry_run`,
  `FakeWhatsAppNumberVerifier` (sem rede) aceita `fake-wa-owner:<phoneNumberId>` e falha com
  qualquer outro como a Graph API (400, código 100). Sem modo, não há verificador e a rota responde
  502 "WhatsApp não configurado". Erro não transitório ou número diferente do pedido → 409 "Não foi
  possível comprovar a posse"; erro transitório (429/5xx, timeout, rede) → 502. A gravação de
  `VERIFIED` é compare-and-set (continua `PENDING`, da organização e com o mesmo token conferido).
  Verificar um número já verificado devolve a conexão sem chamar a Meta.
- **Auditoria** (`entity_type = WHATSAPP_CONNECTION`): `whatsapp.connection_claimed` (com
  `renewed` e `takeover`), `whatsapp.connection_claim_refused` (na organização que tentou, com o
  motivo e sem dado da dona), `whatsapp.connection_claim_expired` (na organização que perdeu a
  reivindicação vencida, sem dizer quem tomou), `whatsapp.connection_verified` e
  `whatsapp.connection_verification_failed` (motivo, status e código da Meta; sem token).
- **Tela** (`/app/admin/integrations`): "Conectar número" (ID do número, ID da conta opcional e
  token em campo de senha), situação "Aguardando verificação" com o prazo ou o aviso de vencida,
  "Verificar posse", "Trocar token" e, verificada, o número exibido pela Meta e "Recebe mensagens
  desde". As regras ficam em `apps/web/src/lib/whatsapp-connection-rules.ts`, comparadas com o
  domínio e com o contrato da API no teste. `GET /whatsapp/connections` informa o verificador
  (`FAKE`, `META` ou null) para a tela mostrar a dica do token FAKE só em ambiente de teste.

Consequências: a homologação (META_MODE=dry_run) verifica com o token FAKE, sem chamada real. As
conexões existentes param de receber mensagens até a organização informar o token e verificar —
aviso necessário no deploy da 0021. O envio continua pela credencial da plataforma
(`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`); enviar pelo token de cada conexão, remover e
desativar conexão pela tela e revalidar o token periodicamente ficam fora desta trilha (ver
"Pendências").

## Rascunho E2-2 — Uma concessão ativa do portal garantida pelo banco (pendência do ADR-061)

Contexto: `portal_access_org_party_kind_active_unique` incluía `revoked_at`, e o PostgreSQL trata
nulos como distintos: o banco aceitava duas concessões ativas da mesma pessoa e tipo. A garantia
era só a trava da rota (`SELECT … FOR UPDATE` na pessoa, ADR-061).

Decisões:

- O índice passa a ser parcial: `UNIQUE (org_id, party_id, kind) WHERE revoked_at IS NULL`. Mesmo
  nome, para as consultas e a documentação que o citam.
- Pré-voo na 0021, no padrão das 0013/0014: se já houver duplicata ativa, a migração para com a
  lista (organização, pessoa, tipo e quantidade) e a dica de revogar a sobra, sem aplicar nada (o
  runner aplica as migrations pendentes numa transação só). A limpeza não é automática: escolher
  qual link continua valendo é decisão da imobiliária.
- A trava da rota continua: ela reaproveita a concessão ativa (troca o token) em vez de gravar
  outra, e o índice é a segunda linha de defesa para qualquer caminho futuro que esqueça a trava.

Consequências: provado em PostgreSQL real (`g3-e2-migration-0021.pg.test.ts`): pré-voo aborta com a
duplicata e conclui depois da revogação; segunda ativa recusada com 23505; duas transações
simultâneas sem a trava da rota confirmam uma só; pedidos simultâneos pela rota deixam uma ativa
por tipo.

## Pendências (fora da E2)

- Envio de mensagens com o token da própria conexão (hoje a plataforma envia com a credencial
  global), revalidação periódica do token e desativação/remoção da conexão pela tela.
- Reverificação obrigatória quando a Meta sinalizar perda de acesso (erro 190/10 no envio).
