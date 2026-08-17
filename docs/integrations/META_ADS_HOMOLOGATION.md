# Meta Marketing API (Meta Ads) — Homologação

Status: **IMPLEMENTED_NOT_LIVE_VERIFIED**

> O adapter `MetaGraphAdsProvider` (`packages/integrations/src/meta-ads/graph.ts`) está
> implementado e testado com fetch mock, mas **nenhuma chamada real foi feita** (sem
> app/ad account/token de homologação). Nada abaixo foi validado contra o ambiente live —
> o que foi confirmado vem exclusivamente da documentação oficial consultada (abaixo).
> O pipeline (API/MCP/worker/intents/Housing/budget caps) continua usando
> `FakeMetaAdsProvider` em dry-run e NÃO foi alterado.

## Documentação consultada (17/08/2026)

O site de docs da Meta bloqueia fetch automatizado direto (`HTTP 400` para
`developers.facebook.com/docs/marketing-api/*` e variações). O conteúdo foi consultado
via **Wayback Machine** em snapshots de 09/05/2026 a 15/07/2026. A doc foi **migrada** de
`/docs/marketing-api/*` para `/documentation/ads-commerce/marketing-api/*`
(301 observado no snapshot de 15/07/2026).

| Fonte                                            | URL (canônico)                                                                                         | O que confirmou                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing API Overview / Versioning (2026-05-10) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/versioning           | Versão vigente da Marketing API: **v25.0**; chamadas devem ser versionadas (`https://graph.facebook.com/v25.0/...`); sem versão a chamada falha                                                                                                                                                                                  |
| Ad Account, Campaigns (2025-11-27)               | https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/                     | `POST /act_{id}/campaigns`: name, objective, status (só ACTIVE/PAUSED na criação), `special_ad_categories`, daily/lifetime_budget, start_time/stop_time, spend_cap                                                                                                                                                               |
| Ad Set (2025-11-15)                              | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/                              | `POST /act_{id}/adsets`: campaign_id, targeting, optimization_goal, billing_event, bid_amount, daily/lifetime_budget, status PAUSED, promoted_object{page_id}, start_time/end_time; **orçamento OU na campanha OU no ad set**                                                                                                    |
| Ad Creative (2025-12-02)                         | https://developers.facebook.com/docs/marketing-api/reference/ad-creative/                              | `POST /act_{id}/adcreatives`: name, `object_story_spec{page_id, link_data{link, message, image_hash, call_to_action}}`; **conteúdo IMUTÁVEL** (update só name/status/adlabels); código 270 (development access)                                                                                                                  |
| Ad Account Ad Creatives (2026-01-14)             | https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives/                   | Edge de criação; parâmetros do creative (object_story_spec, image_hash, image_url, call_to_action, degrees_of_freedom_spec)                                                                                                                                                                                                      |
| Ad Account Ads (2025-12-02)                      | https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads/                           | `POST /act_{id}/ads`: adset_id, `creative{"creative_id":...}` (obrigatório), status (só ACTIVE/PAUSED na criação; **PAUSED recomendado em testes**); PENDING_REVIEW antes de ACTIVE                                                                                                                                              |
| Ad Account, Insights (2025-12-02)                | https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/                      | `GET /{id}/insights`: fields (spend, impressions, reach, clicks, ctr, cpc, cpm, frequency, inline_link_clicks, actions, cost_per_action_type), `time_range{since,until}`; valores numéricos como **strings**; máx. 37 meses; spend em unidade menor da moeda (centavos)                                                          |
| Special Ad Categories (2026-05-21/2026-06-16)    | https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/special-ad-category | Toda criação de campanha exige `special_ad_categories` (HOUSING p/ imóveis); com categoria selecionada deve-se enviar `special_ad_category_country` (default: país fiscal); restrições Housing (idade 18–65+, sem gênero, sem custom/lookalike audiences, geo mínimo 15 mi/25 km EUA-Canadá / 15 km Europa); `tune_for_category` |
| Marketing API Authentication (2025-11-15)        | https://developers.facebook.com/docs/marketing-api/authentication/                                     | App tipo **Enterprise (Business)**; níveis Standard (auto, rate limit pesado — dev) e Advanced (App Review, ≥1.500 chamadas/30d e <10% erro); scopes `ads_read`/`ads_management`; feature "Ads Management Standard Access"; verificação do negócio                                                                               |
| Access Tokens (Facebook Login) (2025-11-15)      | https://developers.facebook.com/docs/facebook-login/access-tokens/                                     | Tokens: user curto ~1–2 h; longo ~60 dias; **system user token** sem expiração por tempo (válido para Marketing API com acesso Standard)                                                                                                                                                                                         |
| Real Estate Ads (2026-05-19)                     | https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/get-started   | Guia de imóveis (catalog/Advantage+); negócio verificado obrigatório; reforça contexto Housing                                                                                                                                                                                                                                   |

