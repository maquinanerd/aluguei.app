# Portais imobiliários — pesquisa e classificação

## Atualização de 01/10/2026 — Grupo OLX / Canal Pro

Data de verificação: **01/10/2026**. Fonte: páginas oficiais de `developers.grupozap.com` baixadas
nessa data, central de ajuda do ZAP e o repositório oficial `github.com/olxbr/crm-lead-integration`.
Só o Grupo OLX foi pesquisado de novo; os demais portais seguem como na pesquisa de 17/08 (abaixo),
e a lista ampliada que circulou depois (Chaves na Mão, Mercado Livre, Loft, QuintoAndar, regionais,
Órulo, DWV) **não foi verificada** e não vale como contrato técnico.

### Confirmado em documentação oficial

- **Um feed só para três portais.** O Canal Pro é o console do Grupo OLX; o feed VRSync numa URL
  pública é lido a cada ~12 h e reflete no ZAP, no Viva Real **ou** na OLX conforme o plano
  contratado (`/feeds/integration.html`). Canal Pro, ZAP e Viva Real não são integrações separadas.
- **Desenvolvedor Próprio.** Sem o software na lista (~450 homologados), a imobiliária escolhe
  "Desenvolvedor Próprio" e cadastra a URL (`ajuda.zapimoveis.com.br/s/article/o-que-e-integracao`).
- **Robô do feed** (`/feeds/connection_guideline.html`): User-Agent `VivaRealBot/1.0`, IPs publicados
  (54.162.151.93, 35.170.24.75, 35.169.28.85, 52.6.165.235, 54.156.129.60, 3.89.171.165,
  3.208.42.223, 35.175.17.150, 35.173.9.239, 18.231.52.186, 100.24.160.21 — sujeitos a mudança),
  60 s para conectar, 20 min para baixar, URL até 255 caracteres, TLS documentado até 1.2,
  certificado válido, sem autenticação documentada.
- **Regras** (`/feeds/integration_rules.html`): até 50 mil anúncios por arquivo; anúncio do XML não é
  editável no Canal Pro; anúncio manual igual ao do XML dá duplicidade; cota do contrato inativa o
  excedente.
- **VRSync** (`/feeds/vrsync/elements/*`): ListingID 1–50, Title 10–100, Description 50–3.000 sem HTML,
  PostalCode obrigatório, endereço completo recomendado com `displayAddress` separado, ≥ 5 fotos JPG
  de até 7 MB, URL da foto como identidade, ContactInfo com nome e e-mail, PublicationType
  (STANDARD … TRIPLE), 24 PropertyType, valores inteiros.
- **Validador de XML** em beta (`/feeds/xml_validator/`, até 30 MB, upload manual).
- **Webhook de leads** (`/webhooks/integration_leads.html`, `/webhooks/security.html`): POST JSON por
  lead; Basic Auth `vivareal:<SECRET_KEY>` com a chave **por software**; 2xx é sucesso, fora disso 3
  tentativas e 14 dias de guarda; `originLeadId` para idempotência; `clientListingId` obrigatório em
  lead de anúncio (ausente → 4xx); lead MCMV sem anúncio, com CPF/CNPJ do anunciante; `leadType`
  CLICK_SCHEDULE, CLICK_WHATSAPP, CONTACT_CHAT, CONTACT_FORM, PHONE_VIEW, VISIT_REQUEST; timeout de
  30 s; URL pode carregar o identificador do anunciante (`/webhooks/url_encoding.html`).
- **Relatório de importação por webhook** (`/webhooks/integration_report_feeds_via_webhooks.html`):
  `FEEDS_INTEGRATION_REPORT`, endpoint homologado, sem retentativa.
- **Homologação**: formulário oficial e validador de endpoint; contato único
  `chamado.integracao@olxbr.com` (`/contact/contact.html`).
- **API própria da OLX** continua no ar em `developers.olx.com.br` (anúncios por API/XML próprio,
  leads, chat): é outra integração.

