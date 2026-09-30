# AchouImóvel · plano de fidelidade às telas (Onda 0 · diagnóstico)

Entrega da Onda 0 do prompt orquestrado de 29/09/2026, a versão que trouxe `SCREENS.md` e os prints.
**Somente leitura: nenhuma linha de código de produto foi alterada.** O estado de cada tela fica em
`docs/frontend/ACHOUIMOVEL_CHECKLIST.md`.

> **Aprovado em 30/09/2026.** O dono aprovou o plano com as recomendações de §4 ("sim, pode seguir
> com as recomendações"). As decisões D1 a D7 e as técnicas T1 a T10 estão no **ADR-105**. O pacote
> de design foi versionado em `design-source/achouimovel/` (D5), com `SCREENS.md` e os 59 prints.
> Correção feita na aprovação: o texto original do D3 dizia que nenhum ADR autorizava enviar foto a
> provedor; o ADR-104 autoriza, com a mesma regra do áudio. A decisão (D3 = a) não muda; o motivo
> foi corrigido abaixo.

- Data: 30/09/2026 · base: `main` em `190f650` (PR #51).
- Pacote lido: README, PROMPT, `SCREENS.md` (59 linhas), `docs/HANDOFF.md`,
  `docs/CONTEXTO_CLAUDE_DESIGN_AchouImovel.md`, tokens, 13 arquivos `.dc.html` e 59 prints, hoje em
  `design-source/achouimovel/`. `Design.zip` ignorado por instrução. Neste documento, `prints/…` e
  `telas/…` são relativos a essa pasta.
- Não lido, por instrução: `docs/audits/**`. `PROMPT_apps-portal.md` continua fora do repositório; o
  papel dele é de `docs/frontend/PORTAL_SEO.md` (ADR-097, ADR-099).
- A versão anterior deste arquivo, da primeira rodada, está no git:
  `git show 51b78a3:docs/frontend/ACHOUIMOVEL_PLAN.md`.

Sumário: 1 Resumo · 2 Defeitos no ar · 3 Mapa das 59 telas · 4 Decisões do dono · 5 Decisões
técnicas · 6 Fundação do laço de fidelidade · 7 Diferenças que o repositório impõe · 8 Ondas ·
9 Lacunas de backend · 10 Riscos · 11 Pendências do dono · 12 Pronto por onda · 13 Método ·
Anexo A — diagnóstico tela a tela.

---

## 1. Resumo

| Pergunta                   | Resposta                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O que mudou no pacote?     | Só o prompt (regra de fidelidade) e o README; entraram `SCREENS.md` e os 59 prints. `telas/`, `tokens/`, `docs/` e as fontes são idênticos byte a byte aos da primeira rodada (38 arquivos comparados com `cmp`). A primeira rodada partiu das mesmas fontes; o que muda agora é a régua: print como alvo e screenshot como prova. |
| As telas existem?          | 33 existem na rota do `SCREENS.md`; 12 existem em outro caminho; 10 são estado ou trecho de outra rota; 4 não existem (05 busca com poucos anúncios, 36 etapa Valores, 40 contrato de venda, 44 diálogo de limite).                                                                                                                |
| Estão parecidas?           | Não. 1 tela pede ajuste fino (A), 43 pedem reestruturação (B) e 15 têm estado ou parte inexistente (C). Dos 744 textos literais das telas, 354 (48%) estão no código. A maior causa isolada é a tipografia do portal: 13 declarações `font-size: var(--type-*)` inválidas deixam títulos e preços com 16px (defeito 14).           |
| Falta backend?             | 46 telas pedem campo, rota, regra ou integração, consolidados em 29 lacunas (§9); 11 não pedem nada; 2 dependem só de decisão do dono.                                                                                                                                                                                             |
| O laço de fidelidade roda? | Não. O pacote não está no git, não há fixture das telas, a stack de E2E não sobe o portal nem storage e nenhum teste Playwright abre o portal. É a primeira entrega da Onda 1 (§6).                                                                                                                                                |
| Há defeito no ar?          | Sim: 17, dos quais 5 P1 (§2). Pedir link de acesso e pagar com Pix dão 404 em produção; o portal declara Canal Pro, OLX e Imovelweb "Integrado" sem adapter; não há página de privacidade nem de termos; o extrato do proprietário soma só o primeiro imóvel.                                                                      |
| O que precisa do dono?     | 7 decisões (§4) e as pendências de §11. A mais urgente é D1: o prompt novo manda mostrar os portais parceiros como integrados, e o ADR-097 e o `AGENTS.md` proíbem isso sem adapter.                                                                                                                                               |

---

## 2. Defeitos no ar achados no diagnóstico

Todos reconferidos pelo orquestrador no código; os marcados com **(produção)** também por GET em
`achouimovel.online` e `app.achouimovel.online`, sem efeito colateral. Severidade P1–P3.

| #   | Sev. | Defeito                                                                                                                                                                                 | Evidência                                                                                                                                                                                                                                                     | Correção proposta                                                                            |
| --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | P1   | Pedir link de acesso (área do cliente) não funciona: o front chama uma rota que não existe **(produção: 404)**.                                                                         | `apps/web/src/app/portal/entrar/pedir-link.tsx:48` chama `/api/portal/auth/request-link`; em `apps/web/src/app/api/portal/auth/` só há `consume` e `logout`; `apps/web/next.config.ts` só tem `headers()`. GET na rota: 404; na vizinha `consume`: 405.       | Rota BFF (ou chamada por `/api/backend/…`) e E2E que clica "Pedir link" — hoje nenhum clica. |
| 2   | P1   | Pagar com Pix (inquilino) não funciona pelo mesmo motivo **(produção: 404)**.                                                                                                           | `apps/web/src/app/inquilino/pagar-pix.tsx:27` chama `/api/portal/tenant/charges/:id/payment`, inexistente.                                                                                                                                                    | Idem, com E2E que gera o Pix pelo provider FAKE.                                             |
| 3   | P1   | O portal declara os parceiros "Integrado" sem adapter **(produção: 6 ocorrências em `/para-imobiliarias`)**.                                                                            | `apps/portal/src/app/b2b-conteudo.ts:20,25,30`; `packages/integrations/src/channels/registry.ts:14-18` (`adapter: null`); contraria `AGENTS.md` e o ADR-097. Também `apps/portal/src/lib/planos.ts:42-46` e as páginas `/anunciar` e `/gestao`.               | Estado real ("Em preparação") até a decisão D1.                                              |
| 4   | P1   | O portal coleta nome, telefone e e-mail com consentimento e não tem política de privacidade nem termos no ar **(produção: `/privacidade` e `/termos` dão 404)**.                        | Links em `apps/portal/src/components/SiteFooter.tsx:39` e vizinhos; nenhuma página em `apps/portal/src/app`.                                                                                                                                                  | Páginas com o texto jurídico do dono (pendência 1 de §11).                                   |
| 5   | P1   | O extrato do proprietário mostra só o primeiro imóvel: quem tem dois vê valores a menos.                                                                                                | `apps/web/src/app/proprietario/page.tsx:56-58` (`propertyId=${properties[0]?.id}`); a API soma todos sem o filtro (`apps/api/src/routes/portal.ts:642`).                                                                                                      | Extrato sem filtro ou por imóvel com seletor.                                                |
| 6   | P2   | Links do cabeçalho e do rodapé do portal dão 404 **(produção)**: `/alugar`, `/comprar`, `/cidades`, `/sobre`, `/ajuda`, `/alerta`, `/login`, `/para-imobiliarias/anunciar`, `/cookies`. | `apps/portal/src/components/SiteHeader.tsx:17-19`; `SiteFooter.tsx:13-40`; `apps/portal/src/lib/rotas.ts:60-63` devolve nulo sem cidade e `busca-pagina.tsx:67-70` chama `notFound()`.                                                                        | Destino para Alugar/Comprar (escolha de cidade) e nenhum link para página que não existe.    |
| 7   | P2   | A vistoria de entrada aparece ao inquilino como "Vistoria de saída".                                                                                                                    | `apps/web/src/app/inquilino/page.tsx:207` compara com `'ENTRY'`; os tipos são `CHECKIN`, `CHECKOUT` e `INTERMEDIATE` (`packages/contracts/src/inspections.ts:4`).                                                                                             | Comparar com os tipos do contrato.                                                           |
| 8   | P2   | O alerta é cancelado ao abrir o link, sem confirmação: um leitor de e-mail que pré-abre links cancela o alerta sozinho.                                                                 | `apps/portal/src/app/alerta/cancelar/page.tsx:19-24` chama `responderAlerta('cancel', …)` na renderização do GET.                                                                                                                                             | GET só mostra; cancelar é um POST do botão "Cancelar alerta" (é o que o print pede).         |
| 9   | P2   | O alerta por WhatsApp promete envio e nada é enfileirado: fica pendente para sempre.                                                                                                    | `apps/portal/src/app/actions.ts:148` ("…que enviamos para o seu WhatsApp"); `apps/api/src/routes/public-portal.ts:269-278` só enfileira e-mail.                                                                                                               | Esconder a opção WhatsApp até existir canal.                                                 |
| 10  | P2   | O diálogo de publicação diz "vai publicar" nos canais e "em todos os canais conectados", mas só troca o status do anúncio.                                                              | `apps/web/src/app/app/listings/dialogo-publicacao.tsx:130,139`; `listings-client.tsx:116-121`; `PATCH /listings/:id/status` não enfileira canal (`apps/api/src/routes/listings.ts:475-490`).                                                                  | Texto fiel agora; publicar nos canais marcados na Onda 4 (B16).                              |
| 11  | P2   | O filtro de origem "WhatsApp" do pipeline nunca encontra lead.                                                                                                                          | `apps/web/src/app/app/crm/pipeline/pipeline-client.tsx:43` envia `WHATSAPP`; o atendimento grava `channel: 'whatsapp'` (`apps/api/src/whatsapp/gateway.ts:147`); comparação exata em `apps/api/src/routes/leads.ts:153`.                                      | Vocabulário único de origem, gravado e filtrado igual.                                       |
| 12  | P2   | O painel de vendas corta o mês em UTC: fechamento depois das 21h do último dia cai no mês seguinte.                                                                                     | `apps/api/src/routes/sale-negotiations.ts:553-556` escolhe o mês em São Paulo e monta `${mes}-01T00:00:00.000Z`.                                                                                                                                              | Limites do mês na data civil de São Paulo.                                                   |
| 13  | P2   | Módulo fora do plano vira "sem permissão" genérico em vez da tela de upgrade prometida pelo ADR-095.                                                                                    | `apps/web/src/lib/api-client.ts:7-16`: `ApiClientError` guarda `code` e descarta `details` (e com ele `reason = PLAN_MODULE_NOT_INCLUDED` e os números do 409 de limite).                                                                                     | Onda 1 (tela 33).                                                                            |
| 14  | P2   | Tipografia do portal: títulos, preços e rótulos saem com 16px.                                                                                                                          | `apps/portal/src/styles/tokens.css:53-59` define `--type-*` como valor do atalho `font`; 13 regras os usam em `font-size` (`portal.css:21,307,617`; `telas.css:19,26,62,125,189,217,355,425,431,566`), o que invalida a declaração. Medido no Chromium: 16px. | Onda 1 (base do portal).                                                                     |
| 15  | P2   | "Demanda por bairro" fica vazia em produção: só conta alerta confirmado, e nenhum e-mail de confirmação sai.                                                                            | `apps/api/src/routes/reporting.ts:271,283` (`status = 'ACTIVE'`); `apps/api/src/email-outbox.ts:8-9` ("Nada é enviado").                                                                                                                                      | Depende de D6.                                                                               |
| 16  | P3   | O "Canal de teste" (`fake`) é oferecido como canal disponível a qualquer imobiliária, inclusive em produção.                                                                            | `packages/integrations/src/channels/registry.ts:13,26`; `GET /channels` (`apps/api/src/routes/channels.ts:132-139`) sem condição de ambiente.                                                                                                                 | Só com `ALLOW_FAKE_PROVIDERS=true`, como os outros FAKE.                                     |
| 17  | P3   | O assunto dos e-mails de senha e de convite ainda diz "Aluguei.app".                                                                                                                    | `apps/api/src/routes/auth.ts:394`; `apps/api/src/routes/organizations.ts:334`.                                                                                                                                                                                | Nome da marca num lugar só, como no painel (ADR-098).                                        |
| 18  | P2   | Depois de criar um alerta, o portal diz "confirme pelo link que enviamos para o seu e-mail", e nenhum e-mail sai: não há provedor. Achado na Onda 1B2.                                  | `apps/portal/src/app/actions.ts:147`; `apps/api/src/email-outbox.ts:8` ("Nada é enviado").                                                                                                                                                                    | Texto corrigido na Onda 1B2 ("Registramos o alerta…"); o envio é a Onda 1D (D6).             |

Proposta: corrigir 1, 2, 3, 5 a 12, 16 e 17 num PR pequeno **antes** da Onda 1, cada um com teste que
falha antes da correção; 13 e 14 entram na Onda 1; 4 depende do texto do dono; 15 depende de D6.
Como é mudança de código, esse PR também espera a aprovação deste plano.

> **Feito em 30/09/2026.** Os defeitos 1, 2, 3, 5 a 12, 16 e 17 foram corrigidos no PR #53, um commit
> por defeito, cada um com teste que falha antes; implantado pelo deployment
> `ad53kqzldsoabfqlujgdktlx` (commit `319328e`). Smoke em produção só com GET: 27 de 27 — as rotas de
> pedir link e de Pix existem (405 em vez de 404), `/para-imobiliarias` diz "Em preparação" e não diz
> "Integrado", `/alugar` e `/comprar` abrem, todo link interno da home responde 200, o cancelamento
> do alerta pergunta antes e o alerta não oferece WhatsApp. Continuam abertos: 4 (texto do dono),
> 13 e 14 (Onda 1) e 15 (D6).
>
> **Onda 1A e 1B implantadas em 30/09/2026** (PRs #54 e #55, deployment `kn5atopz2kowec1y1hsi0w0a`,
> commit `c34bb11`). O defeito 14 acabou: medido no Chromium em produção, o H1 da home sai com 52px e
> os das outras páginas com 46px em 1440 (30 e 28px em 390), o H2 com 26px, e o miolo tem 1312px a
> partir de x=64. Smoke só com GET: 27 de 27 da regressão e 11 de 11 novos (CSS novo no ar e HTML sem
> dado privado); 6 dos 7 novos de CSS falharam antes do deploy. Todo deploy derruba o portal por 2 a 3
> minutos (503 na troca de contêineres) — tarefa à parte.

---

## 3. Mapa das 59 telas

Legenda. **Situação** (em relação à rota do `SCREENS.md`): EXISTE · OUTRO_CAMINHO · DENTRO (estado ou
trecho de outra rota) · AUSENTE. **Dist.** (distância do print): A ajuste fino (texto, token,
espaçamento) · B reestruturar layout e componentes com os mesmos dados · C estado ou parte
inexistente. **Backend**: tipo da lacuna e a referência em §9. O detalhe de cada linha está no Anexo A.

| #   | Tela (print)                          | Rota hoje                                                  | Situação      | Dist. | Backend                             | Onda |
| --- | ------------------------------------- | ---------------------------------------------------------- | ------------- | ----- | ----------------------------------- | ---- |
| 01  | portal/00-identidade                  | `/dev/componentes` (portal, fora de produção)              | OUTRO_CAMINHO | A     | nada                                | 1    |
| 02  | portal/01-home\_\_desktop             | `/`                                                        | EXISTE        | B     | ROTA·CAMPO·INTEGRAÇÃO (B1–B3, B10)  | 2    |
| 03  | portal/01-home\_\_mobile              | `/`                                                        | EXISTE        | B     | ROTA·CAMPO·INTEGRAÇÃO (B1–B3, B10)  | 2    |
| 04  | portal/02-busca\_\_desktop            | `/alugar/[[...seg]]`                                       | EXISTE        | B     | CAMPO·REGRA (B1, B2, B4)            | 2    |
| 05  | portal/02-busca\_\_poucos             | —                                                          | AUSENTE       | C     | REGRA (B4)                          | 2    |
| 06  | portal/02-busca\_\_vazia              | ramo `total === 0` da busca                                | DENTRO        | B     | CAMPO·REGRA (B2, B4)                | 2    |
| 07  | portal/02-busca\_\_mobile             | `/alugar/[[...seg]]` (gaveta de filtros ausente)           | EXISTE        | C     | CAMPO·REGRA (B4)                    | 2    |
| 08  | portal/03-anuncio\_\_aluguel-desktop  | `/imovel/[slug]`                                           | EXISTE        | B     | CAMPO·REGRA (B1, B5)                | 2    |
| 09  | portal/03-anuncio\_\_bloco-venda      | BlocoValor em `/imovel/[slug]`                             | DENTRO        | B     | REGRA (B5)                          | 2    |
| 10  | portal/03-anuncio\_\_bloco-ambos      | BlocoValor em `/imovel/[slug]`                             | DENTRO        | B     | CAMPO (B5)                          | 2    |
| 11  | portal/03-anuncio\_\_mobile           | `/imovel/[slug]`                                           | EXISTE        | B     | CAMPO (B1, B5)                      | 2    |
| 12  | portal/04-indisponivel                | `/imovel/[slug]` · 410                                     | EXISTE        | B     | CAMPO·REGRA (B6)                    | 2    |
| 13  | portal/05-vitrine                     | `/imobiliaria/[slug]`                                      | OUTRO_CAMINHO | B     | ROTA·CAMPO (B7)                     | 2    |
| 14  | portal/06-alerta                      | `/alerta/confirmado`, `/alerta/cancelar`; criar na busca   | EXISTE        | C     | ROTA·REGRA·INTEGRAÇÃO (B8, B28)     | 2    |
| 15  | portal/07-mapa-do-site                | `/mapa-do-site`                                            | EXISTE        | B     | CAMPO·REGRA (B2, B9)                | 2    |
| 16  | portal/08-erro404                     | `not-found.tsx`                                            | EXISTE        | B     | CAMPO (B2)                          | 2    |
| 17  | portal/09-para-imobiliarias           | `/para-imobiliarias`                                       | EXISTE        | B     | ROTA (B11, D1)                      | 3    |
| 18  | portal/10-planos                      | `/planos`                                                  | EXISTE        | B     | decisão (D1)                        | 3    |
| 19  | portal/11-anunciar                    | `/anunciar`                                                | OUTRO_CAMINHO | B     | ROTA·REGRA (B11, B14, D1)           | 3    |
| 20  | portal/12-gestao-b2b                  | `/gestao`                                                  | OUTRO_CAMINHO | B     | decisão (D1)                        | 3    |
| 21  | portal/13-contato-estados             | FormContato em `/imovel/[slug]`                            | DENTRO        | B     | CAMPO·REGRA (B5)                    | 2    |
| 22  | portal/14-celular-secundarias         | rotas das telas 12, 13, 14, 18 e 16 (variante 390 ausente) | EXISTE        | C     | ROTA·CAMPO·REGRA (B2, B6–B8)        | 2    |
| 23  | conta/01-login                        | `/login`                                                   | EXISTE        | B     | nada                                | 3    |
| 24  | conta/02-cadastro-etapa1              | `/register?plano=`                                         | EXISTE        | B     | nada                                | 3    |
| 25  | conta/03-cadastro-etapa5              | `/register` (etapa 5)                                      | EXISTE        | B     | nada                                | 3    |
| 26  | conta/04-convite                      | `/convite?token=`                                          | OUTRO_CAMINHO | B     | CAMPO (B12)                         | 3    |
| 27  | conta/05-esqueci-senha                | `/esqueci-senha`                                           | EXISTE        | B     | nada (D6 para prometer e-mail)      | 3    |
| 28  | conta/06-redefinir-senha              | `/redefinir-senha?token=`                                  | EXISTE        | B     | nada                                | 3    |
| 29  | conta/07-conta-em-analise             | `/situacao-da-conta`                                       | OUTRO_CAMINHO | B     | CAMPO·REGRA (B13)                   | 3    |
| 30  | conta/08-conta-suspensa               | `/situacao-da-conta`                                       | OUTRO_CAMINHO | B     | CAMPO (B13)                         | 3    |
| 31  | conta/09-cadastro-mobile              | `/register` (etapa 3)                                      | EXISTE        | B     | nada                                | 3    |
| 32  | gestao/01-visao-geral                 | `/app`                                                     | EXISTE        | B     | CAMPO (B14)                         | 1    |
| 33  | gestao/02-upgrade-plano               | `/app/plano?modulo=`                                       | OUTRO_CAMINHO | B     | ROTA (B15)                          | 1    |
| 34  | gestao/03-publicar                    | diálogo em `/app/listings`                                 | EXISTE        | B     | INTEGRAÇÃO·CAMPO (B16, D1)          | 4    |
| 35  | gestao/04-publicar-bloqueado          | diálogo em `/app/listings`                                 | EXISTE        | B     | REGRA·CAMPO (B16)                   | 4    |
| 36  | gestao/05-valores-venda-exclusividade | —                                                          | AUSENTE       | C     | CAMPO·ROTA·REGRA (B17)              | 5    |
| 37  | gestao/06-negociacoes                 | `/app/vendas/negociacoes`                                  | EXISTE        | B     | CAMPO (B18)                         | 5    |
| 38  | gestao/07-pipeline-funis              | `/app/crm/pipeline`                                        | EXISTE        | B     | CAMPO (B18)                         | 4    |
| 39  | gestao/08-integracoes                 | `/app/admin/integrations`                                  | OUTRO_CAMINHO | B     | REGRA (B19, D1)                     | 4    |
| 40  | gestao/09-contrato-venda              | —                                                          | AUSENTE       | C     | ROTA·CAMPO·REGRA (B18)              | 5    |
| 41  | gestao/10-painel-vendas               | `/app/vendas`                                              | EXISTE        | B     | ROTA·CAMPO (B18)                    | 5    |
| 42  | gestao/11-gestao-mobile               | `/app` (negociação em gaveta)                              | EXISTE        | C     | nada                                | 5    |
| 43  | gestao/12-financeiro-split            | gaveta em `/app/charges`                                   | DENTRO        | C     | REGRA·CAMPO·ROTA (B20, D7)          | 4    |
| 44  | gestao/13-limite-contratos            | — (o 409 vira aviso genérico)                              | AUSENTE       | C     | ROTA (B15)                          | 4    |
| 45  | gestao/14-contrato-locacao-assinatura | `/app/contracts/[id]`                                      | EXISTE        | B     | REGRA·CAMPO (B21)                   | 4    |
| 46  | gestao/15-analise-cadastral           | `/app/screening/[id]`                                      | OUTRO_CAMINHO | C     | REGRA·CAMPO (B22)                   | 4    |
| 47  | gestao/16-fotos-legendas              | aba Mídia de `/app/properties/[id]`                        | DENTRO        | B     | CAMPO·ROTA·REGRA (B16, B23, D2, D3) | 4    |
| 48  | gestao/17-plano-e-uso                 | `/app/settings/plano`                                      | EXISTE        | B     | CAMPO·ROTA (B15)                    | 4    |
| 49  | gestao/18-plataforma-aprovacao        | `/plataforma/imobiliarias`                                 | OUTRO_CAMINHO | B     | CAMPO·REGRA (B24)                   | 4    |
| 50  | gestao/19-voz-captura-mobile          | `/app/properties/new-by-audio`                             | OUTRO_CAMINHO | C     | ROTA (B25, D3)                      | 5    |
| 51  | gestao/20-voz-processando-mobile      | estado de `/app/properties/new-by-audio`                   | DENTRO        | C     | REGRA·INTEGRAÇÃO (B25, D3)          | 5    |
| 52  | gestao/21-voz-revisao-desktop         | estado de `/app/properties/new-by-audio`                   | DENTRO        | C     | CAMPO·ROTA·INTEGRAÇÃO (B25, D3)     | 5    |
| 53  | cliente/01-entrar                     | `/portal/entrar`                                           | EXISTE        | B     | nada (defeito 1 é do front)         | 6    |
| 54  | cliente/02-link-enviado-expirado      | `/portal/entrar`                                           | EXISTE        | B     | nada (defeito 1)                    | 6    |
| 55  | cliente/03-inquilino-inicio           | `/inquilino`                                               | EXISTE        | B     | ROTA·CAMPO·REGRA (B20, B26)         | 6    |
| 56  | cliente/04-inquilino-pix              | Pix dentro de `/inquilino`                                 | DENTRO        | C     | nada (defeito 2)                    | 6    |
| 57  | cliente/05-inquilino-documentos       | cartão dentro de `/inquilino`                              | DENTRO        | C     | CAMPO·ROTA (B26)                    | 6    |
| 58  | cliente/06-proprietario-extrato       | `/proprietario`                                            | EXISTE        | B     | CAMPO·REGRA·ROTA (B20, B27)         | 6    |
| 59  | cliente/07-proprietario-desktop       | `/proprietario`                                            | EXISTE        | B     | CAMPO·INTEGRAÇÃO (B27)              | 6    |

---

## 4. Decisões do dono

### D1 · Portais parceiros — trava 7 telas (17–20, 22, 34, 39) e partes da 32 e da 38

O prompt novo fixa "portais parceiros integrados em todos os planos" e os prints mostram "Integrado" e
"Conectado". O código não tem adapter para Canal Pro, OLX nem Imovelweb
(`packages/integrations/src/channels/registry.ts:14-18`), e o ADR-097 decidiu, com base no
`AGENTS.md`, que a interface mostra o estado real. Hoje o portal já descumpre o ADR (defeito 3).

- **(a)** Manter o ADR-097: "Em preparação" e textos B2B sem promessa. As telas ficam iguais ao print
  exceto nesse selo e nessas frases.
- **(b)** Construir os adapters de feed como fase própria. "Conectado" aparece por imobiliária só
  depois que o portal parceiro lê o feed dela, e cada adapter fica `IMPLEMENTED_NOT_LIVE_VERIFIED` até
  a primeira leitura real. A fixture passa a reproduzir o "Conectado" do print sem mentir.

**Recomendação:** (a) agora, corrigindo o texto que está no ar; (b) se você quiser os parceiros de
verdade, como fase à parte com ADR próprio.

### D2 · Aviso de EXIF e GPS removidos (tela 47)

Nada remove metadado hoje: o upload vai direto ao storage por URL assinada, e a Onda 4 omitiu o aviso
de propósito (ADR-102).

- **(a)** Continuar sem o aviso.
- **(b)** Remover EXIF e GPS no worker depois do upload, reprocessando a imagem (`sharp@0.35.4` já
  está no lockfile, trazido pelo Next), e só então mostrar o aviso do print.

**Recomendação:** (b). É ganho de privacidade real e torna verdadeira a frase do print.

### D3 · IA sobre fotos: legenda sugerida (47), "Das fotos", placa de rua e descrição (50–52)

O ADR-104 permite enviar foto a provedor sem retenção para descrever o imóvel, com a mesma regra do
áudio, mas não há provedor de imagem contratado, o próprio áudio está desligado em produção e o
rascunho exclui de propósito o estado "das fotos" (`packages/contracts/src/property-draft.ts:61-62`).
A placa de rua sinalizada do print exige detectar placa, o que o sistema declara não fazer.

- **(a)** Omitir esses elementos nesta rodada (diferença aceita).
- **(b)** Interface com provedor de mentira, desligada em produção até contratar provedor de imagem
  com retenção zero — o mesmo padrão do áudio.

**Recomendação:** (a), até existir provedor de imagem contratado. **Aprovada (ADR-105).**

### D4 · Cidade aproximada por IP na Home (telas 02 e 03)

Não está implementada (`apps/portal/src/app/page.tsx:44` passa `cidadePadrao={null}`), e o proxy do
Cloudflare está desligado porque ligado quebra o HTTP-01 do Let's Encrypt — então não chega cabeçalho
de localização.

- **(a)** Ligar o proxy do Cloudflare com os cabeçalhos de localização do visitante e trocar o
  desafio do certificado para DNS-01 (mudança de operação).
- **(b)** Base local de geolocalização por IP no portal, com atualização mensal (dependência nova).
- **(c)** Só a camada no cliente, atrás de uma interface de provedor, sem fonte real: a Home segue
  genérica, que é um estado previsto no próprio `.dc.html` ("Não detectada").

**Recomendação:** (c) na Onda 2, com provedor de teste na fixture; a fonte real como decisão à parte
entre (a) e (b).

### D5 · Onde versionar o pacote de design

O pacote novo só existe na pasta de trabalho do checkout principal, sem commit — e esse checkout está
com o `main` local em `a6683bf`, bem atrás do remoto. O `design-source/achouimovel/` versionado é a
versão anterior, sem `SCREENS.md` e sem prints.

- **(a)** Atualizar `design-source/achouimovel/` com `SCREENS.md`, `prints/` (9,7 MB), README e PROMPT
  novos. É o caminho que o README do pacote pede, e telas, tokens e docs já estão lá idênticos.
- **(b)** Colocar na raiz de `design-source/`, como no seu checkout: mover o conteúdo de
  `achouimovel/` e decidir sobre `aluguei/`, `peg-product-design-system/` e `product/`, que o seu
  checkout apagou.

**Recomendação:** (a), sem `Design.zip`. É pré-requisito do lado a lado nos PRs (F1, F6).
**Aprovada e feita:** o pacote está em `design-source/achouimovel/` (ADR-105).

### D6 · Provedor de e-mail

Nenhum e-mail sai (`apps/api/src/email-outbox.ts:8-9`): convite, senha e confirmação de alerta ficam
na caixa de saída local. Consequência no ar: nenhum alerta é confirmado e a "Demanda por bairro" fica
vazia (defeito 15). Os prints 14, 27, 29, 33 e 48 prometem e-mail.

- **(a)** Manter só a caixa de saída, com textos sem promessa.
- **(b)** Contratar provedor e ligar um adapter sobre a caixa de saída que já existe,
  `IMPLEMENTED_NOT_LIVE_VERIFIED` até a chave real.

**Recomendação:** (b). O adapter e os testes podem ser feitos sem a chave.

### D7 · Regra do split e taxa de administração (telas 43, 58 e 59)

O print divide só o aluguel entre os proprietários, repassa condomínio e IPTU "às contas" e cobra 8%
de taxa. O domínio repassa ao proprietário tudo menos a comissão, condomínio incluído
(`packages/domain/src/finance/split.ts:18-31`), a taxa é fixa em 10% na criação da locação
(`apps/api/src/routes/leases.ts:328`) e o IPTU nem entra na cobrança
(`apps/api/src/routes/charges.ts:100-108`).

**Recomendação:** manter a regra do domínio até você decidir; tornar a taxa um campo da locação
(padrão 10%) e o IPTU parte da cobrança, que são lacunas independentes da regra do split.

---

## 5. Decisões técnicas desta rodada

Reversíveis; viram o ADR-105 no início da Onda 1.

**T1 · Quando o pacote se contradiz.** Precedência: regras do repositório (`AGENTS.md` e ADRs) →
valores e legenda do artboard no `.dc.html` (o print é a renderização dele) → `docs/HANDOFF.md` →
coluna Rota do `SCREENS.md`. A coluna Rota diverge da legenda do próprio artboard em 8 telas.

**T2 · Rotas.** Nenhuma rota do `SCREENS.md` que não for adotada ganha apelido: nenhuma delas foi
publicada ou enviada a alguém.

| Tela   | `SCREENS.md`                             | Decisão                                                                     | Motivo                                                                                      |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 04–07  | `/alugar/{uf}/{cidade}/{bairro}/{tipo}/` | manter `/alugar/[cidade-uf]/[bairro]/[tipo]/[n]-quartos`                    | ADR-099 e o exemplo do próprio `02-busca.dc.html:27`                                        |
| 08–12  | `/imovel/{slug}-{id}`                    | manter `/imovel/[slug]`                                                     | slug único no país com histórico (ADR-099)                                                  |
| 13     | `/anunciante/{slug}`                     | manter `/imobiliaria/[slug]`                                                | legenda `04-outras.dc.html:54`, HANDOFF e `PORTAL_SEO.md`; sitemap e canônica já no ar      |
| 19     | `/para-imobiliarias/anunciar/`           | mover `/anunciar` → `/para-imobiliarias/anunciar` com 301                   | legenda e HANDOFF pedem; o rodapé já aponta para ela e hoje dá 404                          |
| 20     | `/para-imobiliarias/gestao/`             | mover `/gestao` → `/para-imobiliarias/gestao` com 301                       | idem                                                                                        |
| 26     | `/convite/{token}`                       | manter `/convite?token=`                                                    | legenda `01-conta.dc.html:88`; os convites já enviados usam esse formato                    |
| 29, 30 | `/conta/em-analise`, `/conta/suspensa`   | manter `/situacao-da-conta`                                                 | legenda; uma rota para todos os estados, inclusive "recusada", que não tem print            |
| 33     | `/app/* fora do plano`                   | upgrade no lugar, na rota do módulo; `/app/plano` fica para links antigos   | print; ADR-095                                                                              |
| 39     | `/app/settings/integrations`             | manter `/app/admin/integrations`                                            | legenda `02-complementos.dc.html:24` e HANDOFF                                              |
| 40     | `/app/vendas/negociacoes/{id}/contrato`  | criar                                                                       | não existe                                                                                  |
| 42     | `/app (390)`                             | criar `/app/vendas/negociacoes/[id]` (página no celular; gaveta no desktop) | print                                                                                       |
| 43     | `/app/finance/charges`                   | criar `/app/charges/[id]`                                                   | legenda `03-ajustes.dc.html:29` e HANDOFF                                                   |
| 46     | `/app/credit`                            | manter `/app/screening/[id]`                                                | legenda, HANDOFF e o menu "Crédito"                                                         |
| 47     | `/app/properties/{id}/fotos`             | criar                                                                       | print (etapa 5 do cadastro)                                                                 |
| 49     | `/platform/tenants`                      | manter `/plataforma/imobiliarias`                                           | legenda, HANDOFF e ADR-060                                                                  |
| 50–52  | `/app/properties/new?modo=audio`         | manter `/app/properties/new-by-audio`; criar `/[draftId]` para retomar      | `/app/properties/new` é Focus Mode por caminho exato (`app-shell.tsx:24-29`); E2E existente |
| 56     | `/inquilino/cobrancas/{id}`              | criar                                                                       | print                                                                                       |
| 57     | `/inquilino/documentos`                  | criar                                                                       | print                                                                                       |

O portal não tem mecanismo de 301 fora de `/imovel` (`apps/portal/src/proxy.ts:16-18`); os dois
movimentos da tabela usam `redirects()` no `apps/portal/next.config.ts` e atualizam sitemap,
canônica e links internos no mesmo PR.

**T3 · Limiares da busca.** Valem os do ADR-099: 0 anúncio = vazia; 1–2 = poucos (`noindex, follow`);
≥ 3 indexa; ≥ 5 mostra estatística. O pacote traz três versões do limiar do estado "poucos" (`< 6` no
`SCREENS.md`, "menos de 3" na legenda e "menos de 5" numa nota); nenhuma muda o ADR.

**T4 · Tokens do portal.** O valor inline da tela prevalece. Os 8 pontos em que `tokens.css` diverge da
tabela do `00-identidade` (Anexo A, tela 01) passam a seguir a tabela.

**T5 · Captura para comparação.** Na largura do artboard (1440, 1040 ou 390), com escala 2 onde o print
foi exportado em 2x (celular e blocos). Artboards que são recorte ("só o que muda": 09, 10, 14, 21, 34,
35, 44, 45, 46) são comparados por elemento. Prints com vários quadros (07, 22, 42, 54) são montados
numa imagem com o mesmo vão do print. No painel, os artboards de 1040 correspondem à área de conteúdo,
então a janela precisa ser mais larga que 1040.

**T6 · Diferença aceita.** Só dado (nomes, contagens, datas) ou item de §7, anotado na coluna Notas do
checklist. `page.route` do Playwright só para produzir estados que o produto alcança (409, 429,
"enviando", carregando), nunca para mostrar dado que a API não entrega.

**T7 · Foto e data.** Os prints usam o marcador cinza "Foto do imóvel"; a implementação mostra esse
marcador quando não há foto. Áreas de foto e datas geradas no servidor são mascaradas na comparação.

**T8 · Ícones da gestão.** Desenhar os ícones do `Painel Sidebar.dc.html` (viewBox 16, traço 1.4) em
`packages/ui` no lugar dos Lucide (24, traço 1.6) usados no menu; falta o ícone `tag`.

**T9 · Menu igual ao `Painel Sidebar.dc.html`.** Sai o item "Painel de vendas" (o design só tem
Negociações em Vendas); o painel continua em `/app/vendas`, com link no cabeçalho de Negociações.

**T10 · Conta com o visual do portal dentro de `apps/web`.** Guton servida pelo próprio web por
`next/font/local` (a CSP é `font-src 'self' data:`, `apps/web/next.config.ts:14`) e tokens do portal
num escopo (`[data-tema="portal"]`) para não colidir com `--brand-*` da gestão (#037A4B × #41945D).

---

## 6. Fundação do laço de fidelidade

O prompt pede, para cada tela: ler o print e o trecho do `.dc.html`, codar, fotografar com Playwright
na mesma largura com os mesmos dados e salvar `docs/frontend/achouimovel-evidence/<área>/<tela>__impl.png`.
Hoje nada disso roda. A Onda 1 começa por aqui.

| #   | O que falta                                                                                                                                                                                                                   | Hoje                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Pacote de design no git (D5), para o PR mostrar print e implementação lado a lado.                                                                                                                                            | Só na pasta de trabalho do checkout principal.                                                                                              |
| F2  | Stack de E2E subindo o portal, com `API_BASE_URL` e `PORTAL_BASE_URL` locais; mesmo ajuste no job `e2e` da CI.                                                                                                                | `tests/e2e/scripts/stack.mjs` sobe PostgreSQL, API, worker e web; o portal só é testado no job `image`, pelo `robots.txt`.                  |
| F3  | Storage de teste na stack (adapter em disco atrás da interface de `packages/storage`, só com `ALLOW_FAKE_PROVIDERS=true`), para fotos, áudio e documentos — e para a regra de 5 fotos (B16).                                  | Sem storage na stack (`E2E/g3-d-registries.spec.ts:66`); `GET /public/media/:id` falha sem ele (`public-search.ts:199-200`).                |
| F4  | Fixture das telas: dados dos `renderVals()` criados pela API, com os helpers que já existem (`registerViaApi`, `seedLease`, `seedCoOwnedLease`, `outboxToken`, as negociações de `onda6-celular.spec.ts`) e os que faltam.    | Não há seed. Faltam helpers para imobiliária pendente, suspensa pela API, planos Anunciante/Gestão Locação/Gestão Vendas e modelo de venda. |
| F5  | Spec de evidência: um teste por tela (`@tela-NN`) com rota, janela, escala, recorte e máscara da coluna Captura do checklist, gravando o `__impl.png`; quadros múltiplos montados por uma página local, sem dependência nova. | Só `onda6-celular.spec.ts` fotografa, e para outra pasta.                                                                                   |
| F6  | `docs/frontend/achouimovel-evidence/COMPARACAO.md` gerado com print e implementação lado a lado, para o PR.                                                                                                                   | —                                                                                                                                           |
| F7  | Teste Playwright de privacidade do HTML do portal: sem rua, número, complemento, CEP, coordenada, proprietário nem `storage_key` (critério 4 do prompt).                                                                      | A garantia existe só nos testes de integração da API (`public-portal.test.ts`, `public-search.test.ts`).                                    |
| F8  | Relatório de cobertura de texto por tela (`scripts/design/`), incluindo os textos dos `renderVals()`. É relatório, não portão.                                                                                                | O script desta Onda 0 ficou fora do repositório e ignora os `renderVals()`.                                                                 |
| F9  | Base visual do portal: `font` no lugar de `font-size` (defeito 14); miolo de 1312px com margem de 64 em 1440, 48 em 1040 e 18 em 390; vãos entre seções de 72–88; links verdes sublinhados; nenhuma caixa alta.               | Miolo de 1208px em x=116 (medido), margem `clamp(18px, 4vw, 36px)`, vão de 104, `a{color:inherit}`, caixa alta em `telas.css:651,745,827`.  |

---

## 7. Diferenças que o repositório impõe aos prints

Onde o print afirma algo que o produto não faz, a tela segue o produto. Essas diferenças são aceitas na
comparação e anotadas no checklist.

| Telas                      | O print mostra                                                                        | O produto mostra                                        | Regra                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 17–20, 22, 34, 39; 32 e 38 | parceiros "Integrado"/"Conectado"; fila "OLX recusou"; origens Canal Pro e OLX        | estado real, até D1                                     | `AGENTS.md`, ADR-097                                                         |
| 06, 09, 10                 | alerta e contato sem consentimento ou sem telefone                                    | consentimento LGPD e telefone mantidos                  | `packages/contracts/src/public-portal.ts:57-63,93`                           |
| 04                         | chip "Até R$ 3.000" numa página indexável                                             | faixa de preço em query string, `noindex`               | ADR-099                                                                      |
| 12                         | "Já foi alugado" e "valor total próximo de R$ 2.910"                                  | só o que a API sabe, até B6                             | nenhum fato inventado                                                        |
| 21                         | "costuma responder no mesmo dia"                                                      | sem a frase                                             | não há métrica de resposta                                                   |
| 27                         | "você vai receber", "o link vale por 1 hora"                                          | "registramos", 30 minutos                               | sem provedor (D6); `PASSWORD_RESET_TTL_MINUTES = 30`                         |
| 29, 30                     | "você recebe um e-mail", "cadastre imóveis como rascunho", "os anúncios saíram do ar" | sem as promessas; "saíram do AchouImóvel"               | ADR-060; os parceiros não são despublicados                                  |
| 33, 44, 48                 | "Você recebe a confirmação por e-mail"                                                | sem a frase, até D6                                     | sem provedor                                                                 |
| 36, 51                     | aviso 15 dias antes; "avisamos quando estiver pronto"                                 | sem a promessa até existir o aviso                      | ADR-102                                                                      |
| 46                         | "as regras usam só os dados informados na candidatura"                                | texto fiel ao que decide (hoje o FAKE usa score do CPF) | ADR-102                                                                      |
| 47, 50–52                  | EXIF removido, legenda sugerida, "Das fotos", placa de rua, descrição sugerida        | sem esses elementos, até D2 e D3                        | ADR-102, ADR-104                                                             |
| 49                         | "CNPJ · Validado", "CRECI · ok"                                                       | só o que foi conferido                                  | `AGENTS.md`                                                                  |
| 53, 54                     | "Enviamos um link", "Confira seu WhatsApp"                                            | "pedido registrado", sem canal                          | regra da Onda 6 (`packages/db/drizzle/0034_portal_access_link_outbox.sql`)   |
| 56                         | "em até 1 minuto"                                                                     | sem prazo                                               | sem evidência                                                                |
| 58, 59                     | "Crédito em 10/10/2026 · Banco…", "Pago"                                              | "previsto"                                              | o repasse não é executado (`apps/api/src/finance/settlement.ts:255,264,280`) |

---

## 8. Ondas desta rodada

Um PR por onda, sempre com base `main` (PR empilhado não chega ao `main`). Onda com backend pesado pode
virar dois PRs — A (contrato, domínio, rota, migration) e B (telas) —, ambos com base `main`.

**Correções no ar (antes da Onda 1).** Defeitos 1, 2, 3, 5 a 12, 16 e 17 de §2, cada um com teste que
falha antes. Arquivos: rotas BFF em `apps/web/src/app/api/portal/**`, `apps/portal/src/app/b2b-conteudo.ts`,
`apps/portal/src/lib/planos.ts`, `apps/web/src/app/proprietario/page.tsx`, `apps/web/src/app/inquilino/page.tsx`,
`apps/portal/src/app/alerta/cancelar/page.tsx`, `apps/portal/src/app/actions.ts`,
`apps/web/src/app/app/listings/dialogo-publicacao.tsx`, `apps/api/src/routes/{leads,sale-negotiations,auth,organizations}.ts`,
`packages/integrations/src/channels/registry.ts`.

**Onda 1 · fundação — telas 01, 32 e 33.**

- Laço de fidelidade: F1 a F8.
- Portal: F9; componentes base com as variantes que as telas pedem — ImovelCard (listagem sem
  imobiliária nem selo, compacto, parecido; "total/mês", "Cond.", m² na venda, atributos na ordem
  área · quartos · suítes · vagas), SiteHeader (5 variantes: consumidor, só logo, B2B, "←/Salvar" do
  anúncio, item ativo), Segmentado preenchido, Breadcrumb dentro da faixa, AlertaImovel em 4 formas,
  SiteFooter com acordeão no celular e os novos FiltrosLaterais, GavetaFiltros e Ordenacao; nomes
  "Kitnet e studio" e "Sala e loja"; `/dev/componentes` com todos os estados (tela 01).
- Gestão: menu igual ao `Painel Sidebar.dc.html` (diff no Anexo A, T8, T9); upgrade no lugar (tela 33)
  com `details` no `ApiClientError` (defeito 13) e o pedido de troca de plano (B15); Visão Geral
  (tela 32) com a fila, a demanda e os contadores (B14); `AvisoModoTeste` nas três variantes dos prints;
  primitivos que faltam em `packages/ui` (barra de progresso; Modal de 460 e 520; `Switch` em uso).
- Backend: B14, B15, B29; B28 se D6 = (b).
- Depende de: D5.

> **Andamento (30/09/2026).** 1A (laço de fidelidade) e 1B (base visual do portal) implantadas;
> 1B2 (componentes base do portal e tela 01) no PR #56; **1C-A** (backend do upgrade: B15 — pedido de
> troca de plano, fila da plataforma e data de entrada no plano — e o defeito 13, `details` no
> cliente do painel) no PR seguinte. Ficam para a **1C-B**, junto com as telas 32 e 33: B14 (campos da
> Visão Geral), o menu (T8, T9) e o upgrade no lugar do "sem permissão". Depois, 1D (e-mail, D6) e
> B29 (storage de teste).

**Onda 2 · portal público — telas 02 a 16, 21 e 22.**

- Backend: B1 a B10.
- Telas: Home, Busca (com anúncios, poucos, vazia e celular com gaveta), Anúncio (aluguel, venda, os
  dois e celular), 410, Vitrine, Alerta (modal, confirmado, cancelar com confirmação), Mapa do site,
  404, estados do FormContato e a versão 390 das secundárias — o quadro de Planos dessa tela só fica
  conferido depois da Onda 3.
- Depende de: Onda 1; D4 (a camada no cliente entra sem a fonte real).

**Onda 3 · B2B e conta — telas 17 a 20 e 23 a 31.**

- Backend: B11 (se D1 = b), B12, B13; `redirects()` do portal (T2).
- Telas: páginas B2B e Planos com o estado real dos parceiros; moldura da conta com o visual do portal
  (T10) e as 9 telas.
- Depende de: Onda 1; D1.

**Onda 4 · gestão, ajustes — telas 34, 35, 38, 39 e 43 a 49.**

- Backend: B16, B19, B20, B21, B22, B23, B24.
- Telas: diálogo de publicação e bloqueios, pipeline, integrações, detalhe da cobrança com split,
  diálogo de limite, envelope, análise cadastral com a lista de regras, fotos e legendas, plano e uso,
  fila da plataforma.
- Depende de: Onda 1; D1, D2, D3, D7.

**Onda 5 · gestão, telas novas — telas 36, 37, 40, 41, 42 e 50 a 52.**

- Backend: B17, B18, B25.
- Telas: cadastro em etapas com Valores — as 7 etapas precisam de definição; proposta: finalidade e
  tipo · endereço · características · valores · fotos e legendas · proprietários · revisão e publicação
  —, Negociações, contrato de venda, painel de vendas, celular (Visão Geral e negociação) e as três
  telas do cadastro por voz.
- Depende de: Onda 4 (fotos e publicação); D3.

**Onda 6 · área do cliente — telas 53 a 59.**

- Backend: B26, B27.
- Telas: moldura comum da área do cliente (quatro variantes de topo de 56px), as 7 telas e as rotas
  novas `/inquilino/cobrancas/[id]` e `/inquilino/documentos`.
- Depende de: Onda 1; correções 1, 2, 5 e 7.

Paralelismo: depois da Onda 1, as Ondas 2 e 4 podem correr juntas, e as Ondas 3 e 6 também; a Onda 5
vem depois da 4.

---

## 9. Lacunas de backend consolidadas

| #   | Lacuna                                                                                                                                                                                                                                                                                     | Telas              | Tipo                        | Onda |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------- | ---- |
| B1  | Imóvel público: `suites` (não existe no domínio), `furnished` e `petsAllowed` nos DTOs públicos (existem em `packages/contracts/src/property.ts:43-44`, fora de `publicListingCardSchema`).                                                                                                | 01, 04, 08, 11, 13 | CAMPO                       | 2    |
| B2  | Nome legível, com acento, de cidade e bairro em `/public/search`, `/public/sitemap` e nos cards (hoje o portal monta a partir do slug: "Goiania, GO").                                                                                                                                     | 02–06, 15, 16, 22  | CAMPO                       | 2    |
| B3  | Agregados nacionais da Home: contagem por tipo × finalidade, recentes e "ver todos" sem cidade, mediana por cidade em lote (a busca exige `city`).                                                                                                                                         | 02, 03             | ROTA                        | 2    |
| B4  | Busca: facetas por tipo e característica; filtros mobiliado, pet, vaga e suíte; mediana do aluguel; mediana por quartos fora do filtro de quartos; vizinhos por tipo, quartos e proximidade; sugestões do estado vazio.                                                                    | 04–07              | CAMPO·REGRA                 | 2    |
| B5  | Anúncio: mediana por tipo e quartos com o n; mediana do m² na venda; contagem de anúncios da imobiliária e do bairro; WhatsApp verificado da imobiliária; interesse do lead (alugar, comprar, os dois); celular com DDD.                                                                   | 08–11, 21          | CAMPO·REGRA                 | 2    |
| B6  | 410 com tipo, finalidade, total, capa e slugs; parecidos por tipo e valor próximo; ordem determinística em `loadCards` (`public-cards.ts:112-116`); alugado × vendido.                                                                                                                     | 12, 22             | CAMPO·REGRA                 | 2    |
| B7  | Vitrine: leitura pública por imobiliária — perfil, logo, cidade, contagens por finalidade e tipo, paginação (hoje varre o sitemap e lê 12 por cidade).                                                                                                                                     | 13, 22             | ROTA·CAMPO                  | 2    |
| B8  | Alerta: leitura pelo token sem efeito; cancelar por POST; reenviar confirmação; critérios nas respostas; link absoluto no e-mail; aviso de imóvel novo com frequência (nenhum job lê `search_alerts`).                                                                                     | 14, 22             | ROTA·REGRA                  | 2    |
| B9  | Sitemap e mapa do site: recortes cidade → tipo e com modificador (`hasModifier` é sempre falso).                                                                                                                                                                                           | 15                 | REGRA                       | 2    |
| B10 | Cidade aproximada por IP: interface de provedor e rota para a camada no cliente (D4).                                                                                                                                                                                                      | 02, 03             | INTEGRAÇÃO                  | 2    |
| B11 | Estado público dos canais, para as páginas B2B dizerem o estado real (D1).                                                                                                                                                                                                                 | 17–20, 22          | ROTA                        | 3    |
| B12 | Convite: nome de quem convidou no `describe` (`invited_by_user_id` existe); aceite pedindo só a senha é decisão, porque o contrato exige `name`.                                                                                                                                           | 26                 | CAMPO                       | 3    |
| B13 | Situação da conta: plano pedido e data da mudança no `/auth/me` (as colunas existem); verificação de CNPJ e CRECI por item (não existe); canal de suporte (dono).                                                                                                                          | 29, 30             | CAMPO·REGRA                 | 3    |
| B14 | Painel: fila com lead, proposta, vistoria e falha de canal (código, motivo, data); "reservados"; recorte semanal; demanda por tipo e quartos; contadores do menu; papel "Gestor".                                                                                                          | 19, 32, 42         | CAMPO                       | 1    |
| B15 | Plano: pedido de troca de plano pela imobiliária (rota e fila no admin); data de entrada no plano (hoje devolve a criação da imobiliária); `details` no front.                                                                                                                             | 33, 44, 48         | ROTA·CAMPO                  | 1    |
| B16 | Publicação: ≥ 5 fotos públicas, bairro e CRECI em `publishBlockers`, com a lista de verificações (ok, falha, detalhe, ação); publicar nos canais marcados; código e bairro no resumo do imóvel; rótulos dos 8 tipos.                                                                       | 34, 35, 47         | REGRA·CAMPO                 | 4    |
| B17 | Cadastro: aceita financiamento; documento da exclusividade; sugestão de preço pela mediana autenticada com n ≥ 5; aviso de fim da exclusividade; etapas do cadastro.                                                                                                                       | 36                 | CAMPO·ROTA·REGRA            | 5    |
| B18 | Vendas: último evento, prazo e contrato na lista; filtro por responsável; fechamentos e comissão por corretor no período e no trimestre; negociação ↔ contrato; linha do tempo do envelope; PDF; lembrete; intermediadora e testemunha; sinal e financiamento; contrato também sob VENDAS. | 37, 38, 40, 41     | ROTA·CAMPO·REGRA            | 5    |
| B19 | Integrações: a tela não pode cair quando `/meta` (MARKETING) ou `/whatsapp` (ATENDIMENTO) dão 403; contas de portal por imobiliária (D1).                                                                                                                                                  | 39                 | REGRA                       | 4    |
| B20 | Financeiro: IPTU na cobrança; taxa de administração por locação; código da locação; prévia do split pelo domínio; baixa manual sem provider; regra do split (D7).                                                                                                                          | 43, 55, 58         | REGRA·CAMPO·ROTA            | 4    |
| B21 | Contrato de locação: fiador como signatário; papel da imobiliária.                                                                                                                                                                                                                         | 45                 | REGRA·CAMPO                 | 4    |
| B22 | Análise cadastral: regras da candidatura calculadas no servidor e expostas como lista (renda ≥ 3× o total, consentimento, documentos, restrição "em breve"); renda declarada; versão do termo LGPD.                                                                                        | 46                 | REGRA·CAMPO                 | 4    |
| B23 | Fotos: `isPublic` editável; prévia autenticada; contador pela mesma função do portão; EXIF (D2); legenda por IA (D3).                                                                                                                                                                      | 47                 | CAMPO·ROTA·REGRA            | 4    |
| B24 | Plataforma: cidade e UF da imobiliária; CNPJ validado por dígito; conferência de CRECI registrada.                                                                                                                                                                                         | 49                 | CAMPO·REGRA                 | 4    |
| B25 | Cadastro por voz: fotos no rascunho; processamento assíncrono por etapa; autor e tempo dos trechos; leitura do áudio; chaves novas (decisão de PII).                                                                                                                                       | 50–52              | ROTA·CAMPO·INTEGRAÇÃO       | 5    |
| B26 | Inquilino: resumo da locação; composição da cobrança; telefone da imobiliária; cobrança por id; número, duração, partes e PDF do contrato assinado.                                                                                                                                        | 55–57              | ROTA·CAMPO                  | 6    |
| B27 | Proprietário: bruto, taxa, imóvel e data por linha; conta bancária mascarada; data prevista do repasse; despesas descontadas (não existem no domínio); PDF do extrato; execução do repasse (hoje nasce pendente).                                                                          | 58, 59             | CAMPO·REGRA·ROTA·INTEGRAÇÃO | 6    |
| B28 | Provedor de e-mail sobre a caixa de saída (D6).                                                                                                                                                                                                                                            | 14, 27, 29, 33, 48 | INTEGRAÇÃO                  | 1    |
| B29 | Storage de teste na stack de E2E (F3).                                                                                                                                                                                                                                                     | 13, 35, 47, 50–52  | INFRA                       | 1    |

---

## 10. Riscos

- **R1 · Volume.** 43 telas B e 15 C é refazer o visual de quase todo o front, com 29 lacunas de
  backend. Cada onda com backend pesado vira dois PRs com base `main`.
- **R2 · Régua de publicação.** B16 muda o comportamento no ar (5 fotos, bairro, CRECI) e quebra cerca
  de 12 fixtures que publicam sem foto ou sem CRECI (`E2E/g2-b2-support.ts:58-75`,
  `tests/integration/src/public-portal.test.ts` e outros). Anúncio já publicado não sai do ar: a régua
  vale na publicação. Ajustar as fixtures, sem remover teste.
- **R3 · Comparação subjetiva.** Contagens e datas dos prints não são reproduzíveis. Sem a diferença
  anotada por tela, "conferida" vira opinião — por isso a coluna Notas e o `COMPARACAO.md`.
- **R4 · Pacote contraditório.** Rotas, limiares, tabela de tokens × CSS e contagens incoerentes nos
  próprios prints (37 e 38) — T1 resolve; o que sobrar vai para o PR da onda.
- **R5 · Testes presos aos textos atuais.** Atualizar no mesmo PR, nunca remover:
  `E2E/platform-admin.spec.ts`, `main-journey.spec.ts`, `g3-d-registries.spec.ts`,
  `g2-b1-support.ts`, `g2-b2-portal-access.spec.ts`, `g3-e-portal-inbox-inspection.spec.ts`,
  `g2-b1-logout.spec.ts`, `g2-b1-navigation.spec.ts` (`.dash-summary`, "Reservados"),
  `g2-b1-dialog-focus.spec.ts`, `g2-b2-application-channel-archive.spec.ts`,
  `onda6-celular.spec.ts`, `cadastro-por-audio.spec.ts`; e os de unidade `plan-modules.test.ts` e
  `plano-bloqueado.test.tsx`.
- **R6 · Guton no `apps/web`.** Licença para produção pendente; a fonte precisa ser servida pelo
  próprio web; colisão de tokens resolvida por escopo (T10).
- **R7 · Provedor de e-mail.** As decisões foram aprovadas (ADR-105), mas enquanto o provedor não for
  contratado (D6) a "Demanda por bairro" segue vazia no ar.
- **R8 · Pacote fora do git.** Resolvido: o pacote está em `design-source/achouimovel/` (D5).

---

## 11. Pendências do dono

1. Textos de Termos de uso e Política de privacidade (defeito 4) — o portal coleta dados pessoais sem
   eles no ar.
2. Decisões D1 a D7: aprovadas em 30/09/2026 (ADR-105). Continuam com o dono contratar o provedor de
   e-mail (D6) e, se quiser os portais parceiros de verdade, abrir a fase dos adapters (D1 b).
3. CNPJ e razão social do rodapé; logos dos portais parceiros; perfis das redes sociais.
4. Licença da fonte Guton para produção, agora também nas telas de conta.
5. Canal de suporte para a conta suspensa (tela 30).
6. Preços dos planos: mantido "Fale com a gente" (decisão de 29/09/2026).
7. Já registradas: credenciais de sandbox do G4 e Search Console.

---

## 12. Pronto por onda

1. Todas as telas da onda "conferidas com print" no checklist, com o `__impl.png` salvo e a diferença
   só de dado ou listada em §7.
2. Estados vazio, carregando, erro e sem permissão onde a tela tem dados.
3. Contraste 4,5:1, foco visível, alvos de toque ≥ 44px no celular e `prefers-reduced-motion`.
4. Portal: o teste de privacidade do HTML (F7) verde.
5. Estatística só com amostra ≥ 5; recurso em teste sempre com `AvisoModoTeste` vindo de
   `GET /capabilities`.
6. Nenhum `force-dynamic` em página pública (hoje só `robots.ts` e `sitemap.ts`, que são rotas).
7. Os 9 gates com exit 0 sem cache; `test:pg` e Playwright sem teste removido ou pulado; migrations
   geradas pelo drizzle.
8. PR com base `main`, resumo, `COMPARACAO.md` e a lista do que depende do dono;
   `docs/EXECUTION_STATE.md` atualizado.

---

## 13. Método, evidência e limites

- **Inventário por script**: rotas (`page.tsx`) das duas apps; 235 endpoints da API com método,
  caminho e `arquivo:linha`; componentes; contratos.
- **Pacote**: comparação byte a byte (`cmp`) de 38 arquivos com o `design-source/achouimovel/`
  versionado; tamanho e escala dos 59 PNG; largura e altura de cada artboard; as 58 âncoras conferidas.
- **Cobertura de texto**: dos trechos das 58 âncoras saem 744 textos literais; 354 (48%) aparecem
  idênticos no código, 19 diferem só em caixa ou acento e 371 faltam. Portal 49%, conta 66%, gestão
  40%, cliente 39%. É tendência, não nota: conta dado de exemplo e anotação do designer como texto,
  ignora os textos dos `renderVals()` (menus, listas de regras) e casa por substring em qualquer
  arquivo do app.
- **Leitura tela a tela** (Anexo A): cinco leitores em paralelo — portal 01–11, portal 12–22, conta e
  área do cliente, gestão 32–42, gestão 43–52 —, cada um com o print, o trecho do `.dc.html` e o
  código; medições de CSS no Chromium headless, sem rede.
- **Reconferido pelo orquestrador**: os 17 defeitos de §2 no código, e os defeitos 1, 2, 3, 4 e 6 em
  produção por GET.
- Sem build, teste, servidor de desenvolvimento ou alteração de código.

---

## Anexo A — diagnóstico tela a tela

Abreviações de caminho: `P/` = `apps/portal/src/` · `W/` = `apps/web/src/` · `A/` =
`apps/api/src/routes/` · `C/` = `packages/contracts/src/` · `D/` = `packages/domain/src/` · `E2E/` =
`tests/e2e/src/`. "Falta no backend" usa NADA · CAMPO · ROTA · REGRA · INTEGRAÇÃO · DECISÃO; a
distância, A · B · C (§3).

### Portal

#### 01 · portal/00-identidade — marca, tokens, cores por tipo, componentes base

- **Rota**: sem rota no `SCREENS.md` · hoje `/dev/componentes` (`P/app/dev/componentes/page.tsx`,
  `catalogo-client.tsx`), 404 em produção (`page.tsx:15-17`) · OUTRO_CAMINHO.
- **Componentes**: Logotipo, BlocoGrade, ImovelCard, Botao, Campo, CheckboxLgpd, Chip, Segmentado,
  Breadcrumb, Gaveta, Acordeao, EstadoVazio, SiteHeader, SiteFooter (`catalogo-client.tsx:4-20`).
- **API**: nenhuma; dados locais (`catalogo-client.tsx:29-72`).
- **Falta no backend**: NADA nesta tela (os campos do card pesam nas telas 04 e 08).
- **Distância A**: `P/styles/tokens.css` tem os valores de `tokens/achouimovel-portal.css`, e a Guton
  do portal é o mesmo arquivo do pacote. A tabela do print diverge do CSS em 8 pontos: h1-home 1.1 ×
  1.08; h1 1.08 × 1.06; price-xl até 52 × 48; price-card 18–20 × 20; `--type-card-title` inexistente;
  body 15–16,5 × 16; label 11,5–12 × 12; `--portal-radius*` e `--radius-avatar`. ImovelCard fora da
  anatomia: selo "Aluguel/Venda" × "Alugar/Comprar"; "/mês" sem "total"; "condomínio" × "Cond."; sem
  m² na venda; "ambos" repete encargos; ordem dos atributos (`P/components/ImovelCard.tsx:38-94`).
  "Kitnet/studio" e "Sala/loja" (`P/lib/tipos.ts:58,70`) × "Kitnet e studio" e "Sala e loja".
- **Fixture**: os dados de `00-identidade.dc.html:317-321` no lugar das constantes do catálogo.
- **Regra**: caixa alta proibida em `P/styles/telas.css:651,745,827`.

#### 02 · portal/01-home\_\_desktop — Home nacional (1440)

- **Rota**: `/` (`P/app/page.tsx`, `P/app/home-dados.ts`) · EXISTE.
- **Componentes**: SiteHeader, SearchHero, MosaicoTipos (`P/components/busca.tsx:227-248`),
  ImovelCard, EstadoVazio, SiteFooter; faltam FaixaAlerta, a grade de cidades com mediana, as buscas
  populares em 3 colunas e as abas Para alugar/À venda.
- **API**: `GET /public/sitemap` (`A/public-portal.ts:324`; `C/public-portal.ts:101-114`);
  `GET /public/search` (`A/public-search.ts:38`; `C/public-search.ts:26,39,92`), chamado só para a
  cidade com mais estoque (`home-dados.ts:61`); `GET /public/media/:id`.
- **Falta no backend** (ROTA·CAMPO·INTEGRAÇÃO): B3 (a busca exige `city`, então o mosaico conta os 12
  itens da primeira página de uma cidade — `home-dados.ts:61-73`); B2 (nome montado do slug,
  `home-dados.ts:51`); B10; B1.
- **Distância B**: H1 fixo "Ache onde morar, em qualquer cidade do Brasil" (`page.tsx:38`) a 16px ×
  52px; SearchHero com 2 `<select>` × 4 campos (Cidade, Bairro, Tipo, Valor total até); miolo de
  1208px em x=116 × 1312px em x=64; "Publicados recentemente" com até 8 cards × 4 e abas; sem a faixa
  do alerta; cidades em lista × grade de 4 colunas com mediana; rodapé sem "Como funciona →",
  preferências de cookies, cancelar alerta, redes e versão.
- **Fixture**: `01-home.dc.html:216-229` — tipos 312/148/64/37/91/22/45; 4 recentes (Setor Bueno
  2.910, Pinheiros 3.450, Savassi 1.340, Barra da Tijuca 6.180); 12 cidades; 12 buscas.
- **Regra**: a cidade por IP é camada no cliente sem tornar "/" dinâmica (`docs/frontend/PORTAL_SEO.md:145-149`);
  CNPJ e redes só com o dado real; "mais populares" sem métrica de popularidade é decisão de rótulo.

#### 03 · portal/01-home\_\_mobile — Home (390)

- **Rota**: `/` responsiva · EXISTE. **Componentes e API**: os da 02; cabeçalho móvel em
  `P/components/SiteHeader.tsx:45-81`.
- **Falta no backend**: a da 02.
- **Distância B**: "Anunciar imóvel" espremido na coluna de 44px (`SiteHeader.tsx:79-81`) × ícone de
  busca; mosaico em grade de 2 × 176px (`telas.css:290-294`) × carrossel com scroll-snap de 128px;
  faltam "Para alugar ou comprar, com o valor total do mês antes de você clicar.", "Total até" e
  "Buscar imóveis"; rodapé aberto com a marca por último × marca primeiro e acordeão.
- **Fixture**: a da 02, com 2 cards e 6 cidades.

#### 04 · portal/02-busca\_\_desktop — listagem com filtros, ordenação, paginação, texto e FAQ

- **Rota**: `/alugar/[[...seg]]` e `/comprar/[[...seg]]` → `P/app/(busca)/busca-pagina.tsx`, formato
  `/alugar/[cidade-uf]/[bairro]/[tipo]/[n]-quartos` (`P/lib/rotas.ts:5-13`) · EXISTE (T2).
- **Componentes**: SiteHeader na cor do tipo, FaixaTipo, Breadcrumb, ChipsFiltro, ImovelCard,
  EstadoVazio, Paginacao, ResumoPreco, BairrosProximos, LinksModificadores, FaqCalculado, AlertaImovel,
  SiteFooter (`busca-pagina.tsx:178-243`); faltam FiltrosLaterais e Ordenacao.
- **API**: `GET /public/search` (`C/public-search.ts:26-37,70-104`); `POST /public/alerts`
  (`A/public-portal.ts:244`). `order` e `maxPriceCents` existem e a página não envia
  (`busca-pagina.tsx:71-78`).
- **Falta no backend** (CAMPO·REGRA): B4 — facetas (48/12/3/2/9/4/7; 11/19/44/27), filtros por
  característica, mediana do aluguel ("R$ 2.150"), mediana por quartos fora do filtro
  (`A/public-search.ts:42-53,100-111`), vizinhos pelo tipo e pela proximidade (hoje os de maior estoque
  da cidade, `:118-151`); B1; B2.
- **Distância B**: coluna única × aside de 280px (finalidade, tipo com contagem, quartos, valor com
  slider, características, "Limpar tudo", "Ordenar"); H1 da faixa a 16px × 44px/800 e trilha branca
  dentro da faixa; resumo depois dos cards × faixa de 3 colunas acima; 4 colunas de card × 3; paginação
  "Página 1 de 4" × numerada; fim da página em coluna única × duas colunas e FAQ com uma aberta; a FAQ
  escreve "um casa" (`busca-pagina.tsx:100-137`).
- **Fixture**: `/alugar/goiania-go/setor-bueno/apartamento/2-quartos`, 48 anúncios, mediana 2.720,
  faixa 1.890–4.650, 6 cards de `02-busca.dc.html:251-258`, vizinhos de Setor Marista (21/3.240) a
  Setor Pedro Ludovico (6/1.960).
- **Regra**: chip "Até R$ 3.000" em página indexável contraria o ADR-099 (§7).

#### 05 · portal/02-busca\_\_poucos — poucos resultados e bairros vizinhos

- **Rota**: estado da busca sem ramo próprio (`busca-pagina.tsx:208-219` só separa o total 0) ·
  AUSENTE.
- **API**: `GET /public/search` (estatística nula abaixo de 5, `D/portal/indexing.ts:46-48,60-63`);
  `POST /public/alerts`.
- **Falta no backend** (REGRA): vizinhos filtrados pelo tipo do recorte (`A/public-search.ts:118-128`
  ignora) — B4.
- **Distância C**: com 2 anúncios cai no layout completo, com paginação e FAQ genérica
  (`busca-pagina.tsx:124-135`); o print tem 2 cards, vizinhos com "—" e "amostra pequena" e a caixa de
  340px "Poucas opções agora" com borda de 2px.
- **Fixture**: `/alugar/goiania-go/setor-sul/kitnet-studio` com 2 anúncios (1.180 e 1.390); vizinhos
  só de kitnet.
- **Regra**: T3.

#### 06 · portal/02-busca\_\_vazia — estado vazio e alerta (noindex)

- **Rota**: ramo `total === 0` (`busca-pagina.tsx:208-212`) · DENTRO.
- **API**: `GET /public/search` (`noindex` com 0, `A/public-search.ts:153-165`); `POST /public/alerts`.
- **Falta no backend** (CAMPO·REGRA): sugestões de recortes vizinhos com estoque (4 botões) — B4; B2.
- **Distância B**: H1 com "0 apartamentos…" (`P/lib/seo.ts:69-88`) × sem contagem; EstadoVazio com
  outro texto e sem os 4 botões; alerta empilhado × caixa lateral de 340px; FAQ genérica presente.
- **Fixture**: `/comprar/goiania-go/setor-bueno/apartamento/4-quartos` com 0 e estoque para as 4
  sugestões.
- **Regra**: o consentimento fica (§7).

#### 07 · portal/02-busca\_\_mobile — busca (390) com gaveta de filtros

- **Rota**: a da 04, responsiva · EXISTE (lista); a gaveta de filtros não existe.
- **Componentes**: os da 04; `P/components/Gaveta.tsx` existe e só serve ao menu.
- **Falta no backend**: B4; "Ver 48 imóveis" ao vivo exige recontar no servidor do portal, porque o
  navegador não fala com a API (`P/lib/api.ts:9-12`); carrossel de fotos no card é DECISÃO (o card só
  tem `coverPath`).
- **Distância C**: faltam a barra "Filtros 3 · Mais recentes ▾" e a gaveta inteira ("Limpar",
  finalidade, quartos, tipo com contagem, "Ver 48 imóveis"); resumo compacto acima; a faixa mantém a
  grade de 56px no celular porque o `--bloco-grade` inline vence a media query de `tokens.css:91-95`
  (o print usa 40px).
- **Fixture**: a da 04, com 3 filtros ativos.

#### 08 · portal/03-anuncio\_\_aluguel-desktop — anúncio de aluguel

- **Rota**: `/imovel/[slug]` (`P/app/imovel/[slug]/page.tsx`; 301 e 410 em `P/proxy.ts:14-60`) · EXISTE
  (T2).
- **Componentes**: GaleriaImovel, CabecalhoAnuncio, AtributosImovel, DescricaoImovel, Caracteristicas,
  LocalBairro, ComparacaoMediana, AnuncianteInfo, BlocoValor (`P/components/anuncio.tsx`), FormContato,
  ImovelCard parecido, barra móvel (`page.tsx:171-178`); faltam BotaoWhatsApp, Compartilhar, Salvar e
  "Ver as 12 fotos".
- **API**: `GET /public/listings/:slug` (`A/public-portal.ts:55`; `C/public-portal.ts:11-33`);
  `POST /public/listings/:slug/leads` (`:167`; `C/public-portal.ts:51-63`); `GET /public/media/:id`.
- **Falta no backend** (CAMPO·REGRA·DECISÃO): B1; B5 — WhatsApp verificado (existe em
  `whatsapp_connections`, fora do DTO), contagens da imobiliária (23) e do bairro (86), mediana por
  tipo e quartos com n (hoje por bairro e finalidade, sem n, `A/public-portal.ts:126-140,155`), UF do
  CRECI; mapa do bairro e "Salvar" são decisão.
- **Distância B**: galeria capa + miniaturas × mosaico 2fr/1fr/1fr; H1 a 16px × 40px/800; aside de
  380 com vão de 48 × 420 e 72; 4 atributos × 7 com divisórias; "Descrição" × "Sobre o imóvel";
  características em lista × 3 colunas; "Onde fica" só texto × ilustração do bairro; BlocoValor sem
  "Valor total mensal" em 48px, e formulário em outra caixa × a mesma caixa "Fale com o anunciante" com
  "Chamar no WhatsApp".
- **Fixture**: 2.300 + 480 + 130 = 2.910; 72 m²; 12 fotos com legenda; mediana 2.720 com n ≥ 5;
  Imobiliária Exemplo com 23 anúncios; 4 parecidos; WhatsApp verificado.
- **Regra**: WhatsApp só com número verificado; mapa sem coordenada; "Salvar" sem conta de consumidor
  é decisão de produto.

#### 09 · portal/03-anuncio\_\_bloco-venda — BlocoValor, venda

- **Rota**: ramo `temVenda` do BlocoValor (`P/components/anuncio.tsx:92-117`) · DENTRO.
- **API**: `publicListingDetailSchema` com preço, m², condomínio e IPTU (`C/public-search.ts:51-57`).
- **Falta no backend** (REGRA): mediana do m² no bairro com n ≥ 5 — B5.
- **Distância B**: "Venda" × "Preço de venda"; m² em linha × sublinha "R$ 5.235 por m²"; condomínio e
  IPTU sem "/mês"; preço a 16px × 48px/800; formulário fora da caixa.
- **Fixture**: venda 890.000; 170 m²; condomínio 620; IPTU 210; mediana do m² 5.480.

#### 10 · portal/03-anuncio\_\_bloco-ambos — BlocoValor, aluguel e venda

- **Rota**: BlocoValor com aluguel e venda (`anuncio.tsx:58-120`) · DENTRO.
- **Falta no backend** (CAMPO): interesse do lead (Alugar, Comprar, Os dois) — B5.
- **Distância B**: colunas empilhadas (`telas.css:410-416`) × lado a lado com preços de 30px; detalhes
  repetidos × linha única; falta o seletor de 3 opções preenchido (o Segmentado só tem filete,
  `portal.css:397-421`).
- **Fixture**: 1.050 + 240 + 50 = 1.340; venda 210.000; 32 m² (a regra dá 6.562,50/m²; o print
  arredonda).

#### 11 · portal/03-anuncio\_\_mobile — anúncio (390) com barra fixa

- **Rota**: `/imovel/[slug]` responsiva · EXISTE.
- **Falta no backend**: B1, B5 (WhatsApp verificado); "Salvar" é decisão.
- **Distância B**: cabeçalho de consumidor × "←" e "Salvar"; galeria × deslize com "1/12"; valores
  depois de tudo (`page.tsx:142-157`) × logo após os atributos; barra fixa sem o valor e com um botão ×
  valor, "WhatsApp" e "Mensagem".
- **Fixture**: a da 08.

#### 12 · portal/04-indisponivel — anúncio fora do ar e parecidos (410)

- **Rota**: `/imovel/[slug]` com 410 (`P/proxy.ts:53-57`; `page.tsx:61-85`) · EXISTE.
- **API**: `GET /public/listings/:slug` → 410 `publicListingGoneSchema` (`C/public-portal.ts:36-42`:
  motivo, bairro, cidade, parecidos).
- **Falta no backend** (CAMPO·REGRA): B6 — tipo, finalidade, total, capa e slugs no 410; a capa dá 404
  porque `/public/media/:id` só serve anúncio publicado (`A/public-search.ts:190`); parecidos só por
  bairro e finalidade (`A/public-portal.ts:85-97`); "Já foi alugado" deduzido de arquivamento manual.
- **Distância B**: caixa "Este anúncio saiu do ar" (`anuncio.tsx:263-271`) × grade com capa velada,
  selo "Já foi alugado", título de 32px/800 e 2 CTAs; 4 parecidos × 3.
- **Fixture**: apartamento Setor Bueno de 2.910 publicado e arquivado, com o imóvel ativo e endereço
  público (senão vira 404, `A/public-cards.ts:66-67`); 3 parecidos de 2.480, 3.060 e 2.690.
- **Regra**: a legenda fala em "410 ou 301 para o hub"; o ADR-099 fixou 410.

#### 13 · portal/05-vitrine — vitrine da imobiliária

- **Rota**: `/imobiliaria/[slug]` · OUTRO_CAMINHO em relação ao `SCREENS.md`, mantida (T2).
- **Componentes**: SiteHeader na variante B2B (`page.tsx:50`), ImovelCard, EstadoVazio; dados por
  `carregarVitrine` (`P/app/imobiliaria/[slug]/vitrine-dados.ts:18-76`).
- **API**: `GET /public/sitemap` + `GET /public/search` por cidade; `GET /public/organizations/:orgSlug/listings`
  (`A/public.ts:94`) existe e não é usada (outro DTO, sem total nem capa).
- **Falta no backend** (ROTA·CAMPO): B7 — o arranjo atual lê 12 anúncios por cidade de todas as
  imobiliárias e pode responder 404 com a imobiliária ativa (`vitrine-dados.ts:43-56`); logo (sem
  coluna); B1.
- **Distância B**: cabeçalho B2B × de consumidor; topo só com nome e CRECI × logo de 72px, cidade,
  contadores e filete; 2 abas × 3 chips com contagem; grade automática × 3 colunas de card compacto.
- **Fixture**: Imobiliária Exemplo, CRECI 0000-J, 23 anúncios em Goiânia (17 aluguel, 6 venda).

#### 14 · portal/06-alerta — criar, confirmar e cancelar alerta

- **Rota**: `/alerta/confirmado` e `/alerta/cancelar` · EXISTE; criar é formulário dentro da busca
  (`busca-pagina.tsx:232-239`); `/alerta`, linkado no rodapé, não existe.
- **Componentes**: AlertaImovel (Segmentado, Campo, CheckboxLgpd, Botao); `criarAlertaAction`
  (`P/app/actions.ts:104-156`).
- **API**: `POST /public/alerts` (`A/public-portal.ts:244`), `/confirm` (`:286`), `/cancel` (`:301`);
  as duas últimas devolvem só `{status}`.
- **Falta no backend** (ROTA·REGRA·INTEGRAÇÃO): B8; B28; `maxPriceCents` aceito pela API e nunca
  enviado pelo portal.
- **Distância C**: não há modal ou gaveta de 420px; não há a pergunta "Cancelar este alerta?" (defeito
  8); textos diferentes ("Avise quando aparecer", "Quase lá.", "Alerta confirmado").
- **Fixture**: alerta de aluguel, Setor Bueno, apartamento de 2 quartos até 3.000, por e-mail; token
  por `GET /dev/email-outbox?kind=SEARCH_ALERT_CONFIRM` (`A/dev-outbox.ts:25`).
- **Regra**: o texto de consentimento é a prova LGPD gravada (`A/public-portal.ts:44-45` =
  `P/components/AlertaImovel.tsx:82`) — mudar os dois juntos; defeito 9.

#### 15 · portal/07-mapa-do-site — índice UF → cidade → bairro

- **Rota**: `/mapa-do-site` · EXISTE.
- **API**: `GET /public/sitemap` (`A/public-portal.ts:324-394`; caminho, contagem e data).
- **Falta no backend** (CAMPO·REGRA): B2; B9.
- **Distância B**: uma seção por UF com h2 de 16px × chips de UF e 3 colunas por cidade; o caminho da
  cidade é sobrescrito pelo último recorte e os bairros se repetem (`page.tsx:49-56`); links herdam a
  cor (`portal.css:26-28`) × verdes sublinhados.
- **Fixture**: recortes com ≥ 3 anúncios em Goiânia, Aparecida de Goiânia e Anápolis.
- **Regra**: UF por query string não indexa (ADR-099); UF por caminho é decisão.

#### 16 · portal/08-erro404 — página não encontrada

- **Rota**: `P/app/not-found.tsx` · EXISTE.
- **API**: nenhuma hoje; as cidades sairiam de `GET /public/sitemap`.
- **Falta no backend** (CAMPO): B2.
- **Distância B**: caixa EstadoVazio × duas colunas com "Erro 404", título de 44px/800, campo de cidade
  de 52px com "Buscar" e mosaico 2 × 2 com grade de 30px.

#### 17 · portal/09-para-imobiliarias — landing B2B

- **Rota**: `/para-imobiliarias` · EXISTE (canônica sem barra final).
- **Componentes**: HeroB2B, CanaisIntegrados, FluxoSistema, DoisCaminhos (`P/components/b2b.tsx:38-161`);
  textos em `P/app/b2b-conteudo.ts`.
- **API**: `GET /public/plans` (`A/public-plans.ts:17`); o estado dos canais não tem leitura pública
  (`GET /channels` exige sessão).
- **Falta no backend** (ROTA): B11 (D1).
- **Distância B**: canais empilhados com status em caixa alta (`telas.css:745`) × duas colunas e grade
  2 × 2 com pílula; fluxo automático × 6 colunas; hero sem arte, título de 46 × 56px e CTAs empilhados
  (`.botao--grande{width:100%}`, `portal.css:293-296`).
- **Regra**: defeito 3; "Atenda no WhatsApp" sem selo, com WhatsApp `IMPLEMENTED_NOT_LIVE_VERIFIED`
  (`docs/BLOCKERS.md:79`).

#### 18 · portal/10-planos — tabela de planos

- **Rota**: `/planos` · EXISTE.
- **Componentes**: TabelaPlanos, FaqPlanos, SeloEmBreve (`b2b.tsx:168-292`); regras em `P/lib/planos.ts`.
- **API**: `GET /public/plans` (`A/public-plans.ts:17-57`; `C/public-plans.ts:14-27`).
- **Falta no backend**: DECISÃO — critério do plano em destaque; linha de portais parceiros (D1).
- **Distância B**: cartões + `<table>` × grade única (280 + 3 colunas); "✓" × "Incluído" e "—";
  "Até N" × o critério do limite ("Por contratos de locação ativos"); FAQ fechada com "Quanto custa"
  por último × duas colunas com ela aberta e primeiro.
- **Fixture**: 3 planos ativos sem preço (Anunciante, Gestão Locação, Gestão Vendas) por
  `POST /platform/plans`, com os semeados (ESSENCIAL, PROFISSIONAL, ILIMITADO) inativos.
- **Regra**: "Portais parceiros" incluído em todo plano (`planos.ts:42-46`) contra o ADR-097; preço
  nulo → "Fale com a gente" já está certo (ADR-101).

#### 19 · portal/11-anunciar — plano Anunciante

- **Rota**: `/anunciar` · OUTRO_CAMINHO; move para `/para-imobiliarias/anunciar` com 301 (T2).
- **Componentes**: HeroB2B, CanaisIntegrados e lista inline (`page.tsx:54-66`).
- **Falta no backend**: D1; "Demanda por bairro e tipo" (B14: o relatório agrupa por bairro e
  finalidade, `A/reporting.ts:227,288`).
- **Distância B**: hero branco × verde com grade de 48px; seções atuais × grade numerada 3 × 2, bloco
  "Quando o Gestão faz sentido" e cartão do plano; os 6 itens do `renderVals()` não existem no código.
- **Regra**: "Um cadastro, quatro portais", "Tudo sincronizado" e "Retirada automática" pressupõem
  adapters (D1).

#### 20 · portal/12-gestao-b2b — o sistema por módulo

- **Rota**: `/gestao` · OUTRO_CAMINHO; move para `/para-imobiliarias/gestao` com 301 (T2).
- **Componentes**: HeroB2B, SeloEmBreve, FluxoSistema, lista inline (`page.tsx:31-68`).
- **Falta no backend**: DECISÃO — o design só desenha a aba Locação (`06-complementos.dc.html:120-128`).
- **Distância B**: outro título e sem o seletor Locação/Vendas; 6 cartões × 7 linhas com quadrado de
  56px, grade de 14px e pílula "No ar"/"Em breve"; seção de fluxo a mais.
- **Regra**: "Imóveis e portais · No ar" (D1); "Atendimento no WhatsApp · No ar" e "sugestões de IA ·
  No ar" contrariam `docs/BLOCKERS.md:28,79`.

#### 21 · portal/13-contato-estados — estados do FormContato

- **Rota**: `P/components/FormContato.tsx` em `/imovel/[slug]` (`page.tsx:155`) · DENTRO; não está no
  catálogo.
- **API**: `POST /public/listings/:slug/leads` (`A/public-portal.ts:167`, 5 por minuto em `:169`).
- **Falta no backend** (CAMPO·REGRA): B5 — telefone público da imobiliária (existe em
  `organizations.phone`, fora do DTO, `A/public-cards.ts:191`); celular com DDD (o contrato aceita 8
  caracteres ou mais, `C/public-portal.ts:44-49`).
- **Distância B**: a ação devolve só o primeiro erro (`actions.ts:53-58`) e o erro de consentimento
  nunca aparece (`FormContato.tsx:50,62,70`); "enviando" só com opacidade × esqueleto e spinner;
  "enviado" genérico × ✓, nome da imobiliária, WhatsApp e alerta; falha e 429 sem "Tentar de novo".
- **Fixture**: erro ("Fernanda Souza", "(62) 9 88", sem consentimento); 429 no sexto envio;
  "enviando" segurando a requisição.

#### 22 · portal/14-celular-secundarias — 390 de indisponível, vitrine, alerta, planos e 404

- **Rota**: as das telas 12, 13, 14, 18 e 16 · EXISTE; a variante de 390 do print não.
- **Falta no backend**: os das telas 12, 13, 14 e 18.
- **Distância C**: o padrão do print (selo, título de 26px, 2 CTAs de largura total, linhas de 52px) não
  existe; planos viram tabela com rolagem lateral (`telas.css:1008-1019`); o terceiro espaço do
  cabeçalho recebe o link de ação.
- **Regra**: "Todos publicam em 4 portais" (D1); "1 por dia no máximo" sem implementação (B8).

### Entrada e conta

A moldura das 9 telas é `W/components/auth-shell.tsx:22-36`: cartão de até 400px com sombra sobre o
fundo da gestão, Inter e selo "A". O print pede página branca, topo de 64px "AchouImóvel | Gestão" em
Guton, coluna de 440–480px e botões de 52px em #037A4B. Trocar a moldura resolve topo, fundo e coluna
das 9 telas de uma vez (T10).

#### 23 · conta/01-login — login com erro

- **Rota**: `/login` (`W/app/login/page.tsx`) · EXISTE.
- **Componentes**: AuthShell, LoginForm (`login-form.tsx:10-106`), Input, Button, CampoSenha.
- **API**: `POST /auth/login` (`A/auth.ts:188`; BFF `W/app/api/auth/login/route.ts:13`;
  `C/auth.ts:81,86`).
- **Falta no backend**: NADA (a API já responde igual para e-mail inexistente e senha errada,
  `A/auth.ts:195-201`).
- **Distância B**: h1 de 20 × 30px/800; botão de 36px #2F332B × 52px #037A4B; erro com ícone × faixa
  #FDECEE; a senha não ganha a borda de erro; "Esqueci minha senha" abaixo do botão × "Esqueci a senha"
  ao lado do rótulo.

#### 24 · conta/02-cadastro-etapa1 — cadastro, etapa 1 de 6

- **Rota**: `/register?plano=` (`W/app/register/page.tsx:36-66`) · EXISTE.
- **API**: `GET /public/plans`; `POST /auth/register` (`A/auth.ts:93`; `C/auth.ts:38,66`).
- **Falta no backend**: NADA.
- **Distância B**: sem a barra de progresso de 3px; a pergunta é rótulo × h2 de 30px e campo de 52px;
  "1 de 6" à direita × acima do título; "Plano:" no corpo × no topo.
- **Fixture**: plano `GESTAO_LOCACAO` — não é semeado (`packages/db/drizzle/0018_platform_admin_plans.sql:25-28`).

#### 25 · conta/03-cadastro-etapa5 — cadastro, etapa 5 de 6

- **Rota**: `/register`, etapa 5 (`register-form.tsx:228-260`) · EXISTE.
- **Falta no backend**: NADA.
- **Distância B**: rádio nativo × cartão com rádio de 20px e borda de 2px no escolhido; linha de
  cobrança a mais (`register-form.tsx:251`); legend de 16px × h2 de 30px; a nota vem antes do botão ×
  depois.
- **Fixture**: os 3 planos da tela 18, com as descrições do print; no mesmo banco isso quebra
  `E2E/platform-admin.spec.ts:59`, que aprova no "Profissional".

#### 26 · conta/04-convite — aceitar convite

- **Rota**: `/convite?token=` (`W/app/convite/page.tsx:7-17`) · OUTRO_CAMINHO, mantida (T2).
- **API**: `POST /invites/describe` (`A/organizations.ts:490`; `C/org.ts:77-84`); `POST /invites/accept`
  (`:515`; `C/org.ts:86-92`, exige `name`).
- **Falta no backend** (CAMPO): B12.
- **Distância B**: "Convite para a equipe" em 20px × "Luana Castro convidou você para a Imobiliária
  Exemplo" em 28px/800; três campos × um ("Crie sua senha"); validade abaixo do botão.
- **Fixture**: dona "Luana Castro"; convite de corretor; token por `outboxToken`
  (`E2E/g3-d-support.ts:34-48`); validade mascarada.

#### 27 · conta/05-esqueci-senha — depois de pedir

- **Rota**: `/esqueci-senha`, estado enviado (`forgot-password-form.tsx:38-66`) · EXISTE.
- **API**: `POST /auth/forgot-password` (`A/auth.ts:365`).
- **Falta no backend**: NADA (D6 para prometer e-mail).
- **Distância B**: faixa verde × "Confira seu e-mail" em 28px, "Reenviar em 0:42" e "← Voltar para
  entrar"; não existe reenvio com contagem.
- **Regra**: §7 (30 minutos, sem promessa de entrega).

#### 28 · conta/06-redefinir-senha — nova senha

- **Rota**: `/redefinir-senha?token=` (`reset-password-form.tsx:13-139`) · EXISTE.
- **API**: `POST /auth/reset-password` (`A/auth.ts:424`).
- **Falta no backend**: NADA (o medidor de força é do front).
- **Distância B**: sem o medidor de 4 segmentos; "Redefinir senha" × "Nova senha"; "Confirme a nova
  senha" × "Repita a senha"; "Salvar nova senha" × "Salvar senha"; campos de 36 × 48px.

#### 29 · conta/07-conta-em-analise — aguardando aprovação

- **Rota**: `/situacao-da-conta` (`W/app/situacao-da-conta/page.tsx:25-73`) · OUTRO_CAMINHO, mantida
  (T2; `W/lib/account-status.ts:15-23`).
- **API**: `GET /auth/me` (`A/auth.ts:278`; `C/auth.ts:18-25,114`).
- **Falta no backend** (CAMPO·REGRA): B13.
- **Distância B**: selo com o nome da imobiliária × pílula "Em análise"; título genérico × "Recebemos o
  cadastro da {nome}"; sem o checklist de 4 linhas.
- **Fixture**: imobiliária sem aprovação — falta helper, porque `registerViaApi` sempre aprova
  (`E2E/g2-b1-support.ts:187-188`).
- **Regra**: §7.

#### 30 · conta/08-conta-suspensa — conta suspensa

- **Rota**: `/situacao-da-conta` · OUTRO_CAMINHO, mantida.
- **API**: `GET /auth/me` (motivo em `statusReason`).
- **Falta no backend** (CAMPO): B13 — `statusChangedAt`; canal de suporte (dono).
- **Distância B**: motivo em caixa × frase corrida; sem "Falar com o suporte"; título e pílula.
- **Regra**: §7.

#### 31 · conta/09-cadastro-mobile — cadastro (390), etapa 3

- **Rota**: `/register`, etapa 3 (`register-form.tsx:175-199`) · EXISTE.
- **Falta no backend**: NADA.
- **Distância B**: sem topo de 56px e sem barra de progresso; "Qual é a sua imobiliária?" × "Nome da
  imobiliária"; "CNPJ ou CPF" × "CNPJ"; sem o aviso "CNPJ válido" (a validação existe em
  `W/lib/party-rules.ts:87-96`); botão não fica preso ao rodapé.
- **Fixture**: CNPJ válido (o do print, 00.000.000/0001-00, não passa na validação).
- **Regra**: o print restringe a CNPJ e o contrato aceita CPF (`C/auth.ts:44-51`) — decisão.

### Gestão

#### Menu — diff com `Painel Sidebar.dc.html`

| Item do design                                                | Hoje                                                                                  | Ajuste                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cabeçalho "AchouImóvel Gestão"                                | selo certo; nome num só trecho, peso 600 (`W/components/shell/app-shell.tsx:107-108`) | "Gestão" em peso 500, #6E746B                                          |
| Botão de recolher                                             | botão com moldura e ícone `panelLeft` (`app-shell.tsx:111-118`)                       | ícone de 16 × 14 sem moldura                                           |
| CRM: Leads 7 · Contatos · Pipeline 🔒 · Tarefas 3 · Agenda 🔒 | itens, ordem e módulos certos; sem contadores                                         | contadores 7 e 3 (B14)                                                 |
| Imóveis: Imóveis · Anúncios · Canais                          | certo                                                                                 | —                                                                      |
| Vendas: Negociações (ícone `tag`, "Novo", 🔒)                 | ícone `columns` e item a mais "Painel de vendas" (`W/lib/navigation.ts:116-127`)      | ícone `tag` (não existe em `icons.tsx`); T9                            |
| Operação: Inbox 2 (vermelho) e os demais                      | ícones equivalentes; módulos certos; sem contador                                     | contador de perigo (B14)                                               |
| Financeiro, Crescimento, Administração                        | certo, filtrado por permissão                                                         | —                                                                      |
| Cadeados do plano Anunciante                                  | com `modules: []`, saem exatamente no conjunto do design                              | —                                                                      |
| Item bloqueado                                                | rótulo 400 e ícone #6E746B; "Novo" e contador continuam (`app-shell.tsx:210-225`)     | rótulo 500, ícone #B6B7BB, sem "Novo" e sem contador                   |
| Selo "Novo"                                                   | 10,5px/700                                                                            | 10px/600                                                               |
| Ícones e rolagem                                              | Lucide 24/1.6 a 16px; barra de rolagem visível                                        | T8; `scrollbar-width: none`                                            |
| Rodapé                                                        | avatar de 32px, nome 12px, papel e botão "⋮"; imobiliária com avatar #E9E9E6 11/500   | avatar de 28px, nome 12,5px, "Gestor · plano", sem "⋮"; #F0F0F0 10/600 |

#### 32 · gestao/01-visao-geral — Visão Geral com Demanda por bairro

- **Rota**: `/app` (`W/app/app/page.tsx`) · EXISTE.
- **Componentes**: AppShell (GlobalSearch, TopbarClock, AccountMenu, OrgSwitcher); SummaryCard
  (`page.tsx:533-564`); fila (`376-411`); ciclo (`415-435`); demanda (`440-476`); faixa de alertas
  (`307-324`); card Atendimento (`480-515`).
- **API**: `GET /auth/me`; `GET /dashboard/summary` (`A/dashboard.ts:348`, schema no próprio arquivo,
  `:52-129`, fora de `packages/contracts`); `GET /reporting/demand-by-neighborhood`
  (`A/reporting.ts:227`; `C/reporting.ts:86-99`).
- **Falta no backend** (CAMPO): B14 — "Reservados" não existe no DTO e a tela mostra locações ativas
  com esse rótulo (`page.tsx:347`).
- **Distância B**: demanda com bolinha × barra, selo "Novo" e anel; fila em flex × grade de 6 colunas;
  sobram a faixa de alertas e o card Atendimento; subtítulo gerado × "3 pendências exigem atenção
  hoje."; botões com ícone × "Minha agenda" e "+ Novo imóvel".
- **Fixture**: Rafael Almeida; relógio em segunda 09:12 (`page.clock`); números do `renderVals()`;
  alertas ativos por token do outbox.
- **Regra**: "OLX recusou IMV-0165" só com o canal `fake` (D1); `E2E/g2-b1-navigation.spec.ts:289-297`
  fixa "Reservados".

#### 33 · gestao/02-upgrade-plano — cadeado e tela de upgrade

- **Rota**: `/app/plano?modulo=` pelo item com cadeado (`app-shell.tsx:388-399`) · OUTRO_CAMINHO; T2.
- **Componentes**: PlanoBloqueado (`W/components/shell/plano-bloqueado.tsx:19-75`); textos em
  `W/lib/plan-modules.ts:12-29`.
- **API**: `GET /auth/me`; `GET /public/plans`; 403 `PLAN_MODULE_NOT_INCLUDED` (`D/platform/plan-modules.ts:51-54`).
- **Falta no backend** (ROTA): B15.
- **Distância B**: card de largura total × 560px centrado, com selo e checklist em 2 colunas; faltam
  "Pedir o Gestão Locação" e "Comparar planos"; em `/app/plano` a trilha perde o módulo e nenhum item
  fica ativo.
- **Regra**: defeito 13; `EM_PREPARACAO = ['VENDAS']` ficou da fase anterior (`W/app/app/plano/page.tsx:15`).

#### 34 · gestao/03-publicar — publicar em AchouImóvel, Canal Pro, OLX e Imovelweb

- **Rota**: `DialogoPublicacao` em `/app/listings` (`W/app/app/listings/dialogo-publicacao.tsx`) ·
  EXISTE.
- **API**: `GET /listings/:id/publish-readiness` (`A/channels.ts:409`; `C/listing.ts:98-110`);
  `PATCH /listings/:id/status`; `POST /listings/:id/channels/:channel/publish` existe e não é chamado.
- **Falta no backend** (INTEGRAÇÃO·CAMPO): D1; B16 — `properties.code` e bairro fora do contrato; a
  linha "AchouImóvel" não é canal; zap e vivareal como "Canal Pro".
- **Distância B**: badges × checkbox, descrição e selo; "CanalPro" e "Imóvel Web" × "Canal Pro" e
  "Imovelweb"; Modal de 560 com bordas e × × 520 sem; defeito 10.
- **Regra**: `E2E/g2-b2-application-channel-archive.spec.ts:85` exige "OLX (sem integração)".

#### 35 · gestao/04-publicar-bloqueado — bloqueios

- **Rota**: estado do mesmo diálogo (`dialogo-publicacao.tsx:60-61,93-121`) · EXISTE.
- **API**: `publishBlockers` (`A/listings.ts:57-94`), só termos financeiros e endereço público
  (`C/listing.ts:91-96`).
- **Falta no backend** (REGRA·CAMPO): B16.
- **Distância B**: caixa com "Resolver" × ícone redondo, título de 13/600, detalhe e link; os itens
  aprovados não aparecem.
- **Regra**: R2.

#### 36 · gestao/05-valores-venda-exclusividade — finalidade, venda e exclusividade

- **Rota**: não há etapa Valores; `/app/properties/new` é um formulário só (`property-form.tsx:39-45,278-464`)
  e os pedaços estão em `/app/properties/[id]` (`property-detail-client.tsx:508-577,678-785`;
  `exclusividade-venda.tsx`) · AUSENTE.
- **API**: `POST` e `PATCH /properties` (com `purpose`); `PUT /properties/:id/financial-terms` (com
  `salePriceCents`); `GET` e `POST /properties/:id/sale-exclusivities` (`A/sale-exclusivity.ts:75,114`).
- **Falta no backend** (CAMPO·ROTA·REGRA): B17.
- **Distância C**: finalidade e preço de venda só em leitura; o modal exige aluguel até em imóvel só
  de venda (`property-detail-client.tsx:707-710`); exclusividade sem a autorização e sem a grade; sem
  "Sugestão da IA" e sem "Total mensal exibido no portal".
- **Regra**: "Sugestão da IA" rotula uma mediana estatística (decidir o rótulo); aceitar é ato
  explícito; o aviso de 15 dias promete notificação que não existe.

#### 37 · gestao/06-negociacoes — quadro e gaveta

- **Rota**: `/app/vendas/negociacoes` · EXISTE.
- **Componentes**: quadro `.sale-board` (`negociacoes-client.tsx:118-164`); Drawer de 380px com
  sobreposição (`:167-234`); histórico, documentação e comissão; `W/lib/vendas.ts`.
- **API**: `GET /sale-negotiations` (`A/sale-negotiations.ts:231`), `/:id` (`:297`), `/events`
  (`:309`), `/answer` (`:365`); sem uso na interface: criar (`:147`), `/stage` (`:398`), `/documents`
  (`:457`), `/commission` (`:499`).
- **Falta no backend** (CAMPO): B18; bairro no resumo do imóvel (B16).
- **Distância B**: sem a linha do mês e sem "+ Nova negociação"; colunas fixas de 240px × 5 iguais com
  fundo #F0F0F0; gaveta sobreposta de 380 × painel fixo de 420 sem sobreposição.
- **Fixture**: reaproveitar `E2E/onda6-celular.spec.ts:49-117`; o print tem contagens de coluna
  incoerentes com os cartões.

#### 38 · gestao/07-pipeline-funis — Aluguel/Venda e origem

- **Rota**: `/app/crm/pipeline` · EXISTE.
- **API**: `GET /leads` (`A/leads.ts:145`; `C/leads.ts:45-50`), `PATCH /leads/:id/status`.
- **Falta no backend** (CAMPO): B18 — responsável, imóvel e prazo; colunas do funil de venda.
- **Distância B**: título e filtros em duas linhas × uma; 8 estágios de 220px × 6 colunas; cartão com
  canal cru e "Avançar para…" × etiqueta de origem e prazo.
- **Regra**: D1 (origens de portal parceiro só manuais); defeito 11.

#### 39 · gestao/08-integracoes — portais e provedores

- **Rota**: `/app/admin/integrations` · OUTRO_CAMINHO, mantida (T2).
- **API**: `/meta/connections`, `/whatsapp/connections`, `GET /capabilities`, `GET /channels`,
  `GET /channels/summary`.
- **Falta no backend** (REGRA): B19 — o 403 de `/meta` derruba a página (`integrations-client.tsx:130`).
- **Distância B**: cartões e faixas × ladrilhos em 2 colunas com logo, selo e ação; a lista do código
  tem Google Maps e não tem Canal Pro, OLX, Imovelweb, Asaas, Clicksign nem Serasa.
- **Regra**: D1; "Conectado" no Meta com `dry_run` tem de vir de `GET /capabilities`.

#### 40 · gestao/09-contrato-venda — contrato de compra e venda

- **Rota**: `/app/vendas/negociacoes/[id]/contrato` · AUSENTE (o contrato cairia em
  `/app/contracts/[id]`, e a interface nunca envia `negotiationId`).
- **API**: `POST /contracts` (`A/contracts.ts:377`, aceita `negotiationId`); `GET /contracts/:id`;
  `/versions`; `/generate`; `/send-for-signature`; `GET /contract-templates?kind=SALE`.
- **Falta no backend** (ROTA·CAMPO·REGRA): B18 — achar o contrato da negociação; linha do tempo
  (tabela `signature_events` sem rota); PDF; lembrete; papéis; rotas de contrato atrás de LOCACAO
  (`apps/api/src/app.ts:427-432`).
- **Distância C**: página inexistente; SELLER e BUYER sem rótulo (`W/lib/labels.ts:43-49`).
- **Fixture**: modelo de venda com 3 versões (o helper atual só cria de locação,
  `E2E/g2-b2-support.ts:113-129`).

#### 41 · gestao/10-painel-vendas — painel do mês

- **Rota**: `/app/vendas` (`W/app/app/vendas/page.tsx:38-84`) · EXISTE.
- **API**: `GET /sale-negotiations/summary?month` (`A/sale-negotiations.ts:545`; `C/sale-negotiation.ts:150-171`).
- **Falta no backend** (ROTA·CAMPO): B18.
- **Distância B**: 3 cartões × 4 indicadores com variação; faltam "Fechamentos", "Comissão por
  corretor" e o seletor Setembro/Agosto/Trimestre.
- **Regra**: defeito 12.

#### 42 · gestao/11-gestao-mobile — Visão Geral e negociação no celular

- **Rota**: `/app` responsiva · EXISTE; a negociação é gaveta a 92vw → `/app/vendas/negociacoes/[id]`
  (T2).
- **Falta no backend**: NADA.
- **Distância C**: topo ☰, título e "+" × menu, sino e conta; 3 cartões × o painel do desktop
  empilhado; negociação em página com barra fixa × gaveta.
- **Regra**: `E2E/onda6-celular.spec.ts:200-203` precisa ser atualizado, sem remover.

#### 43 · gestao/12-financeiro-split — cobrança com split e modo de teste

- **Rota**: gaveta "Detalhe da cobrança" em `/app/charges` (`charges-client.tsx:243-313`) · DENTRO →
  `/app/charges/[id]` (T2).
- **API**: `GET /charges/:id` (sem uso no front); `GET /leases/:id` (split em pontos-base);
  `POST /charges/:id/payment`; `GET /capabilities`.
- **Falta no backend** (REGRA·CAMPO·ROTA): B20; D7.
- **Distância C**: sem página de detalhe; "Split previsto" não existe em lugar nenhum; ações diferentes.
- **Fixture**: locação 60/40 (`seedCoOwnedLease`, `E2E/g3-c-support.ts:118-143`) com 2.300, 480 e 130.
- **Regra**: "Emitir cobrança real" desativado pela `GET /capabilities`, não por texto fixo (ADR-102);
  pagamento manual com confirmação e auditoria.

#### 44 · gestao/13-limite-contratos — limite do plano (409)

- **Rota**: `CreateLeaseModal` (`W/app/app/leases/leases-client.tsx:193-260`) mostra aviso genérico ·
  AUSENTE.
- **API**: 409 `PLAN_LIMIT_REACHED` com `limit` e `current` (`D/platform/plan-limits.ts:41-54`).
- **Falta no backend** (ROTA): B15.
- **Distância C**: diálogo inexistente; Modal sem 460px; sem barra de progresso em `packages/ui`.
- **Fixture**: `page.route` com o 409 (T6).

#### 45 · gestao/14-contrato-locacao-assinatura — envelope em modo de teste

- **Rota**: `/app/contracts/[id]` · EXISTE.
- **Falta no backend** (REGRA·CAMPO): B21 (o contrato de locação só cria locador e locatário,
  `A/contracts.ts:483-493`).
- **Distância B**: 2 cartões × 1 de 460px "Envelope de assinatura" com selo; rótulos de papel e de
  estado.

#### 46 · gestao/15-analise-cadastral — análise com aviso

- **Rota**: `/app/screening/[id]` · OUTRO_CAMINHO, mantida (T2).
- **API**: `GET /rental-applications/:id` (`C/rental.ts:42-55`); `PATCH /status` com motivo;
  `POST /screening`.
- **Falta no backend** (REGRA·CAMPO): B22.
- **Distância C**: a lista de 4 regras não existe; botões no cabeçalho × "Aprovar com motivo" e
  "Reprovar com motivo" no rodapé.
- **Regra**: §7 — no FAKE a decisão sai de um score do CPF (`packages/integrations/src/screening/fake.ts`;
  `apps/worker/src/screeningJobs.ts:96-101`).

#### 47 · gestao/16-fotos-legendas — fotos e legendas

- **Rota**: aba Mídia de `/app/properties/[id]` (`property-detail-client.tsx:86-93,419-498`) · DENTRO →
  `/app/properties/[id]/fotos` (T2).
- **API**: `GET /properties/:id` (mídia sem URL); `PATCH /properties/:id/media/:mediaId`; nenhuma tela
  envia foto de imóvel hoje.
- **Falta no backend** (CAMPO·ROTA·REGRA): B23, B16; D2; D3.
- **Distância B**: ícone e "PHOTO" × a foto 4:3 com selo; selo Público/Privado × chave "Pública no
  portal"; sem "Novo imóvel · 5 de 7" e sem o contador.

#### 48 · gestao/17-plano-e-uso — plano e uso

- **Rota**: `/app/settings/plano` · EXISTE, sem link no painel.
- **API**: `GET /organizations/:orgId/plan-usage` (`A/organizations.ts:165`; `C/org.ts:126-147`).
- **Falta no backend** (CAMPO·ROTA): B15 — a data devolvida é a criação da imobiliária
  (`A/organizations.ts:201`).
- **Distância B**: 3 cartões iguais × 1fr + 340px; selo "N de M" × número e barra; 6 módulos × 13
  linhas "Incluído"/"Fora do plano".
- **Fixture**: o uso 96/7/142/86 só com dado no banco (a página busca no servidor).

#### 49 · gestao/18-plataforma-aprovacao — fila com plano pedido

- **Rota**: `/plataforma` e `/plataforma/imobiliarias[/id]` · OUTRO_CAMINHO, mantida (T2).
- **API**: `GET /platform/organizations?status=PENDING_APPROVAL` (`A/platform.ts:290`); `/approve`;
  `/reject`; `GET /platform/plans`.
- **Falta no backend** (CAMPO·REGRA): B24.
- **Distância B**: indicadores e tabela de 8 colunas × 4 colunas e painel lateral de 360px; plano
  pedido pelo código × pelo nome.
- **Fixture**: 4 cadastros pendentes; idades exigem data no banco.
- **Regra**: §7.

#### 50 · gestao/19-voz-captura-mobile — gravação e fotos

- **Rota**: `/app/properties/new-by-audio` · OUTRO_CAMINHO, mantida (T2).
- **API**: `GET /capabilities`; `POST /property-drafts`, `/audio-url`, `/process`
  (`A/property-drafts.ts:146-228`).
- **Falta no backend** (ROTA): B25.
- **Distância C**: sem Foto, miniaturas e Pausar; roteiro de 5 × 6 itens; tela cheia × dentro do shell.
- **Regra**: a faixa de simulação fica enquanto o transcritor for de mentira; o ✓ ao vivo contradiz o
  gravador (o áudio só sai do aparelho ao concluir); desligado em produção (ADR-104).

#### 51 · gestao/20-voz-processando-mobile — processamento por etapa

- **Rota**: estado de `/app/properties/new-by-audio` (`cadastro-por-audio.tsx:188-193`) · DENTRO.
- **API**: `POST /property-drafts/:id/process` é síncrono (`A/property-drafts.ts:228-296`).
- **Falta no backend** (REGRA·INTEGRAÇÃO): B25; D3.
- **Distância C**: a lista de 5 etapas não existe.

#### 52 · gestao/21-voz-revisao-desktop — revisão ligada à transcrição

- **Rota**: estado `Revisao` (`revisao.tsx`) · DENTRO; propõe-se `/app/properties/new-by-audio/[draftId]`.
- **API**: `PATCH /fields` (`:335`); `/confirm` (`:386`); `/discard` (`:510`); `GET /property-drafts/:id`
  (`:189`, sem uso).
- **Falta no backend** (CAMPO·ROTA·INTEGRAÇÃO): B25; D3.
- **Distância C**: 3 colunas × uma; transcrição sem marcação nem reprodução; campos com outro controle.
- **Regra**: o print não tem Título e a confirmação o exige; "Das fotos", placa e legendas (D3).

### Área do cliente

As telas repetem a moldura à mão (`W/app/portal/entrar/page.tsx:14-21`; `W/app/inquilino/page.tsx:105-116`;
`W/app/proprietario/page.tsx:66-77`). Os prints pedem quatro topos de 56px (marca centralizada, "Olá ·
Sair", "← título" e o topo desktop), botões de 48px em #41945D (`.peg-btn--brand` já existe) e campos
de 48px.

#### 53 · cliente/01-entrar — pedir link de acesso

- **Rota**: `/portal/entrar` · EXISTE.
- **API**: `POST /portal/auth/request-link` (`A/portal-request-link.ts:42`); defeito 1.
- **Falta no backend**: NADA.
- **Distância B**: cartão de 400px × página #FCFCFC com topo de 56px; botão de 36px #2F332B × 48px
  #41945D; título de 20 × 22px/600.
- **Regra**: §7.

#### 54 · cliente/02-link-enviado-expirado — pedido e link vencido

- **Rota**: `/portal/entrar`, dois estados (`pedir-link.tsx:70-93`; `portal-entry.tsx:53-64`) · EXISTE.
- **API**: a da 53 e `POST /portal/auth/consume` (`A/portal.ts:263`).
- **Falta no backend**: NADA.
- **Distância B**: o artboard empilha dois estados (comparar metade a metade); o link vencido repete o
  formulário inteiro × só "Pedir novo link".
- **Regra**: §7.

#### 55 · cliente/03-inquilino-inicio — início do inquilino

- **Rota**: `/inquilino` · EXISTE.
- **API**: `/portal/me`, `/portal/tenant/charges`, `/contracts`, `/inspections`, `/statement`
  (`A/portal.ts:357-517`; `C/portal.ts:49-131`).
- **Falta no backend** (ROTA·CAMPO·REGRA): B26; B20 (IPTU).
- **Distância B**: 3 totais e seções × "Olá, Fernanda", "Sua locação", cobrança com itens e menu de 4
  linhas; Pix gerado ali × botão para a tela 56.
- **Regra**: o aviso de modo de teste aparece antes de pagar (tela 56).

#### 56 · cliente/04-inquilino-pix — pagar com Pix

- **Rota**: Pix dentro de `/inquilino` (`page.tsx:152-171`; `pagar-pix.tsx`) · DENTRO →
  `/inquilino/cobrancas/[id]` (T2).
- **API**: `POST /portal/tenant/charges/:id/payment` (`A/portal.ts:548`); defeito 2.
- **Falta no backend**: NADA (opcional: `GET /portal/tenant/charges/:id`).
- **Distância C**: rota e topo inexistentes; sem QR (o web já desenha QR com `uqr`,
  `W/components/portal/portal-access-dialog.tsx:4,13-40`).
- **Regra**: §7 ("em até 1 minuto"); o código Pix vem do provider, nunca fabricado.

#### 57 · cliente/05-inquilino-documentos — contrato e vistoria

- **Rota**: cartão dentro de `/inquilino` (`page.tsx:173-220`) · DENTRO → `/inquilino/documentos` (T2).
- **API**: `/portal/tenant/contracts[/:id]`, `/portal/tenant/inspections` (`C/portal.ts:99-131`).
- **Falta no backend** (CAMPO·ROTA): B26.
- **Distância C**: rota inexistente; defeito 7; sem linhas por ambiente e sem PDF.

#### 58 · cliente/06-proprietario-extrato — extrato e repasse

- **Rota**: `/proprietario` · EXISTE.
- **API**: `/portal/landlord/properties`, `/portal/landlord/statement` (`A/portal.ts:590-618`;
  `C/portal.ts:135-156`).
- **Falta no backend** (CAMPO·REGRA·ROTA): B27; B20.
- **Distância B**: 3 totais × "Repasse previsto"; sem abas de mês, sinais, "Total a repassar" e PDF;
  defeito 5.
- **Regra**: §7.

#### 59 · cliente/07-proprietario-desktop — histórico de repasses

- **Rota**: `/proprietario` a 1040px · EXISTE, sem versão desktop.
- **Falta no backend** (CAMPO·INTEGRAÇÃO): B27.
- **Distância B**: sem o topo desktop; totais diferentes; a tabela de 6 colunas não existe.
- **Regra**: §7 ("Pago").
