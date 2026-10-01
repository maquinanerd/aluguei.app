# Grupo OLX / Canal Pro — homologação e piloto

Status: **IMPLEMENTED_NOT_LIVE_VERIFIED** (01/10/2026). Código, testes e verificação na stack local
prontos; nenhuma conta real do Grupo OLX validou o fluxo. Nada aqui foi enviado ao Grupo OLX.

Decisões: ADR-107 (feed) e ADR-108 (leads e relatório). Estado anterior ao código:
`docs/integrations/grupo-olx/00_CURRENT_STATE.md`.

## 1. O que está implementado

| Peça                                                                             | Onde                                                  | Prova                                            |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Conexão por imobiliária (liga/desliga, destinos, contas, cotas, observabilidade) | `channel_connections`, `PUT /integrations/grupo-olx`  | `tests/integration/src/grupo-olx-feed.test.ts`   |
| URL do feed com token opaco de 256 bits, só o hash no banco, mostrada uma vez    | `POST/DELETE /integrations/grupo-olx/feed-token`      | mesmo arquivo                                    |
| Feed VRSync em streaming, reavaliando cada anúncio                               | `GET /integrations/grupo-olx/feed/{token}.xml`        | mesmo arquivo + stack local                      |
| Fotos JPG com URL estável por versão                                             | `GET /integrations/grupo-olx/media/{id}/{versão}.jpg` | mesmo arquivo + stack local (storage em disco)   |
| Prévia do arquivo para o validador oficial                                       | `GET /integrations/grupo-olx/feed-preview.xml`        | mesmo arquivo                                    |
| Webhook de leads (Basic Auth, roteamento, deduplicação, CRM no worker)           | `POST /integrations/grupo-olx/leads`                  | `tests/integration/src/grupo-olx-leads.test.ts`  |
| Webhook do relatório de importação (estado real dos anúncios)                    | `POST /integrations/grupo-olx/reports`                | `tests/integration/src/grupo-olx-report.test.ts` |
| URL por imobiliária (se a homologação pedir)                                     | `/leads/{ref}` e `/reports/{ref}`                     | testes acima                                     |
| Telas: Canais e Canais → Grupo OLX                                               | `apps/web/src/app/app/channels/`                      | stack local (texto da página conferido)          |

Regras do VRSync aplicadas antes de entrar no arquivo (avaliação em
`packages/integrations/src/channels/grupo-olx/vrsync.ts`): título 10–100, descrição 50–3.000, sem HTML,
CEP com 8 dígitos, UF/cidade/bairro, tipo do imóvel mapeado (comercial e terreno exigem escolha),
quartos e banheiros conforme o tipo, área útil ou total conforme o tipo, preço de venda e/ou
aluguel conforme a finalidade, ao menos 5 fotos JPG de até 7 MB, e-mail público da imobiliária.

## 2. Configuração na instalação

| Variável                     | Serviço | Para quê                                                                     | Sem ela                                             |
| ---------------------------- | ------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| `API_PUBLIC_URL`             | api     | Endereço público da API (https em produção): base do feed e das fotos        | Feed responde 503 e a tela avisa                    |
| `GRUPO_OLX_LEADS_SECRET_KEY` | api     | Chave que o Grupo OLX entrega na homologação (Basic Auth `vivareal:<chave>`) | Webhooks respondem 503: nada entra sem autenticação |

O `docker-compose.prod.yml` passa `API_PUBLIC_URL: ${API_BASE_URL}` para a API (o mesmo domínio
https que web e portal já usam). A chave do webhook **não** está no compose: entra no Coolify quando
existir — variável vazia vale como ausente.

## 3. O que a imobiliária faz (piloto)

1. Canais → Grupo OLX: cadastra o e-mail público, liga o feed, marca os portais do contrato.
2. Gera a URL do feed e copia (ela não aparece de novo).
3. No Canal Pro: Configurações da conta → Integração de anúncios → "Selecione o Software" →
   **Desenvolvedor Próprio** → cola a URL. (Fonte: central de ajuda do ZAP, `ajuda.zapimoveis.com.br/s/article/o-que-e-integracao`.)
4. Publica os anúncios no canal Grupo OLX pela tela de Canais.
5. Espera a leitura (a cada ~12 h). A tela mostra "Última busca do Grupo OLX".

Observação do Canal Pro: anúncio criado pelo XML não pode ser editado lá; anúncio manual igual ao do
XML dá erro de duplicidade e precisa ser apagado à mão no Canal Pro.