### Confirmado no código (01/10/2026)

Canal `grupoolx` em modo FEED (ADR-107) e webhooks de lead e relatório (ADR-108), com testes de
unidade e integração e verificação na stack local. Detalhe e checklist do piloto em
`docs/integrations/GRUPO_OLX_HOMOLOGATION.md`. Estado: **IMPLEMENTED_NOT_LIVE_VERIFIED**.

### Não determinado

- Se o relatório por webhook vem com o mesmo Basic Auth e como identificar o anunciante quando ele
  não cita anúncio (o código exige a chave e aceita URL por imobiliária).
- Se o robô de imagens segue redirecionamento (o código serve os bytes direto, sem depender disso).
- O XSD oficial: `http://xml.vivareal.com/vrsync.xsd` respondeu 403 em 01/10/2026.
- Qual caminho a OLX recomenda para imobiliária: Canal Pro/VRSync ou a API própria.
- WhatsApp (11) 4861-1799: citado fora da documentação (Reclame Aqui) — **UNVERIFIED**.

### Bloqueado externamente

Envio do contato ao Grupo OLX; SECRET_KEY real; submissão da homologação; imobiliária piloto com
conta Canal Pro; plano/cota real do cliente; validação real do feed; teste real de leads;
confirmação do caminho Canal Pro × API própria da OLX.

---

## Pesquisa de 17/08/2026 (histórico)

> Atualizado em 01/10/2026: ZAP, Viva Real, OLX e Canal Pro passaram a ser um canal só, o feed do Grupo
> OLX (ver acima). A tabela abaixo é o registro de 17/08 e não foi apagada.

Pesquisa por API/feed oficial de **ZAP**, **VivaReal** (Grupo OLX), **OLX
Imóveis**, **ImovelWeb** e **CanalPro**, feita via web em 2026-08-17. Nada foi
inventado: abaixo está o que foi encontrado (ou a ausência documentada).

Classificações usadas: `API_AVAILABLE` (docs públicas de API REST),
`FEED_XML` (envio em lote via XML, sem REST), `PARTNER_ONLY` (exige plano/
contrato/credencial de parceiro, mesmo com doc), `UNAVAILABLE_WITHOUT_CONTRACT`.

## Tabela por portal