## Versão da API

- **Marketing API / Graph API vigente: `v25.0`** (doc Versioning em 10/05/2026:
  "The current version of the Marketing API is v25.0"). Ciclo de depreciação ~90 dias;
  auto-upgrade de versão para endpoints não afetados; chamadas sem versão **falham**.
- O adapter usa default `v25.0` (`META_GRAPH_API_VERSION`), configurável por opção
  `apiVersion`. Revisar no changelog antes de upgrades futuros:
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog

## Endpoint base

`https://graph.facebook.com/v25.0/` — todas as chamadas são versionadas.

| Operação                | Endpoint                                                                                                      | Uso no adapter                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Testar conexão          | `GET /me/adaccounts` e `GET /act_{id}`                                                                        | `testConnection`                                                                  |
| Listar ativos           | `GET /me/adaccounts`, `/me/accounts`, `/me/accounts?fields=instagram_business_account{...}`, `/me/businesses` | `listAssets`                                                                      |
| Criar campanha          | `POST /act_{id}/campaigns`                                                                                    | `createCampaign`                                                                  |
| Criar ad set            | `POST /act_{id}/adsets`                                                                                       | `createAdSet`                                                                     |
| Criar creative          | `POST /act_{id}/adcreatives`                                                                                  | `createCreative`                                                                  |
| Criar anúncio           | `POST /act_{id}/ads`                                                                                          | `createAd`                                                                        |
| Status/agenda/orçamento | `POST /{campaign_id}`                                                                                         | `setCampaignStatus`, `updateCampaignBudget`, `updateSchedule`, `archiveCampaign`  |
| Insights                | `GET /{campaign_id}/insights`                                                                                 | `getInsights`                                                                     |
| Upload de imagem        | `POST /act_{id}/adimages`                                                                                     | **não usado ainda** — necessário no pipeline p/ mapear mídia local → `image_hash` |

Encode: o adapter envia `application/x-www-form-urlencoded` com `Authorization: Bearer <token>`
(tokens nunca vão em URL/corpo/logs).

## Autenticação

- **System user access token** (Business Manager > System users) — para servidor-a-servidor,
  com duração **sem expiração por tempo** quando o app tem acesso Standard à Marketing API
  (confirmado na doc de Access Tokens; ainda sujeito a invalidação por outros motivos).
  Validação: https://developers.facebook.com/tools/debug/accesstoken
- Token de usuário curto: ~1–2 h; longo: ~60 dias (não usar em produção).
- Token inválido/expirado → código **190** (adapter lança `MetaAdsProviderError` `INVALID_TOKEN`).
- App com acesso **Standard** (padrão, sem App Review) funciona para a própria conta
  publicitária, mas com **rate limit pesado** (dev). Para operar contas de clientes é
  necessário **Advanced access** (App Review + ≥1.500 chamadas/30d + <10% de erro).

## Scopes / permissões

- `ads_management` — ler e gerenciar campanhas/adsets/creatives/ads (obrigatório).
- `ads_read` — ler relatórios/insights (obrigatório para `getInsights`).
- `pages_show_list` (+ `pages_read_engagement`) — listar Pages (`listAssets`).
- `instagram_basic` — listar Instagram business accounts vinculadas (`listAssets`).
- `business_management` — listar businesses (`listAssets`).
- Feature: **Ads Management Standard Access** (necessária mesmo para acesso Standard).

O adapter só exige `ads_read`+`ads_management` para operar; os demais scopes são usados
apenas nos edges de `listAssets` e falhas de permissão nesses edges são ignoradas
(continuam os ativos acessíveis).

## Housing / Special Ad Category (obrigatório)

- **Toda criação de campanha exige `special_ad_categories`** (doc Special Ad Categories).
  Para imóveis: **`["HOUSING"]`**. O domínio já força isso
  (`requiredSpecialAdCategories()` em `packages/domain/src/meta/housing.ts`) e o pipeline
  persiste `special_ad_categories` no AdProfile; o adapter envia o valor recebido e
  **rejeita array vazio** (defensivo).
- Com categoria selecionada, recomenda-se `special_ad_category_country` (ex.: `["BR"]`).
  Para HOUSING, se omitido a Meta usa o **país fiscal** da conta. O adapter aceita
  `specialAdCategoryCountries` na opção (o pipeline ainda não envia — sem ajuste o default
  da Meta se aplica).
