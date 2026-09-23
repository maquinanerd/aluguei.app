# AchouImóvel · plano de frontend (Onda 0 · diagnóstico)

Entrega da Onda 0 de `design-source/achouimovel/PROMPT_FRONTEND_ORQUESTRADO.md`. **Somente leitura: nenhuma linha de código de produto foi alterada.** Este documento existe para ser aprovado antes da Onda 1.

- Data: 22/09/2026
- Base lida: `AGENTS.md`, `docs/EXECUTION_STATE.md`, `design-source/achouimovel/` (README, PROMPT, HANDOFF, CONTEXTO, tokens, 13 telas de referência), árvore de rotas de `apps/web`, `packages/ui`, `packages/contracts`, `apps/api`, `packages/db`, `packages/integrations`, `.github/workflows/ci.yml`.
- Não lido por instrução do prompt: `docs/audits/**`.

---

## 1. Resumo do diagnóstico

| Pergunta                    | Resposta curta                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O portal existe?            | **Não.** Não há `apps/portal`. O que existe é uma vitrine mínima dentro de `apps/web`: `/imoveis` e `/imoveis/[slug]`.                                                                             |
| A gestão existe?            | **Sim**, madura: 36 rotas sob `/app`, shell próprio, G3 aprovado e implantado em homologação.                                                                                                      |
| Os dados do portal existem? | **Parcialmente.** A API pública é escopada por imobiliária (`/public/organizations/:orgSlug/listings`), sem busca nacional, sem filtros, sem foto, sem estatística, sem lead público e sem alerta. |
| Venda existe?               | **Não existe nada.** Nenhuma tabela, contrato, rota ou regra. Todo o módulo de Vendas do HANDOFF é backend novo + frontend novo.                                                                   |
| Falta muito no backend?     | Sim. 5 das 7 ondas dependem de contrato, migration e rota novos. O plano abaixo separa isso em PRs de backend antes dos PRs de tela.                                                               |

### Bloqueio de entrada (precisa do dono antes da Onda 1)

**`PROMPT_apps-portal.md` não existe no repositório.** O prompt orquestrado o cita como contexto base e a Onda 1 manda seguir a "Etapa 4" dele; as Ondas 1 e 2 dependem dele para SEO, JSON-LD, tags de cache e limiares. Sem esse arquivo, a Onda 2 fica sem especificação de cache e indexação e ela teria que ser inventada — o que o próprio prompt proíbe. Ver §8.

---

## 2. Estado atual do repositório (fatos)

### 2.1 Aplicações

- `apps/web` — Next 16.3.4, React 19.2.3, App Router, vitest. Rotas: públicas/auth (`/`, `/imoveis`, `/imoveis/[slug]`, `/login`, `/register`, `/convite`, `/esqueci-senha`, `/redefinir-senha`, `/situacao-da-conta`, `/dashboard` legada, `/dev/calibration`), portal do cliente (`/portal/entrar`, `/inquilino`, `/proprietario`), painel (36 rotas sob `/app`), plataforma (`/plataforma`, `/plataforma/imobiliarias[/id]`, `/plataforma/planos`) e BFF em `/api/*`.
- `apps/api` (Fastify), `apps/worker`, `apps/mobile` (Expo, só vistoria/visita), `apps/meta-mcp`.
- `packages/`: `ui`, `contracts` (29 módulos), `domain`, `db`, `integrations`, `storage`, `observability`, `config`.

### 2.2 Design system atual (gestão)

- `packages/ui` exporta 37 componentes (`packages/ui/src/index.ts`). Já existem: `Button`, `IconButton`, `Field`, `Input`, `Textarea`, `Select`, `SearchInput`, `MoneyInput`, `AsyncCombobox`, `Checkbox`, `Radio`, `Switch`, `Badge`, `Tag`, `StatusBadge`, `Avatar`, `Kpi`, `Card`, `DataTable`, `Pagination`, `Tabs`, `SegmentedControl`, `Breadcrumb`, `Dropdown`, `Tooltip`, `Modal`, `ConfirmModal`, `Drawer`, `Inspector`, `Toast`, `EmptyState`/`ErrorState`/`PermissionDenied`/`DisconnectedIntegration` (`StateViews.tsx`), `Skeleton`, `Spinner`, `Divider`, `Stack`/`Group`, `MoneyValue`, `Icon`.
- Lacunas de primitivo na gestão: **Chip** (hoje se usa `Tag`) e **Accordion** (não existe; único uso é `<details>` cru em `members-client.tsx:294`).
- Tokens em `packages/ui/src/styles/tokens.css`: famílias `--peg-*` e `--aluguei-brand*` (verde `#41945D` em `--aluguei-brand`). Tema escuro por `[data-theme='dark']`.
- Fonte: **Inter** por `next/font/google` em `apps/web/src/app/layout.tsx`.
- Catálogo: **não há Storybook**. Existe `/dev/calibration` (`apps/web/src/app/dev/calibration/`), bloqueada em produção — é a base natural para a `/dev/componentes` pedida na Onda 1.
- **Não existe constante `BRAND`.** "Aluguei.app" está escrita à mão: chrome da UI em `app-shell.tsx` (3), `platform-shell.tsx` (1), `lib/account-status.ts` (3), `app/page.tsx`, `imoveis/page.tsx`, `login/page.tsx`, `dev/calibration/page.tsx` (2 cada), mais `metadata.title` em ~50 páginas e 2 ocorrências em 7 páginas de conta/portal.

