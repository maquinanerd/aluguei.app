# Grupo OLX — G0: estado atual do código (01/10/2026)

Base: `main` em `311c1f1` (PR #62). Leitura de código, sem alteração. Fonte externa: documentação
oficial em `developers.grupozap.com`, baixada em 01/10/2026 (ver `docs/integrations/PORTALS.md`).

Vocabulário: PROVADO, EXISTE_MAS_NÃO_PROVADO, PARCIAL, MOCK_VERIFICADO, AUSENTE, NÃO_DETERMINADO.

## 1. O que existe

| Componente | Situação | Evidência |
|---|---|---|
| Interface de adapter (`validate/publish/update/remove/reconcile/importLeads`), sem transporte fixo | EXISTE, só o `fake` implementa | `packages/integrations/src/channels/types.ts:74` |
| Vocabulário de canais: `fake`, `canalpro`, `vivareal`, `zap`, `olx`, `imovelweb` | EXISTE; quatro entradas para o que é um feed só | `packages/domain/src/channel/publication.ts:3`, CHECKs em `packages/db/src/schema/channels.ts:40,78` |
| Registry: canais reais sem adapter | AUSENTE por decisão (ADR-097): API responde 404 "Canal não configurado" **antes** de gravar qualquer linha | `packages/integrations/src/channels/registry.ts:9-19`, `apps/api/src/routes/channels.ts:83-88,160` |
| Estado por anúncio × canal (`listing_channel_publications`) | EXISTE, semântica de empurrar (PENDING → PUBLISHING → PUBLISHED) | `packages/db/src/schema/channels.ts:19`, transições em `publication.ts:31-40` |
| Fila `channel_sync_jobs` (chave de idempotência única, claim com `SKIP LOCKED`, backoff, 5 tentativas) | EXISTE, MOCK_VERIFICADO com o `fake` | `apps/worker/src/channelJobs.ts:43-71,281-430` |
| Montagem do conteúdo enviado ao canal | PARCIAL: só aluguel, endereço só bairro/cidade/UF do endereço público, sem área, suítes, venda, condomínio, IPTU, legenda e capa | `apps/api/src/routes/channel-jobs.ts:101-166`, `types.ts:13-32` |
| Reenvio quando o imóvel muda (`enqueueUpdatesForProperty`) | EXISTE, só para publicações `PUBLISHED` | `channel-jobs.ts:168-203` |
| Caixa de entrada de webhooks com deduplicação (`webhook_inbox`, único por `provider` + `provider_event_id`) | EXISTE; `org_id` é obrigatório | `packages/db/src/schema/whatsapp.ts:150-173` |
| Processador da caixa de entrada (claim, backoff, DEAD após 3 tentativas) | EXISTE; despacho por `provider` | `apps/worker/src/inboxJobs.ts:184-372` |
| Importação de lead de canal (dedupe da pessoa por e-mail/telefone, consentimento `LEAD_IMPORT`, timeline) | EXISTE, só exercitada pelo `fake` | `apps/worker/src/channelJobs.ts:173-279` |
| Lead do portal próprio (origem `PORTAL_ACHOUIMOVEL`, canal `PORTAL`, interesse no imóvel, auditoria sem PII) | EXISTE (no ar desde a Onda 2B) | `apps/api/src/routes/public-portal.ts:167-235` |
| Token opaco (32 bytes, base64url) + hash SHA-256 | EXISTE, usado por convite e senha | `apps/api/src/email-outbox.ts:63-69` |
| Foto pública | EXISTE: `GET /public/media/:id` responde 302 para URL assinada de 1 h | `apps/api/src/routes/public-search.ts:173-207` |
| Tela Canais | EXISTE com 6 cards fixos e botões "Reconciliar (teste)" e "Importar leads (teste)" que, em produção, terminam em 404 | `apps/web/src/app/app/channels/channels-client.tsx:47,136-155` |
| Diálogo de publicação | EXISTE; lista todos os `CHANNEL_TYPES`, inclusive o canal de teste | `apps/web/src/app/app/listings/dialogo-publicacao.tsx:128-140`, `channels.ts:420-452` |
| Site B2B: Canal Pro, OLX e Imovelweb "Em preparação" | EXISTE, coerente com o código | `apps/portal/src/app/b2b-conteudo.ts:20-34` |

## 2. O que não existe (AUSENTE)

Gerador VRSync; rota pública de feed; token de feed; configuração por imobiliária; modo FEED;
estados de feed; receptor de leads e de relatório do Grupo OLX; destaque por portal; cotas;
suítes no imóvel; e-mail público de contato da imobiliária; URL de foto estável em JPG.

## 3. Lacunas do modelo para o VRSync

| VRSync | Hoje | Evidência |
|---|---|---|
| Título 10–100, sem HTML | 1–200 | `packages/contracts/src/listing.ts:40` |
| Descrição obrigatória 50–3.000 | opcional; o portal mostra `listings.description` | `listing.ts:41`, `public-cards.ts:83` |
| Tipo de imóvel (24 valores) | 8 tipos; `COMMERCIAL` e `LAND` não dizem o subtipo; `TOWNHOUSE` é "Sobrado" | `packages/contracts/src/property.ts:17-26`, `apps/web/src/lib/visao-geral.ts:224` |
| Área útil / área total inteiras | `builtAreaSqm` ("Área construída") e `totalAreaSqm` ("Área total"), `double` | `packages/db/src/schema/properties.ts:35-36`, `property-form.tsx:62-63` |
| Suítes | não existe | — |
| Endereço completo + `displayAddress` | duas linhas: privada (completa) e pública (exibida); lat/lng geocodificados na pública | `apps/api/src/routes/properties.ts:386-456` |
| UF com sigla | `state` guarda a sigla (entra em `citySlug`) | `properties.ts:407-410` |
| Foto: JPG, ≤ 7 MB, ≥ 5, URL = identidade | aceita JPEG, PNG, WebP até 10 MB; `mime_type` fica **nulo** na confirmação (o formato só aparece na extensão da chave) | `apps/api/src/media-rules.ts:6-22`, `packages/contracts/src/media.ts:18-22`, `properties.ts:818-826` |
| `ContactInfo` com nome e e-mail | organização tem nome, documento, telefone e CRECI; sem e-mail | `packages/db/src/schema/identity.ts:31-47` |
| Características (lista fechada) | texto livre até 40 caracteres | `property.ts:207` |

## 4. Riscos encontrados

1. **Limite de requisições compartilhado.** `trustProxy: 'loopback'` (`apps/api/src/app.ts:198`) e
   limite global de 300/min por IP (`app.ts:224-251`). Atrás do Traefik do Coolify, toda chamada
   externa direta chega com o mesmo IP — já registrado em `docs/DEPLOY_COOLIFY.md:146`. O robô do
   Grupo OLX (feed e fotos) e os webhooks precisam de balde próprio, senão disputam o mesmo limite
   com todo o tráfego anônimo.
2. **`API_BASE_URL` não está declarada no serviço `api`** do `docker-compose.prod.yml` (só em web e
   portal). O feed precisa de URL absoluta para as fotos.
3. **`webhook_inbox.org_id` é obrigatório**: a imobiliária do lead tem de ser resolvida na própria
   requisição, antes de gravar.
4. **XSD oficial** (`http://xml.vivareal.com/vrsync.xsd`) respondeu 403 em 01/10/2026.
5. **Documentação de relatório por webhook não diz como identificar o anunciante** nem se vem com
   Basic Auth.

## 5. Dependências que mudam junto

- `tests/integration/src/g2-b2-api.test.ts:203` fixa a lista de `GET /channels`.
- `tests/e2e/src/g2-b2-application-channel-archive.spec.ts:85` espera "OLX (sem integração)".
- `tests/integration/src/dashboard-summary.test.ts:254-256` grava `zap` e `olx` direto no banco:
  os valores antigos precisam continuar válidos no CHECK.
- `tests/integration/src/g3-g-schema-domain.test.ts:90-94`: todo CHECK `_valid` novo entra no mapa.

## 6. Plano de migração do registry

- Novo canal `grupoolx`, modo **FEED**, destinos declarados na conexão (ZAP, Viva Real, OLX).
- `canalpro`, `vivareal` e `zap` ficam no vocabulário (CHECK e domínio) como **substituídos por
  `grupoolx`**: não aparecem mais na tela nem aceitam publicação. Nenhuma linha real pode existir
  para eles (a API recusava antes de gravar), mas linhas antigas continuariam válidas.
- `olx` fica reservado para a API própria da OLX (`developers.olx.com.br`), modo PUSH, sem adapter,
  fora da tela até a pesquisa própria.
- `imovelweb` segue "Em preparação".
- Migration incremental: amplia os CHECKs, nada de editar migration antiga.

## 7. Próximos gates

G1 modelo e configuração → G2 VRSync, feed e fotos → G3 leads → G4 relatório → G5 telas →
G6 documentação e homologação → G7 QA.