- Restrições de targeting Housing confirmadas: idade fixa 18–65+, **sem gênero**, **sem
  custom/lookalike audiences**, sem exclusão de local, raio mínimo 15 mi/25 km (EUA/Canadá)
  ou 15 km (Europa), interesses apenas de lista aprovada. O domínio já valida o targeting
  (`validateHousingTargeting`) **antes** de qualquer envio; o adapter apenas executa a API.
- **Status**: criação sempre `PAUSED` — **NUNCA ACTIVE direto** (docs: só ACTIVE/PAUSED na
  criação; produto: ativação só por intent de runtime — ADR-029).

## Webhooks Meta

A rota `POST/GET /webhooks/meta` da API já está implementada (ADR-027: `webhook_inbox`
com dedup por UNIQUE provider_event_id, resposta 200 imediata, retry/reaper).

- **Verify (GET)**: `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` → retorna o challenge.
- **Formato (POST)**: `object=page|ad_account`, `entry[].changes[]` com `field` (ex.:
  `campaign`, `adset`, `ad`, `ad_account`), `value.{id, effective_status, ...}` e
  `time` (epoch) + `change_time`. A Meta também entrega eventos `ads`/`ad_insights`.
- **Assinatura (POST)**: header `X-Hub-Signature-256: sha256=<HMAC-SHA256 do raw body com
o app secret>` — **já implementado na API** quando `META_APP_SECRET` presente
  (mesmo mecanismo do webhook WhatsApp; obrigatório em produção).
- **App secret**: obrigatório para validar a assinatura; sem ele, a segurança fica só no
  verify token (gap registrado em `docs/audit/INTEGRATION_READINESS_MATRIX.md`).
- Detalhe de assinatura: a Meta usa o **raw body** para o HMAC; o handler precisa consumir
  o body como buffer antes de qualquer parse (mesmo padrão já usado no webhook WhatsApp).

## Rate limits

Códigos documentados nas páginas de referência (erros retornados com `error.code`):

| Código | Significado                                                                     | Tratamento no adapter    |
| ------ | ------------------------------------------------------------------------------- | ------------------------ |
| 4      | API call rate limit (Graph API)                                                 | `RATE_LIMIT` (retryable) |
| 17     | User request limit (Graph API)                                                  | `RATE_LIMIT` (retryable) |
| 32     | Page request limit (Graph API)                                                  | `RATE_LIMIT` (retryable) |
| 613    | "Calls to this api have exceeded the rate limit"                                | `RATE_LIMIT` (retryable) |
| 80004  | "There have been too many calls to this ad-account" (rate limit por ad account) | `RATE_LIMIT` (retryable) |
| 429    | HTTP Too Many Requests                                                          | `RATE_LIMIT` (retryable) |
| 5xx    | Erro de servidor (500/502/503/504)                                              | `PROVIDER` (retryable)   |

- O adapter faz **retry classificado** (até `maxRetries`=2) com backoff exponencial simples
  (base 250 ms) e respeita o header `Retry-After` quando presente; **4xx não-retryable
  falha imediato**.
- Acesso Standard (sem App Review) tem **throttling severo** — esperado durante
  homologação; solicitar Advanced access para operação de contas de clientes.
- A doc de rate limiting (overview/rate-limiting) não pôde ser lida na sessão (snapshot
  indisponível); os códigos acima vieram das páginas de referência. Confirmar a política
  de "utilization >100%" na homologação.

## Sandbox / dev-test

- `META_MODE=dry_run` → `FakeMetaAdsProvider` determinístico (dev/CI/PGlite). Nenhuma
  chamada real é feita; o adapter Graph só é instanciável com token e está **fora** do
  registry até a homologação (registry inalterado — `live` sem credencial continua `null`).
- Meta não oferece "sandbox" da Marketing API: a prática documentada é usar **test ad
  account** (criado no Business Manager/Ads Manager com moeda de teste) e **status PAUSED**
  para não gerar gasto (docs recomendam PAUSED durante testes).
- `execution_options=[validate_only]` (documentado nos endpoints de criação) valida o
  payload **sem criar** — útil na homologação antes de criar a primeira campanha
  (o adapter ainda não expõe essa opção; follow-up).

## Idempotency