| Portal                           | Classificação                                                             | Fonte/URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status implementação | Necessário para adapter                                                                                                      | Observações                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ZAP** (zap.com.br)             | `FEED_XML` + `PARTNER_ONLY`                                               | Portal de integração do Grupo OLX: https://developers.grupozap.com/ (seção _Feeds_: https://developers.grupozap.com/feeds/integration.html, regras: /feeds/integration_rules.html)                                                                                                                                                                                                                                                                                                                  | Sem adapter hoje     | Contrato/plano com o Grupo OLX + conta Canal Pro (para cadastrar a URL do feed) + URL do feed XML acessível                  | Feed XML em lote (VRSync); processado a cada ~12h; máx. 50 mil anúncios/arquivo; relatório por e-mail/webhook e no Canal Pro. Formatos não-VRSync aceitos só até 2024-10-30.                                                          |
| **VivaReal** (vivareal.com.br)   | `FEED_XML` + `PARTNER_ONLY`                                               | Mesmo portal do Grupo OLX: https://developers.grupozap.com/feeds/integration.html                                                                                                                                                                                                                                                                                                                                                                                                                   | Sem adapter hoje     | Mesmo do ZAP (plano/contrato + Canal Pro + URL do feed)                                                                      | **Compartilha protocolo com ZAP**: docs afirmam que Grupo OLX é a união de OLX, ZAP e VivaReal e que o mesmo feed reflete nos portais "dependendo do plano contratado" (documentado, sem pressupor detalhes de contrato).             |
| **OLX Imóveis** (olx.com.br)     | `API_AVAILABLE` (REST, docs públicas; operação exige conta + homologação) | Portal de integração OLX: https://developers.olx.com.br/ — API de Anúncios (OAuth 2.0: /anuncio/api/oauth.html, importação/edição/deleção: /anuncio/api/import.html, Imóveis: /anuncio/api/real_estate/home.html), importação via XML (/anuncio/xml/real_estate/home.html) e JSON (/anuncio/json/home.html), Anúncios Publicados (/anuncio/api/published_ads.html), Webhooks (/webhooks/home.html), **Integração de Leads** (/lead/home.html — envio de leads gerados no portal para o CRM via API) | Sem adapter hoje     | Conta OLX anunciante, credenciais OAuth 2.0 (client id/secret), homologação (contato: suporteintegrador@olxbr.com)           | Modelo de **inserção paga** de anúncios. Leads de chat são só notificação (resposta exige o portal).                                                                                                                                  |
| **ImovelWeb** (imovelweb.com.br) | `PARTNER_ONLY` (`FEED_XML` sem doc pública)                               | Site oficial: https://www.imovelweb.com.br/ (fluxo "Anuncie seu imóvel" para imobiliárias); central de ajuda: help.imovelweb.com.br (artigo "Como habilitar uma integração de anúncios?"); help de CRMs terceiros descrevem cadastro de URL de XML no painel do portal                                                                                                                                                                                                                              | Sem adapter hoje     | Conta/anúncio ativo de imobiliária no ImovelWeb (plano) e ativação da integração no painel (nome do integrador + URL do XML) | Grupo QuintoAndar (footer do site). Não há portal de desenvolvedor público encontrado; integração é ativada pelo cliente no painel, sem docs de API pública.                                                                          |
| **CanalPro** (canalpro.com.br)   | `PARTNER_ONLY`                                                            | Documentado como console de gestão do Grupo OLX nos próprios docs: https://developers.grupozap.com/feeds/integration.html ("atualizar manualmente seus anúncios por meio do Canal Pro"); central de ajuda ZAP: https://ajuda.zapimoveis.com.br/                                                                                                                                                                                                                                                     | Sem adapter hoje     | Conta Canal Pro + contrato com o Grupo OLX                                                                                   | **Não é um portal com API própria**: é o painel do Grupo OLX onde feeds VRSync e relatórios são gerenciados. Site canalpro.com.br indisponível para acesso automatizado (erro de transporte), sem docs públicas próprias encontradas. |

## Conclusões

- **ZAP e VivaReal compartilham protocolo**: ambos usam o portal de integração
  do Grupo OLX e o formato de feed **VRSync** (docs de 2026-08-17 confirmam o
  grupo unificado OLX+ZAP+VivaReal; o mesmo feed alimenta os portais conforme o
  plano). A distinção real de contrato (qual portal cada plano ativa) só é
  conhecida com o contrato do Grupo OLX.
- **OLX Imóveis** é o único com **API REST pública documentada** (OAuth 2.0 +
  endpoints de anúncios + leads), mas a operação exige conta anunciante,
  credenciais e homologação — e publicação é paga.
- **ImovelWeb** e **CanalPro** são `PARTNER_ONLY`: sem docs públicas de API;
  integração via XML cadastrada no painel (contrato/plano do portal).
- **Nenhum portal tem adapter hoje** no Aluguei.app (só `fake`). O contrato
  local `IListingChannelAdapter` (`packages/integrations/src/channels/types.ts`)
  já abstrai REST/XML/feed, então o primeiro adapter real viável é o de **OLX
  Imóveis** (API REST + leads), seguido do **feed VRSync do Grupo OLX** (batch
  12h, sem REST) quando houver contrato.
- Adapter real só com contrato/credencial: registrar em `docs/BLOCKERS.md`
  como `IMPLEMENTED_NOT_LIVE_VERIFIED` quando houver código; nada de chamadas
  reais sem credencial.