### 2.3 Navegação e plano

- Menu: lista estática em `apps/web/src/lib/navigation.ts`, filtrada por **RBAC de papel** (`can()` em `lib/rbac.ts`). Grupos atuais: CRM, Imóveis, Operação, Financeiro, Crescimento, Administração. Shell em `apps/web/src/components/shell/app-shell.tsx` (`FOCUS_PREFIXES` na linha 22).
- **Não existe cadeado por plano, tela de upgrade nem `PLAN_MODULE_NOT_INCLUDED`** no código. Limites de plano existem só no admin da plataforma (`maxUsers`, `maxProperties`, `maxPublishedListings` em `packages/db/src/schema/platform.ts` e `packages/domain/src/platform/plan-limits.ts`), **sem preço, sem módulos por plano e sem limite de locações ativas**.
- A sidebar de referência (`telas/gestao/Painel Sidebar.dc.html`) traz os grupos Visão Geral · CRM · Imóveis · **Vendas** · Operação · Financeiro · Crescimento · Administração, e a lista de itens bloqueados no plano Anunciante: `pipeline, agenda, inbox, visitas, propostas, credito, contratos, vistorias, locacoes, fin, cobrancas, pagamentos, repasses, conciliacao, ledger, marketing, vendas, negociacoes`.

### 2.4 Superfície pública da API (o que o portal teria hoje)