- A Marketing API **não tem idempotency key nativa** documentada para criação de campanha/
  adset/creative/ad. A proteção contra duplicação fica no produto:
  - `meta_sync_jobs` + `meta_campaign_links` com `UNIQUE (ad_profile_id)` (reuso de
    campanha já criada — `meta_create_prepared_campaign_paused` retorna `reused: true`);
  - AdCreatives: a própria API **deduplica** criativos idênticos (retorna o id do existente
    — docs Ad Creative: "If you try to add a creative that isn't unique... return the
    creative ID of the existing ad creative"), o que reduz risco de duplicar ao retryar.
- Retry de criação: manter a estratégia atual (idempotency key no MCP + reuso por
  `UNIQUE`), sem confiar em duplicação do lado da Meta.

## Erros relevantes (referências oficiais)

| Código                | Significado                                              | Tratamento no adapter           |
| --------------------- | -------------------------------------------------------- | ------------------------------- |
| 190                   | Invalid OAuth 2.0 Access Token (token inválido/expirado) | `INVALID_TOKEN` (não retryable) |
| 200                   | Permissions error (falta scope)                          | `PERMISSION_DENIED`             |
| 270                   | Request not allowed for apps with development access     | `DEVELOPMENT_ACCESS`            |
| 100                   | Invalid parameter                                        | `BAD_REQUEST` (não retryable)   |
| 194                   | Missing at least one required parameter                  | `BAD_REQUEST`                   |
| 105                   | Too many parameters                                      | `BAD_REQUEST`                   |
| 368                   | Action deemed abusive/disallowed                         | `BAD_REQUEST`                   |
| 2635                  | Deprecated API version                                   | `BAD_REQUEST` (revisar versão)  |
| 3018                  | Time range além de 37 meses                              | `BAD_REQUEST` (validar range)   |
| 613/80004/4/17/32/429 | Rate limit (ver seção acima)                             | `RATE_LIMIT` (retryable)        |

Estrutura de erro da Graph API (adapter parseia): `error.{message, type, code, error_subcode, error_user_msg, fbtrace_id}`.

## Ajustes que o pipeline exige antes do live (relatados, NÃO alterados)

1. **Orçamento: campanha OU ad set (nunca ambos)** — a doc é explícita ("You can either set
   budget at the campaign level or at the adset level, not both"). O pipeline
   (`meta_create_prepared_campaign_paused`/rota API) envia `dailyBudgetCents` para a
   campanha **e** `budgetCents` (mesmo valor) para o ad set. O adapter normaliza: ad set só
   recebe budget quando a campanha não tem (via mapa interno `campaignBudgetKinds`). Decidir
   o modelo do produto (CBO na campanha vs budget no ad set) e simplificar o fluxo.
2. **Mídia local → `image_hash` da Meta** — `mediaRefs` do pipeline são IDs locais
   (`property_media`) e `mediaHash` é um digest local; **não** são `image_hash` da Meta.
   O adapter exige `resolveImageHash` (opção) e falha com `MISSING_IMAGE_HASH` sem ele.
   O pipeline precisa subir as imagens públicas (POST `/act_{id}/adimages`, suporta
   `image_url`/bytes) e mapear mediaRef → hash antes de `createCreative`.
3. **`page_id` no creative** — `object_story_spec` exige `page_id`. O pipeline tem
   `page_asset_id` no AdProfile mas não repassa ao provider; o adapter usa a opção
   `defaultPageId` e falha com `MISSING_PAGE_ID` sem ela.
4. **`updateCreative` é impossível na Graph API** — conteúdo do AdCreative é imutável
   (update aceita só name/status/adlabels). O adapter lança `CREATIVE_IMMUTABLE`. O job
   `UPDATE_CREATIVE` (worker) precisa: criar novo creative → atualizar
   `meta_creative_links.providerCreativeId` → re-apontar o anúncio
   (`POST /{ad_id}` com `creative={creative_id: novo}`).
5. **Formato de `geos`** — o pipeline envia `targeting.geos` como registros livres; o
   adapter traduz `{countries}`, `{country}`, `{key, type:'country'}` e `{geo_locations}`
   para `geo_locations` (suposição marcada — confirmar com exemplos reais na homologação).
6. **`optimization_goal`/`billing_event` do ad set** — o pipeline não informa o objetivo ao
   `createAdSet`; o adapter usa default `LINK_CLICKS`/`LINK_CLICKS` (alinhado a
   `OUTCOME_TRAFFIC`, o objetivo usado hoje). Para `OUTCOME_LEADS`/`OUTCOME_ENGAGEMENT`
   será preciso repassar o objetivo ou configurar as opções.
7. **Carousel vs imagem única** — o adapter cria link ad com a **primeira** imagem
   (MVP). Múltiplas imagens exigem `link_data.child_attachments` (documentado) — decisão
   de produto e ajuste no pipeline.
8. **`special_ad_category_country`** — o pipeline não envia; sem ajuste a Meta usa o país
   fiscal (aceitável para HOUSING, mas considerar explicitar `["BR"]`).
9. **Registry não ativado** — `getMetaAdsProvider` continua retornando `null` em live
   (rotas respondem "Meta Ads não configurado"). Ativar exige: decriptar o token da
   conexão (AES-256-GCM, ADR-028), montar `MetaGraphAdsProvider` com `adAccountId` do
   ativo escolhido e os resolvers acima, e só então trocar o registry.

## Implementado hoje (adapter)

- `packages/integrations/src/meta-ads/graph.ts` (`MetaGraphAdsProvider`):
  - `testConnection` (`GET /me/adaccounts` + `GET /act_{id}`), `listAssets` (4 edges).
  - `createCampaign` com `special_ad_categories` (HOUSING), `status=PAUSED` fixo, budgets
    em centavos, schedule; defesa contra array vazio e XOR de budget.
  - `createAdSet` com `targeting` traduzido para `geo_locations`, `promoted_object.page_id`
    (quando `defaultPageId`), budget só se a campanha não tem.
  - `createCreative` com `object_story_spec` (page_id, link, message, image_hash, CTA).
  - `createAd` com `creative_id` e `status=PAUSED`.
  - `setCampaignStatus`, `updateCampaignBudget`, `updateSchedule`, `archiveCampaign`
    (status `ARCHIVED`).
  - `updateCreative` → erro tipado `CREATIVE_IMMUTABLE` (comportamento real documentado).
  - `getInsights` com mapping para centavos (`spendCents`, `cpcCents`, `cpmCents`,
    `costPerLeadCents`), `leads` de `actions[].lead`, métricas de string→número.
  - Erros tipados `MetaAdsProviderError` (`RATE_LIMIT`, `INVALID_TOKEN`,
    `PERMISSION_DENIED`, `DEVELOPMENT_ACCESS`, `BAD_REQUEST`, `TIMEOUT`, `NETWORK`,
    `PROVIDER`, `CREATIVE_IMMUTABLE`, `MISSING_IMAGE_HASH`, `MISSING_PAGE_ID`), timeout
    via AbortSignal, retry classificado com backoff e `Retry-After`, zod em todas as
    respostas, token nunca em logs/URLs.
- `packages/integrations/src/meta-ads/graph.test.ts` — 23 testes com fetch mock
  (testConnection ok/auth-fail, campaign HOUSING+PAUSED, adset/creative/ad, status,
  insights centavos, 429/5xx retryable, 4xx não, 190 tipado, timeout, creative imutável,
  listAssets, budget de ad set condicionado).
- `FakeMetaAdsProvider` e `meta-ads.test.ts` **inalterados** (32 testes verdes na pasta).

## O que falta para homologar (credenciais/contas)

1. **Meta for Developers app** do tipo **Enterprise (Business)** com produto Marketing API.
2. **Ad account real (ou test ad account)** com moeda e timezone definidos.
3. **Page do Facebook** vinculada (page_id para o creative) e Instagram business account
   (opcional para placements).
4. **System user access token** (sem expiração por tempo) com `ads_management` +
   `ads_read` (+ `pages_show_list`/`instagram_basic`/`business_management` se usar
   `listAssets` completo); validar no Token Debugger.
5. **Acesso Advanced** via App Review caso a operação gerencie contas de terceiros
   (acesso Standard é suficiente para a própria conta, com throttling severo).
6. **Verificação do negócio** (Business verification) — exigida para produtos sensíveis/
   commerce; confirmar necessidade para o uso de Ads neste produto.
7. **`META_APP_SECRET`** e **`META_WEBHOOK_VERIFY_TOKEN`** para o webhook `/webhooks/meta`
   (assinatura X-Hub-Signature-256 já implementada na API).
8. **Pipeline**: resolver os 9 ajustes listados acima (upload de imagens e mapeamento
   mediaRef→hash, page_id, update de creative, geos, objetivo/CTA, carousel, país SAC).
9. Homologar com `execution_options=[validate_only]` primeiro, depois criar campanha
   **PAUSED** de teste, conferir insights e somente então ativar uma campanha real com
   intenção explícita (nunca simular sucesso). Registrar evidência (IDs, prints, valores)
   e reclassificar para `LIVE_VERIFIED` em `docs/EXECUTION_STATE.md` e `docs/BLOCKERS.md`.

## Classificação

**IMPLEMENTED_NOT_LIVE_VERIFIED** — código pronto e testado contra a documentação oficial
vigente (v25.0); sem credencial de homologação, nenhuma chamada real foi executada nem
será simulada como sucesso. O registry continua sem ativar o adapter em `live`.
