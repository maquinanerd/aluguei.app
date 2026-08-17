# Google Places API — Homologação

Status: **IMPLEMENTED_NOT_LIVE_VERIFIED** — adapter implementado e testado com
fetch mockado; **sem credencial real e sem billing ativo** (nada foi chamado
fora do ambiente de teste).

- Data da pesquisa: **2026-08-17**
- Implementação: `packages/integrations/src/places/` (`types.ts`, `google.ts`, `mock.ts`, `places.test.ts`)

## Documentação consultada

| Documento                                       | URL                                                                                                                                                                                                                                    | Última atualização (doc) |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Autocomplete (New) — REST `places.autocomplete` | https://developers.google.com/maps/documentation/places/web-service/autocomplete (redireciona para o guia; referência REST: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/autocomplete) | 2026-05-15               |
| Place Details (New) — REST `places.get`         | https://developers.google.com/maps/documentation/places/web-service/place-details (referência REST: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/get)                                  | 2026-05-15               |
| Usage and Billing                               | https://developers.google.com/maps/documentation/places/web-service/usage-and-billing                                                                                                                                                  | 2026-08-11               |

Nota: a URL "autocomplete" do guia hoje serve a página _Place Autocomplete
(Legacy)_; a API **atual** é a **Places API (New)** (REST `v1`), que é a que o
adapter implementa.

## Versão da API

- **Places API (New)**, REST `v1` (gRPC Transcoding).
- Endpoint base: `https://places.googleapis.com/v1`
- `POST /v1/places:autocomplete` — Autocomplete (New)
- `GET /v1/places/{placeId}` — Place Details (New) (query: `languageCode`, `regionCode`, `sessionToken`)
- Field mask: header `X-Goog-FieldMask` (o adapter pede somente
  `places.addressComponents,places.formattedAddress,places.location` para
  controlar custo).

## Autenticação

- **API key** no header `X-Goog-Api-Key` (o adapter já envia) **ou** OAuth
  token Bearer (`maps-platform.places.*` scopes).
- **Billing obrigatório** no projeto Cloud: sem billing habilitado, as chamadas
  falham.

## Billing (por chamada / SKU)

Modelo pay-as-you-go por SKU (fonte: Usage and Billing, 2026-08-11):

- **Autocomplete (New)**: SKU _Autocomplete Requests_ (Essentials) e SKU
  _Autocomplete Session Usage_ (Essentials). Sessões de Autocomplete vinculadas
  a Place Details/Address Validation **são gratuitas atualmente** (session token
  nas duas chamadas). Sem session token, cada request é cobrada separadamente.
- **Place Details (New)**: SKUs _Place Details Essentials (IDs Only)_,
  _Place Details Essentials_, _Place Details Pro_ e _Enterprise_ — o SKU é
  definido pelos campos pedidos no field mask. Pedir apenas
  `addressComponents`/`formattedAddress`/`location` permanece no nível
  Essentials.
- Crédito mensal de US$ 200 por projeto (aplicado a SKUs elegíveis) — ver
  página oficial para vigência.

## Rate limits / quotas

- **Places API (New)**: limite por minuto é **por método e por projeto** (cada
  método tem quota própria).
- Quotas ajustáveis no Cloud Console (Google Maps Platform > Quotas > aumentar
  solicitação).
- O adapter não implementa retry/backoff (só timeout); decisão consciente: o
  chamador (API) controla o retry seletivo.

## Estrutura do código

- `PlacesService` (contrato): `autocomplete(input) → Prediction[]` e
  `placeDetails(placeId) → StructuredAddress | null`.
- `GooglePlacesAdapter`: REST via fetch nativo, timeout (`timeoutMs`, default
  5s), zod parse das respostas, mapeamento de `addressComponents` para o
  formato BR (route→street, street_number→number, sublocality*→neighborhood,
  administrative_area_level_2→city, administrative_area_level_1→state/UF,
  postal_code→zipCode, country→country).
- `PlacesMockService`: mock determinístico (dev/test), sem rede.

## O que falta para ir a produção

1. **Chave de API do Google Maps Platform** com Places API habilitada e
   **billing ativo** no projeto Cloud (restrição de chave por HTTP referrer/IP,
   conforme prática de segurança do repo — nenhum segredo em código).
2. **Homologação manual** com chamadas reais (Autocomplete + Place Details para
   endereços BR) validando o mapeamento de componentes (bairro/cidade/UF).
3. Decidir política de session token (recomendado UUID v4 por sessão) e
   rate limit/retry no chamador.
4. Registrar no `docs/BLOCKERS.md`/`docs/INTEGRATIONS.md` quando a chave
   existir e a validação real for feita.

Nenhuma credencial deve ser commitada; em runtime, a chave entra via
configuração de ambiente (não há placeholder de segredo no código).