| Existe                                                                                                                                                  | Não existe                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /public/organizations/:orgSlug/listings` (só `limit`/`offset`) e `/:slug` — `apps/api/src/routes/public.ts:94,126`                                 | Busca nacional cross-org, filtros (cidade, bairro, tipo, quartos, valor), ordenação, paginação por página                                     |
| `POST /auth/*`, `POST /portal/auth/consume`, webhooks, health                                                                                           | `POST /public/listings/:id/leads` (lead do site)                                                                                              |
| Endereço público limitado a bairro/cidade/UF (`isPublic`); `lat`/`lng` existem em `packages/db/src/schema/properties.ts:76-77` e **nunca** são expostos | `search_alerts` (alerta de imóvel), `page_stats` (mediana/faixa/contagem), vizinhos geográficos                                               |
| `packages/storage` tem `getPresignedDownloadUrl` (`src/types.ts:47`)                                                                                    | **Nenhuma rota devolve URL de foto**: `publicListingSchema.media` traz só `{kind, isPublic}` → hoje o site público não consegue exibir imagem |

### 2.5 Imóvel, anúncio e fotos

- `packages/contracts/src/property.ts` — **só aluguel**: `monthlyRentCents`, `condoFeeCents`, `iptuCents`, `securityDepositCents`, `minimumLeaseMonths`, `availableFrom`. **Não existe finalidade** (`purpose`) nem preço de venda.
- Tipos: `APARTMENT | HOUSE | COMMERCIAL | LAND` — o design pede 7 tipos com cor (`--tipo-apartamento`, `casa`, `casa-condominio`, `sobrado`, `kitnet-studio`, `cobertura`, `sala-loja`).
- Fotos: tabela `property_media` (`packages/db/src/schema/properties.ts:149`) com `kind`, `storage_key`, `is_public`. **Sem `caption`, sem ordem, sem capa** — o HANDOFF (Ajustes · fotos) exige legenda, mínimo de 5 e aviso de EXIF.
- Anúncio: `/listings` com máquina de estado DRAFT→READY→PUBLISHED→PAUSED→ARCHIVED e publicação por canal (`apps/api/src/routes/channels.ts`).

### 2.6 Integrações (estado real)

| Integração                               | Estado no código                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canal Pro (ZAP/VivaReal), OLX, Imovelweb | **Registrados sem adapter** (`packages/integrations/src/channels/registry.ts`, `adapter: null`). Só `fake` funciona; a rota responde 404 "canal não configurado". Fila, publicações e worker prontos. |
| Asaas                                    | Adapter implementado, `IMPLEMENTED_NOT_LIVE_VERIFIED`; sem chave cai no FAKE                                                                                                                          |
| Clicksign                                | Adapter implementado, `IMPLEMENTED_NOT_LIVE_VERIFIED`; D4Sign sem adapter                                                                                                                             |
| Serasa/SPC                               | Esqueleto que falha tipado (`BLOCKED_PROVIDER_CONTRACT`)                                                                                                                                              |
| Meta Ads / WhatsApp                      | Adapters reais com `dry_run`/FAKE                                                                                                                                                                     |

### 2.7 IA e áudio

Transcrição e sugestão existem **acopladas à vistoria**: `InspectionAiProvider.transcribeAudio`, execução no worker (`apps/worker/src/inspectionJobs.ts:60`), sugestões em `inspection_ai_suggestions` com aceite humano (`PATCH /inspections/:id/ai-suggestions/:id`). **Não existe** transcrição genérica nem cadastro de imóvel por áudio.

### 2.8 Gates (o que "9 gates" significa aqui)

`.github/workflows/ci.yml`: `format:check` · `lint` · `typecheck` · `security:scan` · `security:audit --audit-level=critical` · `test` · `test:pg` · `db:generate` + verificação de drift de migration · `build`; mais os jobs `e2e` (Playwright, `tests/e2e`) e `image` (build das imagens). Suíte atual: 1165 testes, `test:pg` 37/37, Playwright 43/43.

---

## 3. Mapa de telas → rota → componentes → dados → o que falta

Legenda de backend: **OK** = já existe · **ADAPTAR** = existe e precisa de campo/rota nova · **NOVO** = não existe nada.

### 3.1 Portal (`apps/portal`, Guton) — app inteiro é novo

| Tela               | Rota                                             | Referência                                                                       | Componentes novos                                                                                                                                                                                              | Backend                                                                                              |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Home               | `/`                                              | portal/01-home · `home-desktop`, `home-mobile`                                   | SiteHeader, SearchHero, MosaicoTipos, ImovelCard, CidadesComMaisImoveis, FaixaAlerta, BuscasPopulares, SiteFooter, Logotipo                                                                                    | **NOVO**: busca nacional, contagem por cidade/tipo, cidade por IP                                    |
| Busca              | `/alugar/[...seg]`, `/comprar/[...seg]`          | portal/02-busca · `busca-desktop`, `busca-poucos`, `busca-vazia`, `busca-mobile` | FaixaTipo, Breadcrumb, FiltrosLaterais, GavetaFiltros, ChipsFiltro, Ordenacao, ResumoPreco, Paginacao, BairrosProximos, LinksModificadores, FaqCalculado, AlertaImovel                                         | **NOVO**: filtros, slug canônico, `page_stats` (mediana/faixa/por quartos), vizinhos, limiares ≥5/≥3 |
| Anúncio            | `/imovel/[slug]`                                 | portal/03-anuncio · 4 âncoras                                                    | GaleriaImovel, CabecalhoAnuncio, AtributosImovel, DescricaoImovel, Caracteristicas, LocalBairro, ComparacaoMediana, AnuncianteInfo, BlocoValor, FormContato, BotaoWhatsApp, OutrosNoBairro, BarraContatoMobile | **ADAPTAR**: URL de foto + legenda; **NOVO**: finalidade e preço de venda, mediana do bairro         |
| Estados do contato | —                                                | portal/06-complementos · `contato-estados`                                       | (estados do FormContato)                                                                                                                                                                                       | **NOVO**: `POST /public/listings/:id/leads` com consentimento LGPD, rate limit e 429                 |
| Indisponível       | `/imovel/[slug]` (410/301)                       | portal/04-outras · `indisponivel`                                                | AvisoIndisponivel                                                                                                                                                                                              | **ADAPTAR**: status removido/alugado/vendido no público                                              |
| Vitrine            | `/imobiliaria/[orgSlug]`                         | portal/04-outras · `vitrine`                                                     | CabecalhoVitrine, FiltroFinalidade                                                                                                                                                                             | **OK** (já é escopado por org) + CRECI no público                                                    |
| Alerta             | modal + `/alerta/confirmado`, `/alerta/cancelar` | portal/04-outras · `alerta`                                                      | AlertaForm, AlertaConfirmar, AlertaCancelar                                                                                                                                                                    | **NOVO**: `search_alerts`, confirmação por e-mail, cancelamento                                      |
| Mapa do site / 404 | `/mapa-do-site`, 404                             | portal/04-outras · `mapa`, `erro404`                                             | SeletorUF, ListaLinks                                                                                                                                                                                          | **NOVO**: lista de páginas indexáveis                                                                |
| Para imobiliárias  | `/para-imobiliarias/`                            | portal/05 · `b2b-home`                                                           | HeroB2B, CanaisIntegrados, FluxoSistema, DoisCaminhos                                                                                                                                                          | — (ver risco R1)                                                                                     |
| Planos             | `/planos/`                                       | portal/05 · `planos`                                                             | TabelaPlanos, FaqPlanos                                                                                                                                                                                        | **NOVO**: view pública de planos + `monthly_price_cents` (nulo → "Fale com a gente")                 |
| Anunciar           | `/para-imobiliarias/anunciar/`                   | portal/06 · `anunciar`                                                           | HeroPlano, ListaBeneficios, CardPlano                                                                                                                                                                          | —                                                                                                    |
| Gestão por módulo  | `/para-imobiliarias/gestao/`                     | portal/06 · `gestao`                                                             | ListaModulos                                                                                                                                                                                                   | **NOVO**: módulos por plano                                                                          |

### 3.2 Entrada e conta (`apps/web`, visual do portal)

| Tela                        | Rota                                 | Existe hoje            | O que muda                            | Backend                               |
| --------------------------- | ------------------------------------ | ---------------------- | ------------------------------------- | ------------------------------------- |
| Login                       | `/login`                             | sim                    | visual do portal, erro inline         | OK                                    |
| Cadastro 6 etapas           | `/register?plano=`                   | sim (formulário único) | reescrever em 6 etapas, ler `?plano=` | **ADAPTAR**: plano pedido no cadastro |
| Convite                     | `/convite`                           | sim                    | visual                                | OK                                    |
| Esqueci / redefinir         | `/esqueci-senha`, `/redefinir-senha` | sim                    | visual                                | OK                                    |
| Conta em análise / suspensa | `/situacao-da-conta`                 | sim                    | visual + textos                       | OK                                    |

### 3.3 Gestão (`apps/web`, tokens atuais)

| Tela                      | Rota                                    | Existe                              | O que muda                                        | Backend                                                   |
| ------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Sidebar                   | shell                                   | sim (`lib/navigation.ts`)           | marca, grupo Vendas, cadeado por plano            | **NOVO**: módulos do plano no `/auth/me`                  |
| Visão Geral               | `/app`                                  | sim                                 | card "Demanda por bairro", falha de canal na fila | **NOVO**: agregado de alertas por bairro                  |
| Módulo bloqueado          | qualquer                                | **não**                             | tela "Fora do seu plano"                          | **NOVO**: 403 `PLAN_MODULE_NOT_INCLUDED`                  |
| Diálogo de publicação     | `/app/listings`                         | sim                                 | 4 canais pré-marcados + motivos de bloqueio       | **ADAPTAR**: motivos (fotos<5, bairro, CRECI); ver R1     |
| Cadastro · Valores        | `/app/properties/new`                   | sim (Focus Mode)                    | finalidade, venda, exclusividade, sugestão de IA  | **NOVO**: finalidade + valores de venda + exclusividade   |
| Negociações               | `/app/vendas/negociacoes`               | **não**                             | board + gaveta                                    | **NOVO** (módulo inteiro)                                 |
| Pipeline                  | `/app/crm/pipeline`                     | sim                                 | alternância Aluguel/Venda, origem do lead         | **NOVO**: funil de venda                                  |
| Integrações               | `/app/admin/integrations`               | sim                                 | estado por portal/provedor                        | **ADAPTAR** (ver R1)                                      |
| Contrato de venda         | `/app/vendas/negociacoes/[id]/contrato` | **não**                             | modelo + envelope                                 | **NOVO** (usa templates/assinatura existentes)            |
| Painel de vendas          | `/app/vendas`                           | **não**                             | KPIs do mês, comissão                             | **NOVO**                                                  |
| Cobrança e split          | `/app/charges/[id]`                     | **não** (só a lista `/app/charges`) | modo de teste, split, "emitir real" desativado    | OK na API                                                 |
| Limite de contratos       | ativar locação                          | **não**                             | diálogo 409 "100 de 100"                          | **NOVO**: limite `activeLeases` no plano                  |
| Envelope da locação       | `/app/contracts/[id]`                   | sim                                 | selo modo de teste                                | OK                                                        |
| Análise cadastral         | `/app/screening/[id]`                   | sim                                 | aviso Serasa/SPC em breve                         | OK                                                        |
| Fotos e legendas          | `/app/properties/new` (etapa 5)         | sim                                 | caption, IA sugerida, mínimo 5, aviso de EXIF     | **ADAPTAR**: `caption`, ordem, capa em `property_media`   |
| Plano e uso               | `/app/settings/plano`                   | **não**                             | plano, uso, módulos, pedir troca                  | **NOVO**: `GET /me/plan-usage`                            |
| Cadastro por áudio        | `/app/properties/new?modo=audio`        | **não**                             | captura, processamento, revisão                   | **NOVO**: transcrição genérica + sugestão com confirmação |
| Aprovação de imobiliárias | `/plataforma/imobiliarias`              | sim                                 | coluna "Plano pedido"                             | **ADAPTAR**                                               |

### 3.4 Área do cliente (`apps/web`)

| Tela                            | Rota                        | Existe                          | Backend   |
| ------------------------------- | --------------------------- | ------------------------------- | --------- |
| Pedir link / enviado / expirado | `/portal/entrar`            | sim                             | OK        |
| Inquilino início                | `/inquilino`                | sim                             | OK        |
| Pagar com Pix                   | `/inquilino/cobrancas/[id]` | **não** (hoje é lista embutida) | OK na API |
| Contrato e vistoria             | `/inquilino`                | sim                             | OK        |
| Proprietário                    | `/proprietario`             | sim                             | OK        |

---

## 4. Ondas propostas (cada linha = 1 PR com os 9 gates)

O prompt original tem 6 ondas. O diagnóstico mostra que 5 delas dependem de backend novo, então cada onda que precisa de contrato/migration vira **dois PRs**: `A` (contrato + domínio + rota + migration + teste) e `B` (tela + Playwright + screenshots). Sem isso, um PR sozinho ficaria grande demais para revisar e o gate `test:pg` perderia o RED→GREEN por defeito.

| Onda | PR  | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Arquivos principais                                                                                                                                                                                                            |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 1A  | Módulos e preço no plano: `modules[]`, `monthlyPriceCents` (nulo permitido), `activeLeases` no limite; `/auth/me` devolve plano e módulos; 403 `PLAN_MODULE_NOT_INCLUDED`; migration + pré-voo                                                                                                                                                                                                                                                                                                                           | `packages/db/src/schema/platform.ts`, `packages/contracts/src/platform.ts`, `packages/domain/src/platform/plan-limits.ts`, `apps/api/src/routes/platform.ts`, `apps/api/src/plugins/authz.ts`, `packages/db/migrations/00XX_*` |
| 1    | 1B  | `apps/portal` (Next 16.3.4) com `achouimovel-portal.css` e Guton; componentes base do portal; rebrand da gestão (`BRAND`, alias `--aluguei-brand*`→`--brand-*`), sidebar com grupo Vendas + cadeado, tela de upgrade, `AvisoModoTeste`, `/dev/componentes`                                                                                                                                                                                                                                                               | `apps/portal/**` (novo), `apps/web/src/lib/brand.ts` (novo), `apps/web/src/lib/navigation.ts`, `apps/web/src/components/shell/app-shell.tsx`, `packages/ui/src/styles/tokens.css`, `apps/web/src/app/dev/`                     |
| 2    | 2A  | Backend do portal, com o que o SEO exige (`docs/frontend/PORTAL_SEO.md`, ADR-099): finalidade + valores de venda e os 7 tipos do design; `caption`/ordem/capa em `property_media`; URL pública de foto estável; **slug do anúncio único no país** com histórico para 301; busca pública nacional com filtros e contagem do recorte; `page_stats` com o limiar de 5; bairros vizinhos; fonte do sitemap (recortes com ≥3); status de remoção legível no público (410); `POST /public/listings/:id/leads`; `search_alerts` | `packages/contracts/src/{property,public}.ts`, `packages/db/src/schema/properties.ts`, `apps/api/src/routes/public.ts`, `packages/domain/src/**`, migrations                                                                   |
| 2    | 2B  | Telas do portal: Home, Busca (4 estados), Anúncio (3 variações + móvel), Indisponível (410), Vitrine, Alerta, Mapa do site, 404; robots, sitemap, canônica, JSON-LD e cache por tag conforme `PORTAL_SEO.md`; lançamento por cidade em lotes de 50 a 100 páginas indexáveis                                                                                                                                                                                                                                              | `apps/portal/src/app/**`, `tests/e2e/src/*.spec.ts`                                                                                                                                                                            |
| 3    | 3A  | View pública de planos; plano pedido no cadastro                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `apps/api/src/routes/public.ts`, `packages/contracts/src/platform.ts`                                                                                                                                                          |
| 3    | 3B  | `/para-imobiliarias/`, `/anunciar/`, `/gestao/`, `/planos/`; em `apps/web`: login, cadastro em 6 etapas, convite, senha, situação da conta com o visual do portal                                                                                                                                                                                                                                                                                                                                                        | `apps/portal/src/app/**`, `apps/web/src/app/{login,register,convite,esqueci-senha,redefinir-senha,situacao-da-conta}/**`                                                                                                       |
| 4    | 4A  | `GET /me/plan-usage`; demanda por bairro (agregado de alertas); limite de locações ativas com 409; plano pedido na fila de aprovação                                                                                                                                                                                                                                                                                                                                                                                     | `apps/api/src/routes/{dashboard,platform}.ts`, `apps/api/src/platform/usage.ts`                                                                                                                                                |
| 4    | 4B  | Ajustes das telas existentes da gestão (Visão Geral, publicação, Pipeline, Integrações, Cobrança e split, limite, envelope, análise, Fotos e legendas, Plano e uso, fila da plataforma) + `/app/charges/[id]`                                                                                                                                                                                                                                                                                                            | `apps/web/src/app/app/**`, `apps/web/src/app/plataforma/**`                                                                                                                                                                    |
| 5    | 5A  | Módulo de Vendas no backend: finalidade no funil, negociação, proposta de compra com contraproposta, documentação, exclusividade com prazo, comissão captador/vendedor, contrato de compra e venda sobre os templates existentes                                                                                                                                                                                                                                                                                         | `packages/db/src/schema/` (tabelas novas), `packages/contracts/src/`, `packages/domain/src/sales/` (novo), `apps/api/src/routes/sales.ts` (novo), migrations                                                                   |
| 5    | 5B  | Telas novas da gestão: cadastro com venda e exclusividade, Negociações, contrato de venda, painel de vendas                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/web/src/app/app/vendas/**` (novo), `apps/web/src/app/app/properties/new/**`                                                                                                                                              |
| 5    | 5C  | Cadastro por áudio e fotos: transcrição genérica + sugestão com confirmação humana, captura no celular, revisão com campos ligados à transcrição                                                                                                                                                                                                                                                                                                                                                                         | `packages/integrations/src/**`, `apps/worker/src/**`, `apps/api/src/routes/properties.ts`, `apps/web/src/app/app/properties/new/**`                                                                                            |
| 6    | 6   | Área do cliente (`/inquilino/cobrancas/[id]`, link de uso único, extrato do proprietário) e versões de celular da gestão                                                                                                                                                                                                                                                                                                                                                                                                 | `apps/web/src/app/{inquilino,proprietario,portal}/**`                                                                                                                                                                          |

Paralelismo possível: 2B e 4B depois da Onda 1; 5A pode começar junto com 2A (não se tocam). 5B depende de 5A; 3B depende de 1B.

---

## 5. Componentes novos (PascalCase igual ao HANDOFF)

**Portal** (`apps/portal/src/components/`, não em `packages/ui` — ver R2): SiteHeader, SiteFooter, Logotipo, SearchHero, MosaicoTipos, ImovelCard, CidadesComMaisImoveis, FaixaAlerta, BuscasPopulares, FaixaTipo, Breadcrumb, FiltrosLaterais, GavetaFiltros, ChipsFiltro, Ordenacao, ResumoPreco, Paginacao, BairrosProximos, LinksModificadores, FaqCalculado, AlertaImovel, AlertaForm, AlertaConfirmar, AlertaCancelar, GaleriaImovel, CabecalhoAnuncio, AtributosImovel, DescricaoImovel, Caracteristicas, LocalBairro, ComparacaoMediana, AnuncianteInfo, BlocoValor, FormContato, BotaoWhatsApp, OutrosNoBairro, BarraContatoMobile, AvisoIndisponivel, CabecalhoVitrine, FiltroFinalidade, SeletorUF, ListaLinks, HeroB2B, CanaisIntegrados, FluxoSistema, DoisCaminhos, TabelaPlanos, FaqPlanos, HeroPlano, ListaBeneficios, CardPlano, ListaModulos, BlocoGrade, EstadoVazio, Botao, Campo, Chip, Segmentado, Gaveta, Acordeao.

**Gestão** (`packages/ui` quando for primitivo, `apps/web` quando for de tela): `Accordion` e `Chip` (lacunas reais do design system), `AvisoModoTeste`, e — nomes propostos, porque o HANDOFF não os batiza — `PlanoBloqueado` (tela "Fora do seu plano") e `CadeadoModulo` (item de menu bloqueado). Confirmar os dois nomes na aprovação.

---

## 6. Dependências novas

| Dependência                                       | Onde          | Justificativa                                                                     |
| ------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `next@16.3.4`, `react@19.2.3`, `react-dom@19.2.3` | `apps/portal` | Mesmas versões já usadas em `apps/web` — nenhuma versão nova entra no repositório |
| `vitest@4.1.10` (dev)                             | `apps/portal` | Padrão do monorepo                                                                |

**Nenhuma biblioteca nova é necessária**: fonte por `next/font/local` (nativo), JSON-LD por `<script type="application/ld+json">`, slider por `<input type="range">`, acordeão por `<details>`/ARIA. Para o `LocalBairro` **não** proponho biblioteca de mapa: tile externo significaria dependência nova, requisição a terceiro a partir do navegador do visitante e risco de vazar coordenada — o bairro aproximado pode ser desenhado com o polígono/rótulo que já temos. Se o dono quiser mapa real, vira decisão de produto com ADR.

---

## 7. Riscos

**R1 · "Portais parceiros integrados" não bate com o código.** O PROMPT e o HANDOFF mandam mostrar Canal Pro (ZAP/VivaReal), OLX e Imovelweb como "Conectado/Integrado" em todos os planos. No código eles estão **registrados sem adapter**: a publicação responde 404 e só o canal `fake` funciona. Escrever "Integrado" na UI seria declarar integração real sem evidência, o que `AGENTS.md` proíbe. Proposta: a UI mostra o estado real por canal vindo da API (`Conectado` só com adapter + evidência de sandbox; senão `Em preparação`), e a página `/para-imobiliarias` descreve os canais como previstos, não como ativos. **Precisa de decisão do dono.**

**R2 · Colisão de tokens `--brand-*` em `apps/web`.** O portal define `--brand-accent: #037A4B` e a gestão vai renomear `--aluguei-brand*` → `--brand-*` (`#41945D`). Como as telas de conta ficam em `apps/web` "com o visual do portal", os dois conjuntos conviveriam no mesmo app. Proposta: tokens do portal aplicados só sob um escopo (`[data-tema="portal"]` no layout das rotas de conta), alias da gestão mantido, e um teste de CSS que falha se os dois conjuntos forem definidos no mesmo escopo.

**R3 · Fotos do portal.** Nenhuma rota devolve URL de imagem e o teste de privacidade proíbe `storage_key` no HTML. Precisa de decisão na 2A entre URL assinada de curta duração e caminho público por CDN. Some-se a isso que Storage/Asaas/Clicksign seguem com credencial de sandbox pendente (G4) — o portal pode ficar `IMPLEMENTED_NOT_LIVE_VERIFIED` para foto até isso destravar.

**R4 · Cidade por IP.** Depende de header de geolocalização do proxy/edge. A homologação no Coolify não garante esse header hoje. Sem ele, a Home cai no texto genérico — que já é o comportamento correto para o HTML em cache. Registrar ADR e tratar a ausência como caso normal, não erro.

**R5 · `page_stats` não tem fonte.** Mediana, faixa, mediana por quartos e vizinhos não existem em lugar nenhum. É agregação nova sobre anúncios publicados, com os limiares do prompt (≥5 para estatística, ≥3 para indexar, ≥5 com modificador) e cache por tag. É o maior item de backend da Onda 2A.

**R6 · Onda 5 é um módulo de produto, não uma onda de frontend.** Vendas exige tabelas, contratos, domínio, rotas, migrations e regras de comissão do zero. Pelo tamanho, sugiro tratá-la como fase própria depois da Onda 4, com plano e ADRs próprios.

**R7 · Rotas legadas do site em `apps/web`.** `/`, `/imoveis` e `/imoveis/[slug]` passam a conflitar com o portal. Há teste E2E de crawler (`tests/e2e/src/g2-b2-crawler.spec.ts`) apontando para elas. Decidir na Onda 2B entre redirecionar (301) para o portal ou manter, e atualizar o teste no mesmo PR — sem remover teste.

**R8 · Divergências dentro do pacote de design.** O CONTEXTO (seção 6) diz "Manrope em tudo"; a entrega final usa **Guton** nos tokens e nas telas. Vale o mais recente (README/HANDOFF/PROMPT de 22/09): Guton no portal, Inter na gestão. As fontes vieram só em `.otf` (~52 KB cada, 6 pesos em 3 cópias dentro do pacote) — converter para `woff2` e manter uma cópia só é trabalho da Onda 1B; a **licença de uso da Guton em produção é pendência do dono**.

**R9 · Tipos de imóvel.** O design tem 7 tipos com cor; o domínio tem 4 (`APARTMENT|HOUSE|COMMERCIAL|LAND`). Ampliar o vocabulário mexe nos CHECKs de banco criados na trilha G do G3 (migration 0022) e no teste que compara banco × constantes. Entra na 2A com pré-voo.

---

## 8. Pendências do dono

1. **`PROMPT_apps-portal.md`** — arquivo citado como contexto base e ausente do repositório (SEO, JSON-LD, cache por tag, limiares). Bloqueia a especificação da Onda 2B.
2. Decisão do R1 (como nomear o estado dos portais parceiros na UI).
3. Preços e limites dos planos (`monthly_price_cents`, locações ativas, usuários) — até lá, "Fale com a gente".
4. CNPJ real do rodapé; logos dos portais parceiros; ícones de redes sociais.
5. Licença da fonte Guton para uso em produção.
6. Credenciais de sandbox de Storage/Asaas/Clicksign (já registradas como bloqueio do G4) — afetam foto do portal e os selos de modo de teste.

---

## 9. Definição de pronto por onda

Além dos 9 gates com exit 0 e sem cache (§2.8), cada PR de onda entrega: screenshots desktop 1440 e celular 390 de cada tela em `docs/audits/<data>/evidence/front/<onda>/` comparadas com a tela de referência; estados vazio, carregando, erro e sem permissão onde houver dado; contraste 4,5:1, foco visível, alvo de toque ≥44px, ícone com rótulo, `prefers-reduced-motion`; no portal, teste Playwright provando que o HTML não traz rua, número, complemento, CEP, coordenada, proprietário nem `storage_key`; nenhum `force-dynamic` em página pública; nenhum teste removido ou pulado; `docs/EXECUTION_STATE.md` atualizado e lista de pendências no PR.

---

## 10. Decisões tomadas (2026-09-23)

O usuário delegou as quatro decisões em aberto ("siga, você decide o que for melhor"). Estão em
`docs/DECISIONS.md` como **ADR-097**, e valem sobre o que este documento propunha:

| Ponto                                 | Decisão                                                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 · portais parceiros                | A UI mostra o estado real vindo da API: "Conectado" só com adapter e evidência de sandbox; hoje Canal Pro, OLX e Imovelweb aparecem como "Em preparação". O material de marketing segue a mesma regra.                              |
| Pendência 1 · `PROMPT_apps-portal.md` | Não espera o arquivo: a Onda 2 escreve `docs/frontend/PORTAL_SPEC.md` a partir das telas de referência, dos limiares do prompt orquestrado e dos padrões do repositório. O que faltar vira pendência escrita, não número inventado. |
| R6 · Vendas                           | Sai da Onda 5 e vira **fase própria depois da Onda 4**, com ADRs e migrations próprios.                                                                                                                                             |
| R7 · rotas legadas                    | `/`, `/imoveis` e `/imoveis/[slug]` passam a redirecionar (301) para o portal na Onda 2B, no mesmo PR que atualiza o crawler E2E. Nenhum teste removido.                                                                            |

A ordem das ondas passa a ser: 1A → 1B → 2A → 2B → 3A → 3B → 4A → 4B → **fase Vendas** → 6.

## 11. Estado da execução

- **Onda 1A — feita.** Plano com módulos (`PLAN_MODULES`), preço mensal só para exibição e limite de
  locações em vigor; `/auth/me` devolve o plano; 403 `PLAN_MODULE_NOT_INCLUDED` por grupo de rotas;
  migration 0024 sem perda de acesso para quem já existia. ADR-095 e ADR-096.
- **Onda 1B — feita.**
  - `apps/portal`: app novo (Next 16.3.4, React 19.2.3 — nenhuma versão nova no repositório), tokens
    da entrega, Guton por `next/font/local`, e os componentes base — Logotipo, SiteHeader,
    SiteFooter, Botao, Campo, CheckboxLgpd, Chip, Segmentado, Gaveta, Acordeao, BlocoGrade,
    EstadoVazio, Breadcrumb e ImovelCard. Catálogo em `/dev/componentes`, fora do ar em produção.
  - Gestão: `BRAND` num arquivo só e `<title>` por template de layout; tokens `--aluguei-brand*` →
    `--brand*` com alias temporário; grupo **Vendas** no menu com "Negociações" marcado como Novo;
    cadeado por módulo lendo `plan.modules` do `/auth/me`; tela `/app/plano` ("Fora do seu plano");
    `AvisoModoTeste` em `packages/ui`. ADR-098.
- **Próxima — Onda 2A.** Backend do portal: finalidade e valores de venda no imóvel, legenda/ordem/
  capa em `property_media`, URL pública de foto (decisão do R3), busca nacional com filtros e slug
  canônico, `page_stats`, vizinhos, lead público e alerta de busca. Junto dela sai
  `docs/frontend/PORTAL_SPEC.md`, que ocupa o lugar do `PROMPT_apps-portal.md` ausente (ADR-097).

### O que ainda não existe de propósito

O portal não tem `/` nem telas públicas: elas são a Onda 2B e dependem do backend da 2A. Hoje o app
serve só o catálogo de componentes, e por isso ainda não entra no compose da homologação.