## 4. Checklist da validação real (para sair de IMPLEMENTED_NOT_LIVE_VERIFIED)

- [ ] Imobiliária piloto com conta Canal Pro e plano ativo
- [ ] URL cadastrada como "Desenvolvedor Próprio"
- [ ] Tela mostra a busca do robô (`VivaRealBot`) com a quantidade de anúncios
- [ ] Anúncios aparecem no ZAP / Viva Real / OLX conforme o plano
- [ ] Relatório por e-mail do Grupo OLX sem erro de formato (o webhook do relatório depende da homologação)
- [ ] Fotos importadas (o robô de imagens baixou as URLs de `/integrations/grupo-olx/media/…`)
- [ ] Depois da homologação: chave configurada, lead real recebido e no CRM

## 5. E-mail para o Grupo OLX (preparado, **não enviado**)

Para: `chamado.integracao@olxbr.com` — único contato publicado em `developers.grupozap.com/contact/contact.html`.
O WhatsApp (11) 4861-1799 que apareceu na pesquisa veio do Reclame Aqui: **UNVERIFIED**, não usar
como canal oficial.

> **Assunto:** Homologação do AchouImóvel Gestão como software integrado ao Canal Pro
>
> Olá,
>
> Somos o AchouImóvel Gestão, plataforma de CRM e gestão imobiliária, e implementamos a integração
> com o Grupo OLX / Canal Pro seguindo a documentação de developers.grupozap.com:
>
> - feed de imóveis no padrão VRSync, por URL com token, com validação das regras documentadas
>   antes de cada anúncio entrar no arquivo;
> - fotos em JPG com URL estável (a URL muda quando a foto muda);
> - recebimento de leads por webhook (Basic Auth, `originLeadId` para idempotência,
>   `clientListingId` para achar o anúncio, leads MCMV);
> - recebimento do relatório de importação por webhook.
>
> Gostaríamos de iniciar a homologação e confirmar:
>
> 1. Para imobiliárias usando o AchouImóvel Gestão, devemos priorizar a integração Canal Pro/VRSync,
>    ou existe cenário em que a API própria da OLX (developers.olx.com.br) deve ser usada?
> 2. Qual o formato recomendado para identificar o anunciante no endpoint homologado de leads?
> 3. A URL do webhook pode conter um identificador opaco por anunciante?
> 4. Em qual etapa recebemos a SECRET_KEY do webhook?
> 5. Há ambiente de homologação ou sandbox?
> 6. Qual a versão atual do XSD do VRSync e como obtê-la, já que `http://xml.vivareal.com/vrsync.xsd`
>    responde 403?
> 7. Existe procedimento adicional para homologar o webhook do relatório de importação? Ele vem com
>    a mesma autenticação Basic do webhook de leads, e como identificamos o anunciante quando o
>    relatório não cita nenhum anúncio?
> 8. Qual o procedimento atual para o AchouImóvel Gestão aparecer na lista de softwares do Canal Pro?
>
> Também pedimos o kit de marca e as diretrizes de uso dos nomes e logotipos Grupo OLX, Canal Pro,
> ZAP Imóveis, Viva Real e OLX, só para identificar a integração dentro do sistema.
>
> Se houver um responsável específico pela homologação de novos softwares, pedimos que encaminhem
> este contato.
>
> Obrigado.

Quem envia: o dono do produto. O Claude não envia e-mail nem preenche o formulário de homologação
(`docs.google.com/forms/d/e/1FAIpQLSd6WJ3xw-qoFzW2-6OvrEihTjurUwVsJYei-P4alae2S1yedQ/viewform`).

## 6. Depois da homologação

1. Receber a SECRET_KEY e cadastrar `GRUPO_OLX_LEADS_SECRET_KEY` no Coolify (serviço api).
2. Informar a URL do webhook: `https://api.achouimovel.online/integrations/grupo-olx/leads` (ou o
   formato por anunciante, se pedido: `/leads/{referência da conexão}`).
3. Relatório: `https://api.achouimovel.online/integrations/grupo-olx/reports`.
4. Testar com o validador de endpoint do Grupo OLX (`developers.grupozap.com/webhooks/endpoint_validator/`),
   que manda o lead de exemplo da documentação.
5. Só depois de um ciclo real com a imobiliária piloto: estágio `LIVE_VERIFIED` no registry
   (`packages/integrations/src/channels/registry.ts`) e texto do site B2B revisto.
