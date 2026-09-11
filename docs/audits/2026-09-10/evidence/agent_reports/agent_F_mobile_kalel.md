# Agente F — Auditoria do Mobile (Aluguei) + Reconhecimento do frontend de referência "Kal El"

- Data: 2026-09-10
- Modo: SOMENTE LEITURA. Nenhum arquivo do repositório Aluguei ou da pasta Kal El foi criado/alterado/apagado; nenhum `pnpm/npm install/build/test/dev/expo` executado; nenhum servidor iniciado; sem rede. Git usado apenas em modo leitura (`log`, `show --stat`, `status`, `branch --show-current`).
- Fonte de verdade: código atual. `docs/` citado só como evidência histórica.
- O arquivo `KE:.env` existe (491 bytes, listagem da raiz) e NÃO foi lido (possíveis segredos).

## Convenções de evidência

- Caminho sem prefixo = relativo à raiz do worktree `C:\Users\pablo\Documents\OpenCode\Aluguei-app\.claude\worktrees\aluguei-technical-audit-6cea11\`.
- `KE:` = `C:\Users\pablo\Documents\OpenCode\Kal El\`.
- `arquivo:N` ou `arquivo:N-M` = linha(s) no arquivo.
- Status de capacidade: **EXISTE** / **PARCIAL** / **AUSENTE**. **NÃO_DETERMINADO** = depende de execução em device/runtime (proibida nesta tarefa) ou de dado não disponível; o motivo é sempre informado.

---

## 0. Sumário executivo

### Mobile (`apps/mobile`)

- Classificação global: **MOBILE PARCIAL** (justificativa objetiva na seção 1.14).
- Consome a API real: 11 endpoints distintos (12 chamadas), e todos existem na API com método, path e payload compatíveis com `packages/contracts` (seção 1.10).
- Implementa um único fluxo: login → agenda (visitas SCHEDULED + CONFIRMED) → detalhe da visita e do imóvel vinculado → vistoria (ambientes, observações em texto, transições DRAFT→CAPTURING→PROCESSING→REVIEW→COMPLETED) → revisão somente leitura.
- Não implementa:
  - capacidades de corretor além de leitura parcial de agenda, visitas e imóvel (8 de 11 itens AUSENTES);
  - câmera, fotos, upload para storage, áudio e transcrição;
  - retomada de vistoria;
  - persistência de sessão e logout;
  - fila offline e detecção de conectividade no nativo.
- Testes: 1 arquivo, 5 casos, só do cliente HTTP (`apps/mobile/src/api.test.ts:50,83,105,115,141`).

### Kal El (`KE:`)

- Stack e estilo:
  - monorepo pnpm; CMS em Next 14.2.35 + React 18.3.1 (`KE:apps/cms/package.json:19-21`);
  - design system `@kal-el/design-system` em CSS puro com custom properties `--peg-*` e classes `.peg-*`;
  - sem Tailwind e sem CSS Modules.
- Existe um "PEG Product Design System" (`KE:design-system/README.md:1`), da mesma família do Aluguei:
  - os 36 arquivos da cópia do PEG no Aluguei (`design-source/peg-product-design-system/`) existem no Kal El com o mesmo caminho relativo;
  - diferenças: apenas formatação, EOL ou o README;
  - o Kal El acrescenta `references/kal-el-final/` (11 arquivos) e a implementação em `KE:packages/design-system/src`.
- Mesmo stack de estilo e mesmos prefixos de nomes, mas valores e APIs divergem:
  - 46 tokens `:root` em comum, 25 com valor igual;
  - 61 classes `.peg-*` homônimas com regras independentes;
  - 17 componentes homônimos com props diferentes;
  - React 18 vs 19, Next 14 vs 16, TypeScript ^5.6 vs 6.0.3;
  - 0 arquivos com `"use client"` no DS do Kal El, contra 13 no `packages/ui`.
- Contaminação de domínio concentrada em:
  - `KE:packages/design-system/src/status.ts`;
  - partes de `KE:packages/design-system/src/components/Patterns.tsx` (catálogo de permissões, workflow editorial, links de artigo);
  - `Editor.tsx`;
  - todo o `KE:apps/cms`: páginas, `lib/api.ts`, `lib/auth.tsx`, `middleware.ts`, `globals.css` (`.kalel-*`), marca e fontes.

---

## PARTE 1 — MOBILE (`apps/mobile`)

### 1.1 Inventário (todos os arquivos lidos integralmente)

| Arquivo                                                | Linhas | Papel                                                             |
| ------------------------------------------------------ | -----: | ----------------------------------------------------------------- |
| `apps/mobile/App.tsx`                                  |    128 | router por estado, header "Voltar", banner offline, ErrorBoundary |
| `apps/mobile/index.ts`                                 |      4 | `registerRootComponent(App)`                                      |
| `apps/mobile/app.json`                                 |     13 | config Expo                                                       |
| `apps/mobile/package.json`                             |     24 | dependências/scripts                                              |
| `apps/mobile/tsconfig.json`                            |     14 | TS strict (estende `expo/tsconfig.base`)                          |
| `apps/mobile/vitest.config.ts`                         |      8 | vitest, ambiente `node`                                           |
| `apps/mobile/src/api.ts`                               |    268 | cliente HTTP único + sessão em memória                            |
| `apps/mobile/src/api.test.ts`                          |    146 | 5 testes do cliente HTTP                                          |
| `apps/mobile/src/connectivity.ts`                      |     49 | hook `useConnectivity`                                            |
| `apps/mobile/src/error-boundary.tsx`                   |     59 | `AppErrorBoundary`                                                |
| `apps/mobile/src/format.ts`                            |     22 | datas/percentual pt-BR                                            |
| `apps/mobile/src/labels.ts`                            |     48 | labels pt-BR                                                      |
| `apps/mobile/src/navigation.ts`                        |     21 | tipos `Route`/`Navigation`                                        |
| `apps/mobile/src/observation-cards.tsx`                |     90 | `ObservationCard`, `SuggestionCard`                               |
| `apps/mobile/src/tokens.ts`                            |     47 | tokens de cor/espaço/tipo locais                                  |
| `apps/mobile/src/types.ts`                             |    201 | tipos de resposta da API (cópia manual)                           |
| `apps/mobile/src/ui.tsx`                               |    326 | primitivos de UI locais                                           |
| `apps/mobile/src/screens/login-screen.tsx`             |     89 | Login                                                             |
| `apps/mobile/src/screens/agenda-screen.tsx`            |    137 | Agenda                                                            |
| `apps/mobile/src/screens/visit-detail-screen.tsx`      |    144 | Detalhe da visita                                                 |
| `apps/mobile/src/screens/inspection-screen.tsx`        |    495 | Vistoria                                                          |
| `apps/mobile/src/screens/inspection-review-screen.tsx` |    109 | Revisão                                                           |

- Total TS/TSX de código (sem configs): 2.383 linhas, incluindo 146 de teste.
- `apps/mobile/node_modules` só contém links pnpm para: expo, expo-status-bar, react, react-dom, react-native, react-native-web, typescript e `@types`.

Histórico (`git log -- apps/mobile`), 3 commits:

- `24b2e41` (2026-08-13): shell. Arquivos: App.tsx, app.json, index.ts, package.json, tsconfig.json.
- `79b6851` (2026-08-14): adiciona `connectivity.ts` e `error-boundary.tsx`.
- `0071059` (2026-08-17), "feat(mobile): field operations workflow": 19 arquivos, +2.285/−32 linhas.

### 1.2 Stack e dependências

**Dependências declaradas**

- `apps/mobile/package.json:13-18`:
  - `expo` 57.0.12
  - `expo-status-bar` ~57.0.1
  - `react` 19.2.3
  - `react-dom` 19.2.3
  - `react-native` 0.86.2
  - `react-native-web` ^0.21.2
- devDependencies (`apps/mobile/package.json:21-22`): `@types/react` 19.2.18, `typescript` 6.0.3.

**Configuração Expo** (`apps/mobile/app.json`)

- `sdkVersion` "57.0.0" (`:9`); `newArchEnabled` true (`:8`).
- `platforms` ios, android, web (`:10`).
- Único plugin: `expo-status-bar` (`:11`).
- Nenhuma permissão declarada (câmera, microfone, localização) e nenhum bloco ios/android.

**Módulos solicitados na auditoria** (verificados em `apps/mobile/package.json:12-23` e `apps/mobile/node_modules`)

| Módulo                                         | Situação                                                                                                                                            | Versão compatível com o SDK instalado*                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| expo-camera                                    | AUSENTE                                                                                                                                             | ~57.0.3 (`bundledNativeModules.json:34`)                                                                  |
| expo-image-picker                              | AUSENTE                                                                                                                                             | ~57.0.9 (`:54`)                                                                                           |
| expo-av                                        | AUSENTE                                                                                                                                             | não consta da lista do SDK 57 (grep sem ocorrência); a lista traz expo-audio (`:24`) e expo-video (`:96`) |
| expo-audio                                     | AUSENTE                                                                                                                                             | ~57.0.3 (`:24`)                                                                                           |
| expo-secure-store                              | AUSENTE                                                                                                                                             | ~57.0.1 (`:80`)                                                                                           |
| @react-native-async-storage/async-storage      | AUSENTE                                                                                                                                             | 2.2.0 (`:7`)                                                                                              |
| expo-file-system                               | não declarado nem importado; aparece só como dependência transitiva de `expo` no lockfile (`pnpm-lock.yaml:8122` snapshot `expo@57.0.12` → `:8138`) | ~57.0.2 (`:45`)                                                                                           |
| @react-native-community/netinfo / expo-network | AUSENTES                                                                                                                                            | 12.0.1 (`:11`) / ~57.0.1 (`:72`)                                                                          |
| expo-sqlite                                    | AUSENTE                                                                                                                                             | ~57.0.1 (`:87`)                                                                                           |
| react-native-safe-area-context                 | AUSENTE                                                                                                                                             | ~5.7.0 (`:113`)                                                                                           |

\* Arquivo lido: `apps/mobile/node_modules/expo/bundledNativeModules.json`. Nas linhas `:101` e `:103`, react 19.2.3 e react-native 0.86.2 coincidem com o instalado (`apps/mobile/node_modules/react-native/package.json` → 0.86.2).

**Observações de toolchain**

- `vitest` não está declarado no mobile (`apps/mobile/package.json:20-23`). O script `test` (`:10`) depende da devDependency da raiz (`package.json:32`, vitest 4.1.10; `node_modules/vitest` presente).
- TS estrito em `apps/mobile/tsconfig.json:4-7`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Não há dependência de `@aluguei/contracts` nem de `@aluguei/ui` (`apps/mobile/package.json:12-19`):
  - tipos copiados à mão ("espelham os schemas de packages/contracts", `apps/mobile/src/types.ts:1-4`);
  - tokens espelhados localmente (`apps/mobile/src/tokens.ts:1-4`).

### 1.3 Arquitetura

**Entrada e navegação**

- Entrada: `apps/mobile/index.ts:1-4` → `apps/mobile/App.tsx:96-102`, com `AppErrorBoundary` envolvendo `Root`.
- A navegação é uma pilha de rotas em `useState`, sem biblioteca de navegação (`apps/mobile/App.tsx:50-66`):
  - a rota inicial é sempre `login` (`App.tsx:14`, `:50`);
  - a pilha não é persistida.
- Existem 5 rotas (`apps/mobile/src/navigation.ts:7-12`):
  - `login`, `agenda`;
  - `visit-detail`, que carrega o objeto `Visit` inteiro;
  - `inspection` e `inspection-review`, que carregam `inspectionId`.
- O header com "‹ Voltar" só aparece quando há histórico (`App.tsx:75-89`).
- O banner "Sem conexão" é global (`App.tsx:70-74`).

**Cliente HTTP único** (`apps/mobile/src/api.ts:131-164`)

- Headers: `accept`, `content-type` e autenticação (`:133-145`).
- `RequestInit` contém só `method`, `headers` e `body`, sem `signal`/timeout e sem `credentials` (`:142-145`).
- Falha de rede vira `ApiError(0, "Sem conexão com o servidor…")` (`:147-153`).
- HTTP de erro vira `ApiError(status, message, code)` (`:157-162`).
- Sucesso retorna `data as T`, sem validação de schema (`:163`).

**Primitivos locais** (`apps/mobile/src/ui.tsx`)

- `Button` (`:25-69`)
- `Screen` com `SafeAreaView` do core, marcado deprecated no próprio código (`:76-94`, comentário `:79-81`)
- `Card` (`:96-98`), `SectionTitle` (`:100-102`), `Badge` (`:104-122`)
- `Field` (`:124-131`), `TextField` (`:144-168`), `Chip`/`ChipRow` (`:170-192`)
- Estados de tela: `ErrorView` (`:199-209`), `LoadingView` (`:211-218`), `EmptyView` (`:220-226`), `InlineError` (`:228-234`), `InfoText` (`:236-238`)

**Cards de domínio**: `ObservationCard` (`apps/mobile/src/observation-cards.tsx:34-53`) e `SuggestionCard` (`:59-76`).

**Error boundary** (`apps/mobile/src/error-boundary.tsx:13-46`)

- Loga `error.message` e `componentStack` só no console (`:22`); não há crash reporting.
- "Toque para tentar novamente" reseta o estado (`:33-39`).

### 1.4 Telas

#### LoginScreen — `apps/mobile/src/screens/login-screen.tsx`

- **Função:** e-mail/senha → login → `nav.reset({name:'agenda'})` (`:18-35`, `:29`).
- **Endpoint:** `POST /auth/login` via `login()` (`:27` → `api.ts:166-168`).
- **Estados:**
  - validação local de campos vazios (`:21-24`);
  - erro inline (`:64`);
  - loading no botão (`:66-72`).
  - Não há "esqueci a senha" nem registro.
- **Dados reais:** sim. A resposta (user/org/membership) é descartada (`:27`), então o papel do usuário não é usado em nenhum lugar do app.

#### AgendaScreen — `apps/mobile/src/screens/agenda-screen.tsx`

- **Função:** lista visitas SCHEDULED + CONFIRMED; o toque abre o detalhe (`:52-69`, `:57`).
- **Endpoints:** 2× `GET /visits` (`api.ts:181-182`) via `listVisits()` (`:37`).
- **Estados:**
  - loading (`:71-77`);
  - erro com retry quando a lista está vazia (`:79-90`);
  - vazio (`:111`);
  - pull-to-refresh (`:99-107`).
  - Falha de _refresh_ com lista já carregada é silenciosa: a condição `error !== null && visits.length === 0` (`:79`) impede exibir o erro, e a `FlatList` não tem slot de erro.
- **Dados reais:** sim.
  - Cada item mostra só data/hora, status e "Imóvel vinculado"/"Sem imóvel vinculado" (`:61-67`), sem título do imóvel, lead ou contato.
  - `leadId`/`partyId` chegam (`types.ts:52-53`) e não são exibidos.

#### VisitDetailScreen — `apps/mobile/src/screens/visit-detail-screen.tsx`

- **Função:**
  - mostra data/status/nota da visita (`:85-92`);
  - carrega o imóvel vinculado (`:44-59`);
  - cria vistoria (`:65-79`).
- **Endpoints:**
  - `GET /properties/:id` (`:52` → `api.ts:191-194`);
  - `POST /inspections` com `type` fixo `'CHECKIN'` (`:72` → `api.ts:196-205`).
- **Estados:**
  - loading (`:94`);
  - erro de carga sem botão de retry (`:96`: `ErrorView` sem `onRetry`);
  - visita sem imóvel (`:113-119`);
  - erro de criação inline (`:121`);
  - loading no botão (`:129`).
- **Dados reais:** sim.
  - Exibe título, primeiro endereço (`:26-35`), tipo e status (`:98-111`).
  - Ignora `financialTerms`, `owners`, `features` e `media` retornados (`types.ts:78-82`).

#### InspectionScreen — `apps/mobile/src/screens/inspection-screen.tsx`

- **Função:**
  - card de status com ações por estado (`:260-337`);
  - ambientes (`:341-388`);
  - formulário "Nova observação" (`:392-459`);
  - lista de observações (`:463-476`).
- **Endpoints:**
  - `GET /inspections/:id` (`:93`, `:104`);
  - `POST /inspections/:id/rooms` (`:131`);
  - `POST /inspections/:id/observations` (`:151-156`);
  - `PATCH /inspections/:id/status` com `CAPTURING` (`:170`) e `COMPLETED` (`:198`);
  - `POST /inspections/:id/process` (`:184`).
- **Ações por status:**

  | Status                             | Ação / exibição                                                  |
  | ---------------------------------- | ---------------------------------------------------------------- |
  | DRAFT                              | "Iniciar captura" (`:282-290`)                                   |
  | CAPTURING                          | "Processar" (`:291-299`)                                         |
  | REVIEW                             | "Concluir vistoria" (`:300-308`)                                 |
  | PROCESSING                         | só texto pedindo atualização manual (`:311-313`); não há polling |
  | PROCESSING/REVIEW/COMPLETED/SIGNED | "Ver revisão" (`:239-243`, `:316-326`)                           |
  | qualquer                           | "Atualizar" (`:328-336`)                                         |

- **Estados:**
  - loading (`:208-214`);
  - erro com retry (`:216-227`);
  - fallback nulo (`:229-235`);
  - erro de ação inline (`:339`), inclusive o 409 da máquina de estados (comentário `:201`);
  - vazios de ambientes (`:349`) e de observações (`:475`);
  - loading por botão (`:288`, `:297`, `:306`, `:369`, `:457`);
  - pull-to-refresh (`:250-257`).
- **Dados reais:** sim.
  - `media`, `transcripts` e `aiSuggestions` do agregado não são renderizados: a desestruturação usa só `inspection, rooms, observations` (`:237`), e um grep de "media|transcript" nas telas retornou 0 ocorrências.

#### InspectionReviewScreen — `apps/mobile/src/screens/inspection-review-screen.tsx`

- **Função:** lista observações e sugestões de IA, somente leitura (`:85-101`).
- **Endpoint:** `GET /inspections/:id/review` (`:23` → `api.ts:266-268`).
- **Estados:**
  - loading (`:42-48`);
  - erro com retry (`:50-61`);
  - fallback (`:63-69`);
  - vazios (`:91`, `:100`);
  - pull-to-refresh (`:75-83`).
- **Dados reais:** sim.
  - Cada sugestão aparece como `JSON.stringify(payload)` cru (`observation-cards.tsx:60`, `:73`).
  - Não há ações de aceitar, rejeitar ou editar.

### 1.5 Capacidades — Corretor

Base de todas as linhas: o conjunto completo de funções HTTP do app é `apps/mobile/src/api.ts:166-268`, e o conjunto completo de rotas é `apps/mobile/src/navigation.ts:7-12`. Uma capacidade sem função e sem rota nesses dois lugares é AUSENTE por definição.

| Capacidade            | Status      | Evidência mobile                                                                                                                     | O que a API já oferece (não usado)                                                                                                                                     |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarefas               | **AUSENTE** | nenhuma função/rota                                                                                                                  | `POST /tasks` (`apps/api/src/routes/tasks.ts:39`), `GET /tasks` (`:70`), `/tasks/:id/status` (`:91`)                                                                   |
| Leads                 | **AUSENTE** | `Visit.leadId` recebido (`types.ts:52`) e nunca exibido                                                                              | `POST /leads` (`leads.ts:46`), `GET /leads` (`:106`), `/leads/:id/status` (`:130`)                                                                                     |
| Inbox/WhatsApp        | **AUSENTE** | nenhuma função/rota                                                                                                                  | `/conversations` e subrotas (`conversations.ts:58,82,100,129,173,190`), `/leads/:id/conversations` (`:217`), `/whatsapp/connections` (`whatsapp-connections.ts:28,43`) |
| Contatos              | **AUSENTE** | `Visit.partyId` recebido (`types.ts:53`) e nunca exibido                                                                             | `/parties` (`parties.ts:102`), `GET /parties` (`:201`), `/parties/dedupe` (`:224`)                                                                                     |
| Imóveis (consulta)    | **PARCIAL** | só o imóvel vinculado a uma visita: título, 1º endereço, tipo e status (`visit-detail-screen.tsx:52`, `:98-111`); sem lista ou busca | `GET /properties` (`properties.ts:243-261`)                                                                                                                            |
| Cadastro de imóvel    | **AUSENTE** | nenhum formulário ou função                                                                                                          | `POST /properties` (`properties.ts:200-241`), endereço/termos/owners/features/mídia (`:327-794`)                                                                       |
| Voz/ditado            | **AUSENTE** | sem expo-audio/expo-speech (`package.json:12-19`); nenhum código de áudio                                                            | —                                                                                                                                                                      |
| Visitas               | **PARCIAL** | leitura (lista + detalhe); sem criar e sem mudar status                                                                              | `POST /visits` (`visits.ts:34-62`). A API não tem endpoint de alteração de visita (só `:34` e `:64`), então marcar "realizada" é impossível em qualquer cliente        |
| Agenda                | **PARCIAL** | ver detalhes abaixo                                                                                                                  | —                                                                                                                                                                      |
| Propostas             | **AUSENTE** | nenhuma função/rota                                                                                                                  | `/proposals` (`proposals.ts:36`), `GET /proposals` (`:73`)                                                                                                             |
| Atividades (timeline) | **AUSENTE** | nenhuma função/rota                                                                                                                  | `/timeline` (`timeline.ts:33`), `GET /timeline` (`:67`)                                                                                                                |

Detalhes da Agenda (PARCIAL):

- Traz visitas SCHEDULED + CONFIRMED de toda a organização, sem filtro por usuário. O filtro não é possível porque `visitSchema` não tem campo de responsável (`packages/contracts/src/visits.ts:6-17`) e a rota filtra só por org + status (`apps/api/src/routes/visits.ts:67-70`).
- Não há filtro de data, então visitas passadas ainda SCHEDULED aparecem.
- Ordem: a API ordena por `scheduledAt` decrescente (`visits.ts:75`) e o app concatena SCHEDULED antes de CONFIRMED sem reordenar (`api.ts:184-188`).
- Limite de 50 por status (`api.ts:181-182`).
- Não há visão de calendário.

Contagem Corretor: 0 EXISTE · 3 PARCIAL · 8 AUSENTE.

### 1.6 Capacidades — Vistoria

| Capacidade                         | Status                          | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iniciar vistoria                   | **EXISTE** (restrita a CHECKIN) | Cria via `createInspection(property.id, 'CHECKIN')` (`visit-detail-screen.tsx:72`). DRAFT→CAPTURING com "Iniciar captura" (`inspection-screen.tsx:166-177`, `:282-290`). CHECKOUT e INTERMEDIATE não são oferecidos na UI, embora `api.ts:198` aceite CHECKOUT e o contrato aceite os três tipos (`packages/contracts/src/inspections.ts:4`).                                                                                                       |
| Retomar vistoria existente         | **AUSENTE**                     | A única entrada da rota `inspection` é o retorno de `createInspection` (`visit-detail-screen.tsx:73`). `GET /inspections` (`apps/api/src/routes/inspections.ts:178-202`) não é usado. Depois de "Voltar" ou de reiniciar o app, não há como reabrir, e cada novo toque cria outra vistoria: não há deduplicação e nenhum vínculo com a visita (`createInspectionRequestSchema` não tem `visitId`: `packages/contracts/src/inspections.ts:140-145`). |
| Selecionar imóvel                  | **PARCIAL**                     | Só implícito, via `visit.propertyId` (`visit-detail-screen.tsx:45-52`). Não há seletor ou busca. Visita sem imóvel bloqueia o fluxo (`:113-119`).                                                                                                                                                                                                                                                                                                   |
| Ambientes                          | **PARCIAL**                     | Adicionar + listar nomes (`inspection-screen.tsx:122-140`, `:341-388`). Sem editar, reordenar ou excluir (a API também só tem `POST /inspections/:id/rooms`: `inspections.ts:256-278`). `orderIndex` chega (`types.ts:139`) mas não ordena a lista, e a query da API não tem `orderBy` (`inspections.ts:219`).                                                                                                                                      |
| Câmera                             | **AUSENTE**                     | Sem expo-camera/expo-image-picker (`package.json:12-19`; `node_modules` do app). Sem permissão de câmera em `app.json:1-13`.                                                                                                                                                                                                                                                                                                                        |
| Fotos com upload real para storage | **AUSENTE**                     | Nenhuma chamada a `POST /inspections/:id/media/upload-url` nem a `/media/confirm`, que existem na API (`inspections.ts:280-305`, `:307-356`; presigned PUT, `apps/api/src/app.ts:136`). O array `media` do agregado nunca é renderizado (`inspection-screen.tsx:237`).                                                                                                                                                                              |
| Áudio                              | **AUSENTE**                     | Sem expo-audio/expo-av (`package.json:12-19`); sem permissão de microfone (`app.json:1-13`).                                                                                                                                                                                                                                                                                                                                                        |
| Transcrição                        | **AUSENTE no mobile**           | A transcrição roda no worker, só sobre mídia AUDIO (`apps/worker/src/inspectionJobs.ts:48-82`). O mobile não envia áudio e não exibe `transcripts`: o tipo existe (`types.ts:154-161`) e não é usado em tela.                                                                                                                                                                                                                                       |
| Checklist                          | **PARCIAL**                     | Não há checklist estruturado ou template. O ADR-017 define "checklist = observações" (`docs/DECISIONS.md:23`, evidência histórica). O mobile oferece observação livre com 6 categorias e 3 severidades (`inspection-screen.tsx:48-57`, `:392-459`); a severidade `NONE`, aceita pelo contrato (`packages/contracts/src/inspections.ts:22`), fica fora (`inspection-screen.tsx:57`).                                                                 |
| Notas/observações                  | **EXISTE**                      | Criar + listar (`inspection-screen.tsx:142-164`, `:463-476`). A API grava com `source: 'HUMAN'` e `status: 'CONFIRMED'` (`inspections.ts:448-463`). Sem editar ou excluir (a API também não tem esses endpoints). Nunca envia `mediaId`.                                                                                                                                                                                                            |
| Review                             | **PARCIAL**                     | Lista somente leitura (`inspection-review-screen.tsx:85-101`); sugestão exibida como JSON cru (`observation-cards.tsx:60`, `:73`). Sem aceitar/rejeitar/editar, embora a API tenha `PATCH /inspections/:id/ai-suggestions/:suggestionId` (`inspections.ts:476-564`).                                                                                                                                                                                |
| Conclusão                          | **EXISTE**                      | `PATCH status=COMPLETED` a partir de REVIEW (`inspection-screen.tsx:194-206`, `:300-308`). A passagem PROCESSING→REVIEW depende do worker: `inboxJobs.ts:191-192` → `inspectionJobs.ts:129-164`. SIGNED é recusado pela API (`inspections.ts:624-626`).                                                                                                                                                                                             |
| Conectividade instável             | **PARCIAL**                     | Falha de rede vira mensagem legível (`api.ts:147-153`), e há retry manual nas telas de agenda (`agenda-screen.tsx:82-87`), vistoria (`inspection-screen.tsx:219-224`) e revisão (`inspection-review-screen.tsx:53-58`), mas não no detalhe da visita (`visit-detail-screen.tsx:96`). Não há timeout, AbortController, retry automático ou backoff (`api.ts:142`; grep AbortController/setTimeout = 0). Detecção no nativo: seção 1.8.               |
| Offline (fila local, persistência) | **AUSENTE**                     | Nenhum uso de AsyncStorage, SecureStore, SQLite ou FileSystem (grep = 0; pacotes ausentes). Todo o estado vive em `useState`. Mutação offline falha na hora com `ApiError(0)` e nada é enfileirado.                                                                                                                                                                                                                                                 |

Detalhes do Review (PARCIAL):

- A regra de conclusão exige `pendingSuggestions === 0` (`packages/domain/src/inspection/stateMachine.ts:48-50`; aplicada em `inspections.ts:627-632`).
- O worker cria uma sugestão `PENDING` para cada PHOTO/VIDEO (`inspectionJobs.ts:85-127`, `:124`).
- Logo, se houver mídia enviada por outro cliente, o mobile não consegue concluir: só exibe o 409 (`inspection-screen.tsx:201-202`).

Detalhes da Conclusão (EXISTE):

- O mobile não faz polling: a atualização é manual (`inspection-screen.tsx:311-313`, `:328-336`).

Contagem Vistoria (13 itens pedidos): 3 EXISTE · 5 PARCIAL · 5 AUSENTE. Somando "retomar vistoria", são 6 AUSENTES.

### 1.7 Sessão e configuração

| Item                        | Resposta                                                                                                                                                                         | Evidência                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Onde o token fica           | Variável de módulo em memória (`let sessionToken`). Não usa SecureStore (pacote ausente).                                                                                        | `apps/mobile/src/api.ts:54-55`                                                                                                        |
| Como é obtido               | Lido do header `Set-Cookie` (`aluguei_session=<token>`) da resposta.                                                                                                             | `api.ts:40`, `:66-79`, `:155`; o cookie é emitido em `apps/api/src/routes/auth.ts:179` com nome de `apps/api/src/routes/helpers.ts:5` |
| Como é reenviado            | Como `Cookie` e como `Authorization: Bearer`. A API prioriza o Bearer.                                                                                                           | `api.ts:81-89`; `apps/api/src/plugins/session.ts:60-67`                                                                               |
| Persiste entre aberturas?   | NÃO. A rota inicial é sempre login e o token se perde ao reiniciar.                                                                                                              | `App.tsx:14`, `:50`; `api.ts:54`                                                                                                      |
| Checagem de sessão no start | AUSENTE. `me()` existe (`api.ts:170-172`), mas nenhuma tela o chama; só os testes.                                                                                               | `api.test.ts:68`, `:108`                                                                                                              |
| Logout                      | AUSENTE. Não há UI; `clearSession()` (`api.ts:61-64`) só é usado no teste (`api.test.ts:40`); `POST /auth/logout` (`auth.ts:191-212`) nunca é chamado.                           | A sessão continua válida no servidor até o TTL: padrão 2.592.000 s = 30 dias (`apps/api/src/app.ts:128`), configurável por env        |
| Sessão expirada/401         | Sem tratamento: nenhuma checagem de `status === 401` e nenhum redirecionamento ao login. A tela mostra a mensagem da API, "Autenticação necessária".                             | `api.ts:158-162`; `apps/api/src/plugins/authz.ts:8-13`; `agenda-screen.tsx:40-41`                                                     |
| URL da API                  | Configurável por `EXPO_PUBLIC_API_BASE_URL`, com fallback fixo `http://localhost:4000`.                                                                                          | `api.ts:26`, `:34-38`                                                                                                                 |
| Documentação da variável    | `EXPO_PUBLIC_API_BASE_URL` não aparece em `.env.example`, que só traz `API_BASE_URL` (`.env.example:4`). Um grep no repo inteiro só encontrou a variável no mobile e em `docs/`. | —                                                                                                                                     |
| Papel do usuário            | Ignorado; a resposta do login é descartada.                                                                                                                                      | `login-screen.tsx:27`                                                                                                                 |

**Plataforma nativa (iOS/Android)**

- NÃO_DETERMINADO se `response.headers.get('set-cookie')` devolve o token. É preciso testar em device, e o próprio ADR-036 registra o risco (`docs/DECISIONS.md:154`, evidência histórica).
- Também NÃO_DETERMINADO se o cookie jar nativo reenviaria o cookie automaticamente.

**Plataforma web** (`app.json:10` declara "web")

- Pela especificação Fetch, `Set-Cookie` é _forbidden response-header name_, então navegadores não o expõem ao JavaScript. Essa premissa vem da especificação, não do repositório.
- `api.ts:142` não define `credentials: 'include'`.
- O CORS da API só libera `CORS_ORIGINS`, ou `APP_BASE_URL` (padrão `http://localhost:3000`) na ausência dela (`apps/api/src/app.ts:101-107`, `:127`, `:149`).
- Resultado provável: em Expo web, com a configuração padrão, o login não gera sessão utilizável. Isso é inferência sobre o código e não foi executado.

**Device físico**: o fallback `localhost` aponta para o próprio aparelho (fato de rede padrão), então é obrigatório definir `EXPO_PUBLIC_API_BASE_URL`. Restrições de HTTP cleartext: NÃO_DETERMINADO sem build nativo.

### 1.8 Conectividade e offline

**Detecção de conectividade** (`apps/mobile/src/connectivity.ts`)

- `useConnectivity()` usa `navigator.onLine !== false` (`:14-24`).
- No runtime nativo, `navigator.onLine` é `undefined` (comentário do próprio arquivo, `:18-21`), então o hook devolve sempre `true`.
- O banner "Sem conexão" (`App.tsx:70-74`) só funciona na plataforma web.
- A reavaliação em `AppState 'active'` (`:33-37`) relê o mesmo valor `undefined`.
- Os listeners `online`/`offline` de `window` são opcionais e ausentes no nativo (`:38-40`).
- NetInfo/expo-network não estão instalados.

**Rede instável**

- Não há timeout (`api.ts:142`).
- Não há retry automático; o retry é manual por botão (seção 1.6).

**Offline**

- Sem persistência e sem fila (seção 1.6).
- Rascunhos (nome de ambiente, descrição) ficam em `useState` e se perdem ao reiniciar o app. Em falha de envio o texto é mantido, porque `setDescription('')` só roda no sucesso (`inspection-screen.tsx:157`).

### 1.9 Testes

**Cobertura**

- 1 arquivo: `apps/mobile/src/api.test.ts`, com **5 casos**:
  - `:50` captura do token no login e reenvio como Cookie + Bearer;
  - `:83` 409 → `ApiError` com status/code/message;
  - `:105` falha de rede → `ApiError` status 0;
  - `:115` `listVisits` mescla SCHEDULED + CONFIRMED e deduplica;
  - `:141` `errorMessage` de `ApiError`.
- Ambiente `node`, include `src/**/*.test.ts` (`apps/mobile/vitest.config.ts:4-7`).
- `fetch` é mockado (`api.test.ts:37-47`).
- Não há teste de telas, componentes, navegação, `connectivity.ts` ou `error-boundary.tsx`, nem biblioteca de teste de React Native instalada.

**CI**

- `pnpm test` (`.github/workflows/ci.yml:48-49`) → `turbo run test` (`package.json:14` da raiz) → script `vitest run src` do mobile (`apps/mobile/package.json:10`).
- Lint e typecheck também cobrem o mobile: `ci.yml:29-33` → `apps/mobile/package.json:8-9`, com a regra `strictTypeChecked` da raiz (`eslint.config.mjs:20`).

**E2E**: `tests/` contém `contract`, `e2e` e `integration`; grep por "mobile" em `tests/` = 0 ocorrências.

**Execução**: não executei os testes (regra da tarefa). Resultado: NÃO_DETERMINADO por mim.

### 1.10 Endpoints do mobile × rotas da API × `packages/contracts`

Como ler a tabela:

- Todas as rotas são registradas sem prefixo (`apps/api/src/app.ts:302-329`), então `BASE_URL + path` é o endereço final.
- Rotas: `apps/api/src/routes/*.ts`. Contratos: `packages/contracts/src/*.ts`. Tipos do app: `apps/mobile/src/types.ts`.

| #   | Função mobile (`api.ts`)         | Método + path                           | Rota API                                     | Contrato                                               | Compatibilidade                                                                                       |
| --- | -------------------------------- | --------------------------------------- | -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | `login` `:166-168`               | POST `/auth/login`                      | `auth.ts:124-189` (rate limit 10/min `:126`) | `auth.ts:37-41`; resposta `authSessionSchema` `:30-34` | body `{email,password}` OK; resposta `{user,org,membership}` = `LoginResponse` (`types.ts:37-41`) OK  |
| 2   | `me` `:170-172`                  | GET `/auth/me`                          | `auth.ts:214-233`                            | `auth.ts:44-48`                                        | OK (`types.ts:43-47`). Nenhuma tela chama                                                             |
| 3   | `listVisits` `:181`              | GET `/visits?limit=50&status=SCHEDULED` | `visits.ts:64-82`                            | `visits.ts:30-37`; `common.ts:18-21` (limit 1..100)    | OK; `Visit` (`types.ts:49-60`) = `visitSchema` (`visits.ts:6-17`)                                     |
| 4   | `listVisits` `:182`              | GET `/visits?limit=50&status=CONFIRMED` | idem                                         | idem                                                   | OK                                                                                                    |
| 5   | `getProperty` `:191-194`         | GET `/properties/:id`                   | `properties.ts:263-275`                      | `property.ts:62-69` (+ `:24-60`)                       | resposta `{property}` OK; `Property` (`types.ts:62-121`) confere campo a campo                        |
| 6   | `createInspection` `:196-205`    | POST `/inspections`                     | `inspections.ts:148-176` (201)               | `inspections.ts:140-147`                               | body `{propertyId,type}` OK; `scheduledAt`/`notes` opcionais não enviados; resposta `{inspection}` OK |
| 7   | `getInspection` `:207-209`       | GET `/inspections/:id`                  | `inspections.ts:204-254`                     | `inspections.ts:122-129`                               | agregado OK (`types.ts:189-196`)                                                                      |
| 8   | `addRoom` `:211-217`             | POST `/inspections/:id/rooms`           | `inspections.ts:256-278` (201)               | `inspections.ts:160-162` (`name` 1..100)               | OK; o limite de 100 não é validado no app, e o 400 `VALIDATION` aparece inline                        |
| 9   | `addObservation` `:219-249`      | POST `/inspections/:id/observations`    | `inspections.ts:434-474` (201)               | `inspections.ts:181-191` (`description` 1..2000)       | OK; `mediaId` nunca enviado; limite de 2000 não validado no app                                       |
| 10  | `setInspectionStatus` `:251-260` | PATCH `/inspections/:id/status`         | `inspections.ts:606-654`                     | `inspections.ts:203-207`                               | OK; o app restringe a `CAPTURING`/`COMPLETED`                                                         |
| 11  | `processInspection` `:262-264`   | POST `/inspections/:id/process`         | `inspections.ts:390-432` (202 `{ok:true}`)   | sem schema de request; a rota ignora o body            | OK; o app envia `{}`                                                                                  |
| 12  | `getReview` `:266-268`           | GET `/inspections/:id/review`           | `inspections.ts:566-604`                     | `listReviewResponseSchema` `inspections.ts:213-216`    | OK; a rota não faz `parse`, mas o shape `:589-602` coincide                                           |

**Formato de erro**

- A API responde `{error, code, message}` em todos os caminhos: `apps/api/src/errors.ts:21-26` (DomainError), `:33-37` (Zod → 400 `VALIDATION`), `:53-57` (4xx de framework), `:61-65` (500).
- O app lê `message` e `code` (`api.ts:91-113`). Compatível.

**Conclusão**

- Nenhuma incompatibilidade de método, path ou payload.
- Risco estrutural: os tipos são copiados à mão (`types.ts:1-4`) e não há validação em runtime (`api.ts:163`), então uma mudança de contrato provocaria drift silencioso.
- `Membership.role: string` (`types.ts:33`) é mais largo que `roleSchema` (`packages/contracts/src/common.ts:5`), o que continua compatível.

**Endpoints relevantes da API NÃO usados pelo mobile**

- Vistoria:
  - `GET /inspections` (`inspections.ts:178-202`)
  - `POST …/media/upload-url` (`:280-305`), `POST …/media/confirm` (`:307-356`), `DELETE …/media/:mediaId` (`:358-388`)
  - `PATCH …/ai-suggestions/:suggestionId` (`:476-564`)
  - `POST …/compare` (`:656-750`), `GET …/report` (`:752-806`)
- Autenticação:
  - `POST /auth/logout` (`auth.ts:191-212`)
  - `POST /auth/switch-org` (`auth.ts:235-265`)
  - `GET /me/memberships` (`me.ts:11`)
- Mídia de imóvel: `properties.ts:669`, `:702`, `:794`.
- Corretor: ver a seção 1.5.

**Contexto do repositório (fora do mobile)**

- Um grep por "upload" em `apps/web/src` retornou 0 ocorrências, assim como o grep por "upload-url|media/confirm".
- Logo, nenhuma UI do repositório envia mídia de vistoria, e o pipeline de IA do worker (`inspectionJobs.ts:43-127`) não recebe insumo vindo de clientes.

**Seleção de organização**

- No login, a API escolhe a primeira membership encontrada, sem ordenação (`auth.ts:139-143`, `.limit(1)`).
- O mobile não oferece troca de organização, porque `switch-org` não é usado.
- Consequência: um usuário de várias organizações não escolhe a organização ativa no app.

### 1.11 RBAC aplicado ao fluxo mobile

O fluxo exige estas permissões:

- `visit:read` (`visits.ts:64`)
- `property:read` (`properties.ts:265`)
- `inspection:read` (`inspections.ts:206`, `:568`)
- `inspection:write` (`inspections.ts:150`, `:258`, `:391`, `:436`, `:608`)

| Papel        | Permissões relevantes (`packages/domain/src/authz/rbac.ts`)                                       | Efeito no app                                       |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| owner, admin | todas (`:80-81`)                                                                                  | fluxo completo                                      |
| agent        | `visit:read` `:89`, `property:read` `:95`, `inspection:read/write` `:101-102`                     | fluxo completo                                      |
| inspector    | `visit:read` `:116`, `property:read` `:119`, `inspection:read/write` `:122-123`                   | fluxo completo                                      |
| finance      | `visit:read` `:129`, `property:read` `:132`, `inspection:read` `:137`; **sem** `inspection:write` | agenda e imóvel OK; criar ou alterar vistoria → 403 |
| viewer       | `visit:read` `:148`, `property:read` `:151`; **sem** `inspection:*`                               | agenda e imóvel OK; qualquer tela de vistoria → 403 |

- O app não controla acesso por papel: descarta o `membership` do login (`login-screen.tsx:27`) e mostra os botões para todos.
- O 403 é `FORBIDDEN` (`errors.ts:11`). O texto da mensagem é NÃO_DETERMINADO, porque o corpo de `requirePermission` não foi lido.

### 1.12 Divergências: mobile × web × docs

**Tokens visuais**

- O mobile usa a baseline PEG não calibrada:
  - `apps/mobile/src/tokens.ts:6` canvas `#FAFAFA`, `:10` border `#E5E5E7`, `:11` borderStrong `#D5D5D8`;
  - `:12` textPrimary `#171719`, `:13` `#5F6065`, `:14` `#8E8F94`.
- Esses valores são idênticos a `design-source/peg-product-design-system/design-tokens.css:2-10`.
- O web usa o override Aluguei (`packages/ui/src/styles/tokens.css:14-23`): `#fcfcfc`, `#e6e6e3`, `#c7c7c7`, `#2f332b`, `#555a52`, `#6e746b`.
- O comentário do mobile diz "Tokens de design do painel (PEG baseline + brand Aluguei)" (`tokens.ts:2`), mas o painel web não usa a baseline.
- Botão primário:
  - mobile: verde da marca (`ui.tsx:277`, `colors.brand` em `tokens.ts:20`);
  - web: "ink" (`packages/ui/src/styles/components.css:169-172`); o verde é a variante separada `brand` (`packages/ui/src/components/Button.tsx:5-6`).
- Radius coincide (`tokens.ts:35-39` = `tokens.css:61-63`), assim como o espaçamento de 4 a 24.
- Fonte: o mobile não define `fontFamily`, usando a do sistema (`tokens.ts:41-47`); o web usa Inter (`apps/web/src/app/layout.tsx:3`, `:7-12`).

**Labels**

- O mobile declara espelhar `apps/web/src/lib/labels.ts` (`labels.ts:3`), mas há divergências:

| Chave                 | Mobile                                         | Web                                                                                  |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| VisitStatus `DONE`    | "Concluída" (`labels.ts:16`)                   | "Realizada" (`apps/web/src/lib/labels.ts:113`)                                       |
| Categoria `CONDITION` | "Estado" (`labels.ts:23`)                      | "Condição" (`apps/web/src/app/app/inspections/[id]/inspection-detail-client.tsx:88`) |
| Severidades           | "Nenhuma/Baixa/Média/Alta" (`labels.ts:31-34`) | "Nenhum/Baixo/Médio/Alto" (`inspection-detail-client.tsx:96-99`)                     |
| Tom de `LOW`          | `info` (`observation-cards.tsx:10`)            | `success` (`inspection-detail-client.tsx:104`)                                       |

- Labels iguais nos dois lados:
  - status de vistoria (`labels.ts:4-11` = web `labels.ts:192-199`);
  - tipo de imóvel (`labels.ts:37-42` = web `:51-56`);
  - tipo de vistoria (`labels.ts:44-48` = `inspection-detail-client.tsx:109-112`).
- No web, os labels de categoria e severidade são locais ao `inspection-detail-client.tsx`; não estão em `lib/labels.ts`.

**Docs × código** (os docs são só evidência histórica)

- Desatualizados:
  - `docs/audit/FUNCTIONAL_STATUS_AUDIT.md:89`, `:146` descrevem o mobile como shell com "zero consumo de API";
  - `docs/RELATORIO_PRODUTO.md:38`, `:181` dizem o mesmo.
  - O código atual consome 11 endpoints (commit `0071059`, 2026-08-17).
- Coerentes com o código:
  - `docs/EXECUTION_STATE.md:29` e o ADR-036 (`docs/DECISIONS.md:140-154`);
  - `docs/production-readiness/FINAL_READINESS_REPORT.md:65`, que lista como próxima iteração "fotos/áudio nativos, resolução de sugestões, persistência de sessão".
- Intenção não implementada: `docs/UI_UX.md:29`, "captura de foto/áudio offline-first quando possível".

### 1.13 Riscos e defeitos (mobile)

| ID    | Risco/defeito                                                                                                                                              | Evidência                                                                           | Impacto            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------ |
| R-M1  | Vistoria sem foto e sem áudio: o requisito central de campo não é atendido, e o pipeline de IA não recebe insumo do app                                    | seção 1.6; `api.ts:166-268`; `apps/worker/src/inspectionJobs.ts:43-127`             | Alto               |
| R-M2  | Sessão só em memória, sem logout, sem checagem no start e sem tratamento de 401                                                                            | `api.ts:54-55`, `:61-64`; `App.tsx:14`, `:50`; seção 1.7                            | Alto               |
| R-M3  | Captura do `Set-Cookie` no nativo é NÃO_DETERMINADA; se falhar, o login não produz sessão                                                                  | `api.ts:155`; `docs/DECISIONS.md:154`                                               | Alto (condicional) |
| R-M4  | Sessão provavelmente inoperante em Expo web: `Set-Cookie` inacessível ao JS, sem `credentials`, CORS restrito                                              | `api.ts:142`, `:155`; `apps/api/src/app.ts:101-107`, `:149`; `app.json:10`          | Médio              |
| R-M5  | Vistorias duplicadas e impossibilidade de retomar                                                                                                          | `visit-detail-screen.tsx:65-79`; seção 1.6                                          | Alto               |
| R-M6  | Conclusão bloqueada, sem saída no app, quando há sugestões PENDING                                                                                         | `stateMachine.ts:48-50`; `inspections.ts:627-632`; `PATCH ai-suggestions` não usado | Médio              |
| R-M7  | Banner offline nunca aparece no nativo                                                                                                                     | `connectivity.ts:14-24`                                                             | Médio              |
| R-M8  | Sem timeout: requisição pode ficar pendurada em rede ruim                                                                                                  | `api.ts:142-149`                                                                    | Médio              |
| R-M9  | Tipos copiados à mão e sem validação em runtime (drift silencioso)                                                                                         | `types.ts:1-4`; `api.ts:163`                                                        | Médio              |
| R-M10 | Agenda da organização inteira, em ordem decrescente, incluindo passadas, limitada a 50 por status                                                          | seção 1.5; `api.ts:181-188`; `visits.ts:67-75`                                      | Médio              |
| R-M11 | Botão voltar do Android sem handler (grep `BackHandler` = 0); o "voltar" só existe no header (`App.tsx:62-64`, `:75-89`). Efeito em device NÃO_DETERMINADO | —                                                                                   | Médio              |
| R-M12 | URL padrão `localhost` e variável não documentada em `.env.example`                                                                                        | `api.ts:26`, `:38`; `.env.example:4`                                                | Médio              |
| R-M13 | Sem `KeyboardAvoidingView` (grep = 0); header e banner fora da `SafeAreaView` (`App.tsx:69-90` × `ui.tsx:82`, `:93`). Efeito NÃO_DETERMINADO sem device    | —                                                                                   | Baixo/Médio        |
| R-M14 | Usuário de várias organizações não escolhe a organização ativa                                                                                             | `apps/api/src/routes/auth.ts:139-143`; `switch-org` não usado                       | Baixo/Médio        |
| R-M15 | Papel ignorado: finance e viewer veem botões e recebem 403                                                                                                 | `login-screen.tsx:27`; `rbac.ts:125-154`                                            | Baixo              |
| R-M16 | Identidade visual e labels divergentes do web                                                                                                              | seção 1.12                                                                          | Baixo              |
| R-M17 | Erro de refresh da agenda silencioso quando já há dados em tela                                                                                            | `agenda-screen.tsx:79`                                                              | Baixo              |
| R-M18 | Sem crash reporting                                                                                                                                        | `error-boundary.tsx:22`                                                             | Baixo              |

### 1.14 Classificação global: **MOBILE PARCIAL**

Critério objetivo usado:

| Classe           | Definição                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| MOBILE SHELL     | não consome API ou não tem fluxo com dados reais                                                                                           |
| MOBILE PARCIAL   | consome a API real em ao menos um fluxo ponta a ponta, mas faltam capacidades centrais                                                     |
| MOBILE FUNCIONAL | cobre as capacidades de campo exigidas: mídia com upload, sessão persistente com logout, resiliência offline mínima e o núcleo do corretor |

Por que não é SHELL:

- Faz 12 chamadas reais a 11 endpoints existentes e compatíveis (seção 1.10).
- O fluxo login → visita → vistoria → conclusão funciona com dados reais (seções 1.4 e 1.6).

Por que não é FUNCIONAL:

- Corretor: 0 EXISTE, 3 PARCIAL, 8 AUSENTE (seção 1.5).
- Vistoria: 3 EXISTE, 5 PARCIAL, 5 AUSENTE, sendo AUSENTES câmera, fotos/upload, áudio, transcrição e offline; retomar vistoria também é AUSENTE (seção 1.6).
- Sessão não persiste e não há logout (seção 1.7).
- Testes: 5 casos, só do cliente HTTP (seção 1.9).

### 1.15 NÃO_DETERMINADO (mobile)

- Comportamento em device: exposição de `Set-Cookie` no iOS/Android, cookie jar nativo, SafeArea, teclado, botão voltar do Android, suporte a `Intl` no Hermes. Motivo: execução proibida nesta tarefa.
- Resultado de testes, lint e typecheck do mobile. Motivo: não executados por regra; o orquestrador executa.
- Texto da mensagem de 403. Motivo: `requirePermission` em `apps/api/src/plugins/authz.ts` não foi lido além de `requireAuth` (`:8-13`).

---

## PARTE 2 — Reconhecimento da pasta de referência "Kal El" (`KE:`)

Escopo: inventário sem cópia de nada. Foram ignorados `node_modules`, `.next`, `dist`, `.git`, `.turbo`, `build`, `coverage` e a cópia aninhada `KE:.claude/worktrees/kal-el-cms-docs-e72218/`.

### 2.1 Estado do repositório (somente leitura)

**Git**

- Branch: `feat/article-slug-filter`.
- HEAD: `83ad1e8` "feat(api): filter the article list by exact slug".
- `git status --short`: só `?? download.png`.

**Arquivos da raiz**

- `.env`, 491 bytes: **não lido**.
- Artefatos grandes de recuperação: `RECOVERY-DIFF.patch` (455.594 bytes), `RECOVERY-REPORT.md` (293.497), `kal-el-repository-v2.zip` (803.551), `download.png` (264.246).

**Inventário**: 667 arquivos após as exclusões acima.

### 2.2 Estrutura

| Diretório                                                            |           Arquivos | Natureza                                                                                       |
| -------------------------------------------------------------------- | -----------------: | ---------------------------------------------------------------------------------------------- |
| `KE:apps/api`                                                        |                180 | backend (domínio CMS) — fora do escopo de reuso                                                |
| `KE:apps/cms`                                                        |                 74 | frontend Next (App Router): páginas, componentes de app, lib, e2e, fontes, marca               |
| `KE:apps/worker`                                                     |                 18 | backend                                                                                        |
| `KE:apps/fixture`                                                    |                 15 | servidor de fixture/testes                                                                     |
| `KE:packages/design-system`                                          |                 24 | **design system React + CSS** (alvo principal)                                                 |
| `KE:packages/{db,importer,contracts,auth,editor,sdk,testkit,events}` | 30/24/13/7/6/5/4/3 | domínio/infra; `editor` = TipTap/Lexical                                                       |
| `KE:design-system/`                                                  |                 47 | spec do PEG Product Design System + referências (20 `.webp`) + `references/kal-el-final/` (11) |
| `KE:design-import/`                                                  |                  2 | design executável `Kal El.dc.html` (105.673 bytes) + `support.js` (69.150)                     |
| `KE:artifacts/visual`                                                |                 79 | 78 `.png` de QA visual (ex.: `articles-390-light.png`, `articles-1440-dark.png`) + 1 `.json`   |
| `KE:docs/`                                                           |                ~70 | docs de produto/arquitetura (histórico)                                                        |
| `KE:agents/`, `KE:prompts/`, `KE:scripts/`                           |         10 / 7 / 3 | prompts de agentes e scripts                                                                   |

### 2.3 Stack técnico

**Workspace**

- pnpm workspace: `KE:pnpm-workspace.yaml:1-3` (`apps/*`, `packages/*`).
- Scripts com `pnpm -r`, sem turbo (`KE:package.json:9-16`).

| Item                         | Kal El                                                                                                                                                                                                                                      | Aluguei                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Gerenciador                  | pnpm@11.15.1 (`KE:package.json:4`)                                                                                                                                                                                                          | pnpm@11.15.1 (`package.json:5`)                                                                                       |
| Node                         | `>=22` (`KE:package.json:6`)                                                                                                                                                                                                                | `>=24` (`package.json:7`)                                                                                             |
| TypeScript                   | `^5.6.3` (`KE:package.json:34`)                                                                                                                                                                                                             | 6.0.3 (`package.json:30`)                                                                                             |
| ESLint                       | `^9.14.0` (`:31`), só `recommended` (`KE:eslint.config.mjs:16-17`)                                                                                                                                                                          | 10.8.1 (`package.json:26`), `strictTypeChecked` (`eslint.config.mjs:20`)                                              |
| Vitest                       | `^3.0.0` (`:36`)                                                                                                                                                                                                                            | 4.1.10 (`package.json:32`)                                                                                            |
| `exactOptionalPropertyTypes` | false (`KE:tsconfig.base.json:10`)                                                                                                                                                                                                          | true (`tsconfig.base.json:9`)                                                                                         |
| Next / React (app)           | 14.2.35 / 18.3.1 (`KE:apps/cms/package.json:19-21`; instalados: 14.2.35 e 18.3.1 em `KE:apps/cms/node_modules`)                                                                                                                             | 16.3.0 / 19.2.3 (`apps/web/package.json:17-19`)                                                                       |
| Pacote de UI                 | `@kal-el/design-system`: exports `src/index.ts`, `tokens.css`, `styles.css` (`KE:packages/design-system/package.json:6-12`); peer `react ^18 \|\| ^19` (`:21-24`); dev React ^18.3.1, Vite ^6, Vitest ^3, Testing Library, jsdom (`:25-37`) | `@aluguei/ui`: exports `src/index.ts` + `styles/*.css` (`packages/ui/package.json:6-15`); peer `react ^19` (`:33-36`) |

**Estilo**

- CSS puro com custom properties, igual ao Aluguei:
  - tokens em `KE:packages/design-system/src/tokens.css:23-161` (claro) e `:164-223` (escuro);
  - componentes em `KE:packages/design-system/src/styles.css` (1.628 linhas, 240 classes `.peg-*` distintas, padrão bloco__elemento--modificador, ex.: `.peg-btn--primary` `:121`);
  - CSS de app em `KE:apps/cms/app/globals.css` (965 linhas: `.peg-editor*` do ProseMirror + `.kalel-*` de domínio) e `KE:apps/cms/app/login/login.css` (324 linhas);
  - importação em `KE:apps/cms/app/layout.tsx:4-6`.
- Tailwind: não usado (grep "tailwind" = 0 fora de lockfile, patches e node_modules).
- CSS Modules: não usados (`find *.module.css` = 0); não há lib CSS-in-JS nas dependências (`KE:apps/cms/package.json:14-22`).
- Estilos inline pontuais: `Shell.tsx:20`, `Table.tsx:38,50,72`, `Tabs.tsx:90-91,106`, `KE:apps/cms/components/AppShell.tsx:167`.
- O Aluguei também não usa Tailwind nem CSS Modules (grep/find = 0).

**Tipografia, tema e responsividade**

- Fontes da marca: Poppins, Montserrat e Montserrat Alternates via `next/font/local`, com woff2 versionados (`KE:apps/cms/app/layout.tsx:14-39`; `KE:apps/cms/app/fonts/`).
- Os tokens consomem `--font-poppins`/`--font-montserrat` (`tokens.css:88-91`) numa escala em shorthand `font` (`tokens.css:95-111`, usada como `font: var(--peg-font-body)` em `styles.css:4`).
- Tema: `[data-theme="dark"]` (`tokens.css:164`), com script de bootstrap antes do paint (`layout.tsx:50-54`, `:68`, chave `localStorage` "kal-el-theme") e `ThemeToggle` (`KE:apps/cms/components/ThemeToggle.tsx:7`, `:22-43`).
- Breakpoints:
  - DS: `@media (max-width: 1023px)` para o drawer (`styles.css:1212`) + `prefers-reduced-motion` (`:1257`);
  - CMS: 767 e 1023 (`globals.css:417`, `:665`, `:795`, `:880`);
  - login: 560 e 900 (`login.css:259`, `:274`, `:316`).

**Ícones e testes**

- Ícones: 21 componentes SVG inline (`KE:packages/design-system/src/icons.tsx:19-136`), sem biblioteca externa.
- Testes do DS: 5 casos (`KE:packages/design-system/src/components/primitives.test.tsx`).
- E2E do CMS: Playwright com 10 specs em `KE:apps/cms/e2e/`, gate axe que falha em violações critical/serious (`a11y.spec.ts:4`, `:10`, `:39`, `:127`) e viewports 375/390/768/1024/1440 (`e2e/_surfaces.ts:13-17`).

### 2.4 "PEG Product Design System": onde está e como se relaciona com o Aluguei

**Especificação** (`KE:design-system/`)

- `README.md:1` (título) e `:3-6`: base compartilhada entre Kal El (CMS) e Commerce Wayne (CRM).
- `:10-31`: `references/kal-el-final/` é a referência final do Kal El e tem precedência.
- `:25-27`: "Nada disso é dependência de runtime".
- `:43-50`: erros conhecidos (accent `#BF5252`/`#B51B1B`; reprovação de contraste de `#C7C7C7` e `#8B8D86`).
- Docs genéricos úteis como referência visual e técnica:
  - `01_FOUNDATIONS.md` (137 linhas; seções `:3-128`);
  - `02_COMPONENTS.md` (160; ações, forms, navegação, dados, overlays, feedback, responsivo `:3-153`);
  - `03_APPLICATION_SHELLS.md` (79; shells A–F e breakpoints 360–479 / 480–767 / 768–1023 / 1024–1439 / 1440+ em `:58-77`);
  - `04_PATTERNS.md` (81; dashboard, list/index, list+detail, CRUD form, settings, search+filters, activity/audit, empty states `:3-77`);
  - `VISUAL_QA.md` (66);
  - `ACCEPTANCE_CHECKLIST.md`.

**Implementação**: `KE:packages/design-system/src/`. O cabeçalho `tokens.css:1-21` diz que os nomes `--peg-*` foram mantidos com valores Kal El, com dois desvios por WCAG.

**O Aluguei já tem o mesmo pacote** em `design-source/peg-product-design-system/` (36 arquivos; `design-source/README.md:3-10` o descreve como referência somente leitura). Comparação por sha256 + `diff`:

- os 36 caminhos existem em `KE:design-system/`;
- 20/20 imagens são idênticas;
- 5 textos são idênticos exceto terminação de linha: `05_CALIBRATION_SCREEN.md`, `MANIFEST.txt`, `SHA256SUMS.txt`, `design-tokens.css`, `design-tokens.json`;
- 10 textos diferem só em formatação, com diff = 0 depois de normalizar espaços e hífens: `00`, `01`, `02`, `03`, `04`, `10`, `20`, `ACCEPTANCE_CHECKLIST`, `CLAUDE_DESIGN_MASTER_PROMPT`, `VISUAL_QA`. Isso é coerente com o commit do Aluguei `c80a112` (2026-08-17, "restore prettier formatting across the monorepo"); exemplo: tabelas realinhadas em `01_FOUNDATIONS.md` (hunk `11,22c11,22`);
- 1 texto difere em conteúdo: `README.md`, pela seção Kal El (`KE:design-system/README.md:10-52`);
- 11 arquivos existem só no Kal El: `references/kal-el-final/*` (`KAL_EL_INVENTORY.md`, `README.md`, `source/Kal El.dc.html`, `source/support.js`, `spec/00_AUDIT_RESULT.md`, `spec/10_KAL_EL_COMPLETE_DESIGN.md`, `standalone/kal-el.html` de 431.596 bytes, `tokens/kal-el-tokens.{css,json}`, `tokens/peg-tokens.calibrated.{css,json}`).

**Datas git**

- `KE:design-system/`: `9129414`, 2026-08-19.
- `KE:packages/design-system/src/tokens.css`: `fb37c76`, 2026-08-20.
- `design-source/peg-product-design-system` (Aluguei): `c80a112`, 2026-08-17.

**Evidência de família comum**

- `KE:design-system/references/kal-el-final/tokens/peg-tokens.calibrated.css:25-31` define accents por produto, incluindo `--peg-accent-aluguei: #41945d` e `--peg-accent-aluguei-strong: #417d55`, que são exatamente a marca do Aluguei (`packages/ui/src/styles/tokens.css:26-27`).
- Esse arquivo usa a fonte Geist (`:34`), diferente das duas implementações (Poppins no Kal El, Inter no Aluguei).

**Conclusão**

- A documentação genérica do PEG já está no Aluguei.
- O Kal El acrescenta três coisas:
  - a referência final específica do CMS;
  - uma implementação React/CSS calibrada;
  - evidência de QA visual.

### 2.5 Organização dos componentes reutilizáveis (Kal El)

`KE:packages/design-system/src/`:

| Arquivo                       |     Linhas | Exports (evidência)                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/Badge.tsx`        |         12 | `Badge`: tons neutral/success/warning/danger/info/accent + `dot` (`:3-12`)                                                                                                                                                                                                                                                                                                   |
| `components/Button.tsx`       |         38 | `Button`: variant primary/secondary/tertiary/destructive; size xs–lg; `iconOnly`; `icon` (`:3-37`)                                                                                                                                                                                                                                                                           |
| `components/Card.tsx`         |         77 | `Card` (`:3-30`), `KpiCard` (`:32-54`), `ProfileCard` (`:56-77`)                                                                                                                                                                                                                                                                                                             |
| `components/Editor.tsx`       |         84 | `EditorSurface` (`:3-45`), `InlineToolbar` (`:47-84`) — editorial                                                                                                                                                                                                                                                                                                            |
| `components/FormControls.tsx` |        115 | `FieldShell` (`:4-29`), `Input` (`:31-44`), `Textarea` (`:46-54`), `Search` (`:56-65`), `Select` (`:67-77`), `Checkbox` (`:79-91`), `Radio` (`:93-103`), `Switch` (`:105-115`)                                                                                                                                                                                               |
| `components/Overlays.tsx`     |        213 | `AccountSwitcher` (`:7-44`), `Modal` (`:46-137`), `Toast` (`:139-145`), `Alert` (`:147-164`), `EmptyState` (`:166-174`), `Breadcrumb` (`:176-213`)                                                                                                                                                                                                                           |
| `components/Patterns.tsx`     |       1013 | `StatusLabel` (`:22-37`), `SaveState` (`:38-84`), `CharacterCounter` (`:79-116`), `FilterBar` (`:117-168`), `InspectorSection` (`:169-212`), `LinkDialog` (`:213-308`), `DateTimeDialog` (`:309-421`), `WorkflowCommentDialog` (`:422-499`), `CalendarGrid`/`CalendarNav` (`:500-732`), `TokenPicker` (`:733-830`), permissões (`:826-965`), `CreatableSelect` (`:966-1013`) |
| `components/Shell.tsx`        |        224 | `NavItem`, `Sidebar`, `MenuButton`, `Rail`, `Topbar`, `Inspector`, `InspectorGroup`, `AppLayout`, `Workspace`, `Content`, `PageHead` (`:3-224`)                                                                                                                                                                                                                              |
| `components/Table.tsx`        |        118 | `Table` (`:4-82`), `Pagination` (`:84-118`)                                                                                                                                                                                                                                                                                                                                  |
| `components/Tabs.tsx`         |        111 | `Tabs` (`:3-22`), `SegmentedControl` (`:24-47`), `Menu` (`:49-86`), `MenuShell` (`:88-96`), `ButtonWithMenu` (`:98-111`)                                                                                                                                                                                                                                                     |
| `icons.tsx`                   |        140 | 21 ícones `Icon*` (`:19-136`)                                                                                                                                                                                                                                                                                                                                                |
| `status.ts`                   |         83 | status editoriais (`:12-83`) — domínio                                                                                                                                                                                                                                                                                                                                       |
| `styles.css` / `tokens.css`   | 1628 / 223 | estilos e tokens                                                                                                                                                                                                                                                                                                                                                             |
| `index.ts`                    |         12 | barrel que re-exporta tudo, incluindo `status` (`:12`) e `Patterns` (`:11`)                                                                                                                                                                                                                                                                                                  |

- Harness de catálogo: `KE:packages/design-system/dev/main.tsx` (426 linhas, Vite, importa `tokens.css`/`styles.css` em `:4-5`), acionado pelo script raiz `dev:site` (`KE:package.json:21`).
- Isolamento: o DS só importa React, ícones locais e módulos relativos; nenhum import de `@kal-el/contracts`, `lib/api` ou Next. O único acoplamento interno de domínio é `Patterns.tsx:15` → `../status`.
- Componentes de app (fora do DS) em `KE:apps/cms/components/`: `AppShell`, `BrandLogo`, `DocumentRepair`, `ImageDetailsDialog`, `MediaPicker`, `OperationalStatus`, `TaxonomyManager`, `ThemeToggle`, `editor/RichTextEditor`, `editor/slash.ts`.
- Estado de shell (breadcrumb + slot de status): `KE:apps/cms/lib/chrome.tsx`, que só importa React (`:3-13`).

### 2.6 Comparação com o Aluguei (`packages/ui`, `apps/web/src`)

**Stack de estilo: mesma abordagem** (CSS puro + custom properties `--peg-*` + classes `.peg-*`, sem Tailwind e sem CSS Modules nos dois).

- Aluguei:
  - `@aluguei/ui/styles.css` importado no layout (`apps/web/src/app/layout.tsx:4`);
  - `packages/ui/src/styles/`: `tokens.css` 157 linhas, `base.css` 123, `components.css` 1.306 (158 classes `.peg-*`);
  - CSS do app em `apps/web/src/app/globals.css` (1.114 linhas; shell `.app-shell`/`.app-frame`/`.app-sidebar` em `:16-60`, comentário `:1-2`).

**Tokens `:root` (tema claro)**, comparados programaticamente:

- Aluguei tem 76 tokens (`packages/ui/src/styles/tokens.css:12-116`); Kal El tem 100 (`KE:packages/design-system/src/tokens.css:23-161`).
- **46 nomes em comum**, dos quais **25 com valor igual**: `--peg-space-1…16`, `--peg-radius-xs/sm/md/lg`, `--peg-control-xs…lg`, `--peg-canvas #fcfcfc`, `--peg-surface #ffffff`, `--peg-text-primary #2f332b`, `--peg-info #2563eb`, `--peg-topbar-height 52px`, `--peg-inspector-width 336px`, `--peg-table-row-height 44px`.
- **21 com valor diferente:**

| Token                                      | Aluguei (`tokens.css`)                | Kal El (`KE:…/tokens.css`)           |
| ------------------------------------------ | ------------------------------------- | ------------------------------------ |
| `--peg-border`                             | `#e6e6e3` (`:18`)                     | `#e2e2e0` (`:40`)                    |
| `--peg-border-strong`                      | `#c7c7c7` (`:19`)                     | `#8b8e86` (`:41`)                    |
| `--peg-surface-subtle`                     | `#f0f0f0` (`:16`)                     | `#f7f7f6` (`:34`)                    |
| `--peg-surface-muted`                      | `#e9e9e6` (`:17`)                     | `#f0f0f0` (`:36`)                    |
| `--peg-text-secondary`                     | `#555a52` (`:21`)                     | `#5e6159` (`:50`)                    |
| `--peg-text-tertiary`                      | `#6e746b` (`:22`)                     | `#6b6e65` (`:51`)                    |
| `--peg-text-disabled`                      | `#b6b7bb` (`:23`)                     | `#b3b5af` (`:53`)                    |
| `--peg-success` / `-bg`                    | `#16a34a` / `#e9f7ee` (`:45-46`)      | `#15803d` / `#f0fdf4` (`:57`, `:62`) |
| `--peg-warning` / `-bg`                    | `#d97706` / `#fdf3e3` (`:47-48`)      | `#b45309` / `#fffbeb` (`:58`, `:64`) |
| `--peg-danger` / `-bg`                     | `#dc2626` / `#fdecec` (`:49-50`)      | `#b91c1c` / `#fef2f2` (`:59`, `:66`) |
| `--peg-info-bg`                            | `#e9effd` (`:52`)                     | `#eef3fd` (`:68`)                    |
| `--peg-font-mono`                          | `'SFMono-Regular', Consolas…` (`:57`) | `ui-monospace, "SF Mono"…` (`:92`)   |
| `--peg-radius-xl`                          | 16px (`:64`)                          | 14px (`:130`)                        |
| `--peg-sidebar-width` / `--peg-rail-width` | 240px / 64px (`:85-86`)               | 248px / 60px (`:140-141`)            |
| `--peg-shadow-1/2/3`                       | `:100-102`                            | `:152-154` (valores distintos)       |

- **30 só no Aluguei:**
  - `--aluguei-brand*` (6, `:26-31`)
  - `--peg-nav-*` (9, `:34-42`)
  - `--peg-app-frame-*` (4, `:94-97`)
  - `--peg-z-*` (5, `:106-110`)
  - motion (3, `:113-115`)
  - `--peg-page-padding` (`:91`), `--peg-table-row-dense` (`:90`), `--peg-shadow-app` (`:103`)
- **54 só no Kal El:**
  - `--peg-accent*` (5, `:25-29`)
  - superfícies `inspector`/`selected` (`:35`, `:37`), `--peg-rule`/`--peg-divider` (`:42-43`)
  - textos `ink/body/strong/nav-label/on-ink` (`:46`, `:48-49`, `:52`, `:54`)
  - bordas semânticas `*-bd` (4) e cores de badge `*-fg` (4) (`:63-76`)
  - focus (3, `:79-81`)
  - 19 tokens de fonte (`:88-111`)
  - `--peg-touch` (`:137`), `--peg-editor-width` (`:144`), `--peg-table-head-height`/`--peg-table-row-avatar` (`:145`, `:147`), `--peg-page-pad` (`:148`), `--peg-shadow-0` (`:151`)
  - ícones (4, `:157-160`)

**Conflitos semânticos de tokens**

- Mesmo conceito, nomes diferentes:
  - `--peg-page-padding` (Aluguei `:91`) × `--peg-page-pad` (Kal El `:148`);
  - `--peg-font-family` (Aluguei `:55`) × `--peg-font-sans` + escala em shorthand (Kal El `:88-111`);
  - marca `--aluguei-brand*` (Aluguei `:26-31`) × `--peg-accent*` (Kal El `:25-29`).
- Mesmo nome, valor deslocado: o `#f0f0f0` que o Aluguei usa como `--peg-surface-subtle` é o `--peg-surface-muted` do Kal El.
- O CSS do Kal El depende de tokens que não existem no Aluguei (ex.: `font: var(--peg-font-body)` em `KE:…/styles.css:4`). Aplicado sobre os tokens do Aluguei, ficaria sem tipografia definida.
- `--peg-border-strong`:
  - no Aluguei é `#c7c7c7` e é a borda de `.peg-input` (`packages/ui/src/styles/components.css:328`);
  - no Kal El foi trocado para `#8b8e86` por contraste (`KE:…/tokens.css:14-20`);
  - contraste calculado de `#c7c7c7` sobre `#ffffff`: **1,69:1**, abaixo dos 3:1 do WCAG 2.1 SC 1.4.11 para limites de componentes de UI.

**Classes CSS**

- 158 classes `.peg-*` distintas no Aluguei × 240 no Kal El; **61 homônimas**:
  - `.peg-btn` (+ `--primary`, `--secondary`, `--tertiary`, `--xs`, `--sm`, `--lg`);
  - `.peg-badge` (+ 5 tons);
  - `.peg-card`, `__header`, `__body`, `__title`;
  - `.peg-modal`, `__header`, `__title`, `__body`, `__footer`;
  - `.peg-table`, `.peg-table-wrap`, `.peg-tabs`, `.peg-tab`, `--active`;
  - `.peg-input`, `--error`; `.peg-textarea`, `--error`; `.peg-field`, `__label`, `__error`;
  - `.peg-menu`, `__item`, `--danger`, `__separator`;
  - `.peg-kpi` e elementos, `.peg-segmented` e elementos, `.peg-switch`, `__track`;
  - `.peg-empty` e elementos, `.peg-breadcrumb`, `__current`;
  - `.peg-avatar`, `--lg`; `.peg-divider`, `.peg-stack`, `.peg-toast`, `.peg-inspector`, `.peg-pagination`.
- As regras são independentes com a mesma especificidade (ex.: `.peg-btn--primary` em `components.css:169-172` × `KE:…/styles.css:121-125`). Carregar os dois CSS juntos gera cascata dependente de ordem.
- Os dois pintam o botão primário com "ink" (`#2f332b`), então a convenção visual coincide.

**Componentes**

- 17 nomes existem nos dois pacotes com APIs diferentes: Badge, Breadcrumb, Button, Card, Checkbox, EmptyState, Input, Inspector, InspectorSection, Modal, Pagination, Radio, SegmentedControl, Select, Switch, Tabs, Textarea.

| Componente | Aluguei                                                                                                                                       | Kal El                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Button     | variants primary/secondary/tertiary/danger/danger-subtle/brand; `loading`, `fullWidth`, `icon` (`packages/ui/src/components/Button.tsx:5-16`) | primary/secondary/tertiary/destructive; `iconOnly`, `icon` (`KE:…/Button.tsx:3-11`)        |
| Badge      | tons success/warning/danger/info/brand/neutral (`packages/ui/src/components/Badge.tsx:4`)                                                     | neutral/success/warning/danger/info/accent + `dot` (`KE:…/Badge.tsx:3-5`)                  |
| Modal      | prop `open` obrigatória, `size` sm–xl, `'use client'` (`packages/ui/src/components/Modal.tsx:1`, `:9-24`)                                     | montado só quando aberto; `width` numérico; sem diretiva (`KE:…/Overlays.tsx:51-63`)       |
| Tabela     | `DataTable` com sort, loading e empty (`packages/ui/src/components/DataTable.tsx:8-53`)                                                       | `Table` sem sort/loading/empty; seleção opt-in sem ação conectada (`KE:…/Table.tsx:12-29`) |
| Ícones     | um único `<Icon name>` com união `IconName` (`packages/ui/src/components/icons.tsx:9`, `:691`, `:696`)                                        | 21 componentes `Icon*` (`KE:…/icons.tsx:19-136`)                                           |

- Equivalentes com nomes diferentes: `Field` × `FieldShell`, `SearchInput` × `Search`, `Kpi` × `KpiCard`, `Dropdown` × `Menu`.
- Só no Kal El (sem equivalente em `packages/ui/src/index.ts:1-38`):
  - Shell completo: `Sidebar`, `NavItem`, `MenuButton`, `Rail`, `Topbar`, `AppLayout`, `Workspace`, `Content`, `PageHead`, `InspectorGroup`;
  - `Alert`, `ProfileCard`, `AccountSwitcher`, `ButtonWithMenu`;
  - `FilterBar`, `SaveState`, `CharacterCounter`, `TokenPicker`, `CreatableSelect`, `DateTimeDialog`, `CalendarGrid`/`CalendarNav`;
  - `LinkDialog`, `WorkflowCommentDialog`, `PermissionMatrix`/`RolePermissionSummary`, `StatusLabel`, `EditorSurface`/`InlineToolbar`.
- Só no Aluguei: `ConfirmModal`, `Drawer`, `Tooltip`, `ToastProvider`, `Skeleton`/`SkeletonRows`, `Spinner`, `StatusBadge`, `Tag`, `Avatar`, `Divider`, `Stack`/`Group`, `MoneyValue`, `ErrorState`, `PermissionDenied`, `DisconnectedIntegration`, `InspectorRows`, `IconButton`.
- O shell do Aluguei é código de app, não de pacote: `apps/web/src/components/shell/app-shell.tsx:7-16` só importa `cx` e `Icon` de `@aluguei/ui`, e os estilos ficam em `apps/web/src/app/globals.css:14-60`.

**Framework e runtime**

- React: 18.3.1 no Kal El (`KE:apps/cms/package.json:20`; dev do DS `KE:packages/design-system/package.json:32-33`) × 19.2.3 no Aluguei (`apps/web/package.json:18`). O peer do DS aceita `^19` (`:21-24`), mas só há teste com 18. Compatibilidade com React 19: **NÃO_DETERMINADA** (não executado).
- Next: 14.2.35 × 16.3.0. O próprio Aluguei avisa que o Next 16 tem breaking changes (`apps/web/AGENTS.md:1-3`), então os padrões de app do CMS (`middleware.ts`, layouts, `next/font/local`) não se transferem diretamente.
- `"use client"`: 0 arquivos no DS do Kal El × 13 no `packages/ui` (Checkbox, ConfirmModal, Drawer, Dropdown, Input, Modal, Radio, SearchInput, Select, Switch, Textarea, Toast, Tooltip).
  - Os componentes do Kal El com hooks (`Shell.tsx:1`, `Overlays.tsx:1`, `Patterns.tsx:9`) exigem Client Component no App Router.
  - No Kal El isso é garantido pelos consumidores (ex.: `KE:apps/cms/components/AppShell.tsx:1`).
- Rigor de TS e lint: código trazido do Kal El precisa passar em `exactOptionalPropertyTypes: true` (`tsconfig.base.json:9`) e `strictTypeChecked` (`eslint.config.mjs:20`).
  - Exemplo: `KE:apps/cms/components/AppShell.tsx:78` atribui `onNavigate: c.href ? () => … : undefined` à prop opcional `onNavigate?` (`KE:…/Overlays.tsx:180`), padrão que `exactOptionalPropertyTypes` rejeita.
  - Número total de erros: NÃO_DETERMINADO (não executado).
- Formatação: aspas duplas no Kal El (`KE:…/Button.tsx:1`) × simples no Aluguei (`packages/ui/src/components/Button.tsx:1`).

**Tipografia, tema, responsividade e acessibilidade**

- Fontes: Poppins/Montserrat locais no Kal El (`KE:apps/cms/app/layout.tsx:14-39`) × Inter via `next/font/google` no Aluguei (`apps/web/src/app/layout.tsx:3`, `:7-12`). É identidade de marca; não trazer.
- Tema escuro:
  - os dois definem `[data-theme='dark']` (`packages/ui/src/styles/tokens.css:118-157`; `KE:…/tokens.css:164-223`);
  - o web do Aluguei não aplica tema: grep por `data-theme|prefers-color-scheme` em `apps/web/src` = 0;
  - o Kal El tem bootstrap + toggle (seção 2.3).
- Breakpoints:
  - 1023px nos dois para shell/drawer (`KE:…/styles.css:1212`; `packages/ui/src/styles/components.css:93`; `apps/web/src/app/globals.css:359`, `:370`, `:585`, `:809`);
  - o Aluguei também usa 479, 767 e 1279 (`components.css:98`; `globals.css:409`, `:597`, `:743`, `:749`, `:1010`, `:1019`, `:1103`);
  - os docs PEG com a mesma escala existem nos dois repositórios (seção 2.4).
- Overlays: os dois têm focus trap, Escape e restauração de foco (`packages/ui/src/components/Modal.tsx:28-59`, `Drawer.tsx:33-59`; `KE:…/Overlays.tsx:74-111`). A diferença na dependência do efeito está na seção 2.9.
- Tabela: o Kal El torna focável o wrapper rolável (`KE:…/Table.tsx:31-33`, regra axe `scrollable-region-focusable`). No `DataTable` do Aluguei: NÃO_DETERMINADO (wrapper não inspecionado).

### 2.7 Candidatos a reaproveitamento (somente como REFERÊNCIA; nada foi copiado)

Premissas para qualquer adoção:

- Reimplementar sobre os tokens do Aluguei (`--peg-*` + `--aluguei-*`).
- Seguir as convenções do Aluguei: `'use client'` onde houver hooks, `exactOptionalPropertyTypes`, `strictTypeChecked`, aspas simples.
- Nunca importar `@kal-el/*`.

Risco de domínio: **Baixo** = sem dependência de domínio; **Médio** = textos, defaults ou semântica de domínio a substituir; **Alto** = acoplado a API ou regra do Kal El (ver seção 2.8).

| #   | Candidato                                                                                                                                   | Onde (`KE:`)                                                                                                                  | O que oferece                                                                                                                                                         | Acoplamento de domínio                                                                           | Situação no Aluguei                                                                                                                                        | Risco                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Shell: `AppLayout`, `Sidebar`, `NavItem`, `MenuButton`, `Rail`, `Topbar`, `Workspace`, `Content`, `PageHead`, `Inspector`, `InspectorGroup` | `packages/design-system/src/components/Shell.tsx:3-224`; drawer ≤1023px em `styles.css:1212`                                  | drawer com scrim (`:71`); foco inicial, Escape e restauração (`:49-67`); rail compacto (`:143-161`); topbar com slots (`:163-180`); `PageHead` com ações (`:214-224`) | nenhum import de domínio (`:1`); rótulos pt-BR fixos (`:76`, `:84`, `:123`)                      | shell é código de app (`apps/web/src/components/shell/app-shell.tsx:7-16`; `apps/web/src/app/globals.css:14-60`); o pacote não tem Shell                   | Baixo                      |
| 2   | Modal com focus trap estável                                                                                                                | `Overlays.tsx:46-137`                                                                                                         | Tab cíclico, Escape, restauração; `closeRef` evita re-executar o efeito a cada render do pai (`:66-72`)                                                               | nenhum                                                                                           | Modal/Drawer com deps `[open, onClose]` (`packages/ui/src/components/Modal.tsx:59`; `Drawer.tsx:59`) — ver 2.9                                             | Baixo                      |
| 3   | Breadcrumb                                                                                                                                  | `Overlays.tsx:176-213`                                                                                                        | folha com `aria-current` e sem link (`:183-211`)                                                                                                                      | nenhum                                                                                           | já existe Breadcrumb (API diferente)                                                                                                                       | Baixo                      |
| 4   | Alert / EmptyState / Toast                                                                                                                  | `Overlays.tsx:139-174`                                                                                                        | `Alert` com `role="alert"` por tom (`:147-164`); empty com ação (`:166-174`); Toast simples, sem fila (`:139-145`)                                                    | nenhum                                                                                           | EmptyState/ErrorState/PermissionDenied e ToastProvider existem; **não há Alert**                                                                           | Baixo                      |
| 5   | FormControls                                                                                                                                | `FormControls.tsx:4-115`                                                                                                      | `FieldShell` com "opcional", hint e erro (`:12-29`); `aria-invalid` (`:39`); `Switch` com `role="switch"` (`:110`)                                                    | nenhum; texto "opcional" (`:18`)                                                                 | Field/Input/Textarea/SearchInput/Select/Checkbox/Radio/Switch próprios                                                                                     | Baixo                      |
| 6   | Table + Pagination                                                                                                                          | `Table.tsx:4-118`                                                                                                             | wrapper rolável focável (`:31-33`); seleção opt-in justificada (`:12-16`)                                                                                             | nenhum                                                                                           | `DataTable` do Aluguei é mais completo (sort/loading/empty); a `Pagination` do Kal El renderiza um botão por página, sem janela (`:107-111`), e não escala | Baixo (referência pontual) |
| 7   | Tabs, SegmentedControl, Menu, ButtonWithMenu                                                                                                | `Tabs.tsx:3-111`                                                                                                              | contagem na aba (`:17`); roles `tablist`/`tab`/`menu`/`menuitem` (`:7`, `:11`, `:66`, `:74`)                                                                          | nenhum; `ButtonWithMenu` não gerencia abertura nem teclado (`:104-111`)                          | Tabs, SegmentedControl e Dropdown existem                                                                                                                  | Baixo                      |
| 8   | Card, KpiCard, ProfileCard                                                                                                                  | `Card.tsx:3-77`                                                                                                               | card com header, descrição e ações; KPI com delta                                                                                                                     | nenhum                                                                                           | Card, Kpi e Avatar existem                                                                                                                                 | Baixo                      |
| 9   | FilterBar                                                                                                                                   | `Patterns.tsx:117-168`                                                                                                        | busca + controles + chips removíveis + "limpar tudo" (justificativa `:119-123`)                                                                                       | nenhum na API (`:117-132`)                                                                       | sem equivalente no pacote (`packages/ui/src/index.ts:1-38`)                                                                                                | Baixo                      |
| 10  | SaveState                                                                                                                                   | `Patterns.tsx:38-84`                                                                                                          | indicador de autosave com largura e altura fixas (sem layout shift), inclui estado "offline" (`:38-51`)                                                               | nenhum                                                                                           | sem equivalente                                                                                                                                            | Baixo                      |
| 11  | TokenPicker / CreatableSelect                                                                                                               | `Patterns.tsx:733-830`, `:966-1013`                                                                                           | multiseleção pesquisável com chips e teclado; select com "Outro…"                                                                                                     | comentário cita taxonomias (`:735-741`), mas a API é genérica, `PickerOption {id,name}` (`:733`) | sem equivalente                                                                                                                                            | Baixo/Médio                |
| 12  | DateTimeDialog                                                                                                                              | `Patterns.tsx:309-421`                                                                                                        | diálogo de data e hora local (`splitLocal` `:309`)                                                                                                                    | defaults "Agendar publicação"/"Agendar" (`:326-327`)                                             | sem equivalente                                                                                                                                            | Médio (trocar defaults)    |
| 13  | CalendarGrid / CalendarNav                                                                                                                  | `Patterns.tsx:500-732`                                                                                                        | visões mês/semana/agenda; semana começando na segunda (`:521`)                                                                                                        | `CalendarEntry` com `author`/`status` (`:500-509`); "Editorial calendar" (`:590`)                | calendário próprio em `apps/web/src/app/app/crm/calendar/calendar-client.tsx` (314 linhas)                                                                 | Médio                      |
| 14  | InspectorSection                                                                                                                            | `Patterns.tsx:169-212`                                                                                                        | seção de inspector com hint e ações                                                                                                                                   | nenhum                                                                                           | já existe InspectorSection                                                                                                                                 | Baixo                      |
| 15  | Padrão "chrome": breadcrumb + slot de status via store externo                                                                              | `apps/cms/lib/chrome.tsx:3-50`                                                                                                | publicação de breadcrumb/status por página sem loop de render (comentário `:23-33`)                                                                                   | só React (`:3-13`)                                                                               | breadcrumb calculado no shell (`breadcrumbFor`, `app-shell.tsx:10`)                                                                                        | Baixo (padrão de app)      |
| 16  | Bootstrap de tema + toggle                                                                                                                  | `apps/cms/app/layout.tsx:46-68`; `apps/cms/components/ThemeToggle.tsx:7-43`                                                   | aplica o tema antes do primeiro paint                                                                                                                                 | chave "kal-el-theme" (`ThemeToggle.tsx:7`)                                                       | tokens dark existem, mas o web não usa `data-theme`                                                                                                        | Baixo                      |
| 17  | Técnica de QA: gate axe + matriz de viewports                                                                                               | `apps/cms/e2e/a11y.spec.ts:4-131`; `apps/cms/e2e/_surfaces.ts:13-17`; `artifacts/visual/*.png`                                | falha em violações critical/serious; 375/390/768/1024/1440; screenshots claro/escuro                                                                                  | specs dependem de seed, auth e fluxos do CMS                                                     | —                                                                                                                                                          | Médio                      |
| 18  | Docs de referência                                                                                                                          | `design-system/01–04`, `VISUAL_QA.md`, `ACCEPTANCE_CHECKLIST.md`; `design-system/references/kal-el-final/KAL_EL_INVENTORY.md` | foundations, shells A–F, patterns, checklist de QA; valores literais (ex.: item de nav ativo `#E8E8E6` + barra inset 2px, `KAL_EL_INVENTORY.md:25`)                   | docs genéricos: nenhum; `kal-el-final` é específico do CMS                                       | genéricos já presentes em `design-source/peg-product-design-system/` (seção 2.4)                                                                           | Baixo                      |

### 2.8 Riscos de contaminação de domínio (NÃO trazer)

**A) Dentro do design system: arquivos que misturam UI com domínio do Kal El**

| Arquivo                                   | Trecho                             | Domínio embutido                                                                                                                       |
| ----------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `KE:packages/design-system/src/status.ts` | `:12-58`                           | status editoriais (draft/in_review/scheduled/published/blocked/archived) com textos de CMS (`:24-55`)                                  |
| `KE:packages/design-system/src/index.ts`  | `:11-12`                           | o barrel re-exporta `Patterns` e `status`, então `import … from "@kal-el/design-system"` arrasta o domínio                             |
| `KE:…/components/Patterns.tsx`            | `:15`                              | importa `status`                                                                                                                       |
|                                           | `:22-37`                           | `StatusLabel` (enum editorial)                                                                                                         |
|                                           | `:79-83`                           | `CharacterCounter` com semântica de SEO                                                                                                |
|                                           | `:199-308`                         | `LinkDialog`: busca de artigo interno e `/slug` (`:211`, `:219`, `:288-289`)                                                           |
|                                           | `:326-327`                         | defaults de `DateTimeDialog`                                                                                                           |
|                                           | `:422-499`                         | `WorkflowCommentDialog`, revisão editorial (`:486`, `:490`)                                                                            |
|                                           | `:500-509`, `:521`, `:590`, `:650` | calendário editorial com autor                                                                                                         |
|                                           | `:839-886`                         | catálogo de permissões do Kal El (sites/articles/taxonomy/media/seo/tokens), que referencia `KE:apps/api/src/auth-context.ts` (`:839`) |
| `KE:…/components/Editor.tsx`              | `:16-17`, `:26`                    | placeholders "Título da matéria"/"dek"; texto "O editor de artigos é o coração do Kal El"                                              |
| `KE:…/components/Overlays.tsx`            | `:25`                              | rótulo "Conta" no `AccountSwitcher` (menor)                                                                                            |
| `KE:…/tokens.css`                         | `:25-29`, `:88-91`                 | accent vermelho e fontes da marca (identidade, não regra de negócio)                                                                   |

**B) App CMS: acoplado a API, auth e rotas do Kal El**

| Arquivo                                                                                     | Evidência                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KE:apps/cms/lib/api.ts`                                                                    | 450 linhas e 94 exports (artigos, revisões, mídia, taxonomias, usuários, papéis, service tokens, sites, webhooks, audit, redirects); `NEXT_PUBLIC_API_BASE_URL` com padrão `http://localhost:3001` (`:1`); cookie CSRF `ke_csrf` (`:14-18`); header `x-kal-el-csrf` (`:25`); `credentials: "include"` (`:29`); envelope `{data, error}` (`:34-38`) |
| `KE:apps/cms/lib/auth.tsx`                                                                  | importa `./api` (`:4`); contexto com `sites`/`activeSiteId` (`:6-15`)                                                                                                                                                                                                                                                                              |
| `KE:apps/cms/middleware.ts`                                                                 | protege "/" e "/articles" (`:5`); cookie `ke_session` (`:8`)                                                                                                                                                                                                                                                                                       |
| `KE:apps/cms/components/AppShell.tsx`                                                       | `useAuth`/`useChrome` (`:29-30`); seções do CMS (`:37-56`); sites (`:72`); navegação editorial (`:88-121`); `signOut` (`:123`); seletor de site (`:183-195`)                                                                                                                                                                                       |
| `KE:apps/cms/components/{MediaPicker,DocumentRepair,OperationalStatus,TaxonomyManager}.tsx` | importam `lib/api` e/ou `lib/auth` (`:5-6`, `:6`, `:6`, `:5-6`)                                                                                                                                                                                                                                                                                    |
| `KE:apps/cms/components/editor/RichTextEditor.tsx`                                          | TipTap/ProseMirror + `@kal-el/editor` + `@kal-el/contracts` (`ArticleDocumentV2`, `:5-16`)                                                                                                                                                                                                                                                         |
| `KE:apps/cms/components/BrandLogo.tsx`                                                      | PNGs da marca (`:19`, `:21`)                                                                                                                                                                                                                                                                                                                       |
| `KE:apps/cms/app/(app)/**`                                                                  | 19 de 21 arquivos importam `lib/api` (ex.: `articles/page.tsx:31`, `media/page.tsx:20`, `users/page.tsx:6`, `page.tsx:17`)                                                                                                                                                                                                                         |
| `KE:apps/cms/app/globals.css`                                                               | classes de domínio `.kalel-*` (media, canvas, dash, revisions, qa, perm, serp, social…) e `.peg-editor*` do ProseMirror                                                                                                                                                                                                                            |
| `KE:apps/cms/app/login/*`, `KE:apps/cms/public/*`, `KE:apps/cms/app/fonts/*`                | login com `useAuth` (`login/page.tsx:6-8`), `login.css`, imagem hero, logos e fontes da marca                                                                                                                                                                                                                                                      |

**C) Fora do escopo de UI (proibido pela tarefa)**: `KE:apps/api`, `KE:apps/worker`, `KE:apps/fixture`, `KE:packages/{auth,contracts,db,events,importer,sdk,testkit,editor}`, `docker-compose*.yml`, `scripts/`, `.env`.

**Regra prática derivada do inventário**

- Consultar apenas:
  - `KE:packages/design-system/src/components/{Shell,Overlays,FormControls,Table,Tabs,Card,Badge}.tsx`;
  - os blocos genéricos de `Patterns.tsx`: `FilterBar`, `SaveState`, `InspectorSection`, `TokenPicker`, `CreatableSelect`, `DateTimeDialog`, `Calendar*`;
  - as regras correspondentes de `styles.css`.
- Tratar como domínio: `status.ts`, o bloco de permissões, `LinkDialog`, `WorkflowCommentDialog`, `Editor.tsx` e todo o `apps/cms`.

### 2.9 Achados técnicos úteis ao Aluguei

Todos vêm da comparação e nenhum foi verificado em execução.

1. **Foco do Modal e do Drawer depende de `onClose`**
   - O efeito de foco usa deps `[open, onClose]` (`packages/ui/src/components/Modal.tsx:28-59`, deps em `:59`; `Drawer.tsx:59`).
   - A cada re-render do pai com uma closure `onClose` nova, o cleanup devolve o foco ao elemento anterior (`Modal.tsx:57`) e o efeito refoca o primeiro focável (`:36`).
   - O Kal El documenta esse mesmo bug (campo dentro do modal perdendo foco durante a digitação) e o corrige com `closeRef` (`KE:…/Overlays.tsx:66-72`).
   - `ConfirmModal` usa `Modal` (`packages/ui/src/components/ConfirmModal.tsx:3`, `:28-30`).
   - Se o bug se manifesta no Aluguei: NÃO_DETERMINADO, pois depende de closures instáveis e de re-render durante a interação.
2. **Contraste da borda de input**
   - `.peg-input` usa `--peg-border-strong` `#c7c7c7` (`components.css:328`; `tokens.css:19`), o que dá 1,69:1 sobre `#ffffff` (cálculo WCAG) e fica abaixo dos 3:1 do SC 1.4.11.
   - O Kal El usa `#8b8e86`, com 3,33:1 segundo `KE:…/tokens.css:18`.
3. **Shell fora do pacote**: `@aluguei/ui` não tem Shell. O Kal El separa Shell (DS) de AppShell (app), com drawer acessível (seção 2.7 #1).
4. **Tema escuro sem uso**: está definido nos tokens do Aluguei e não é aplicado no web. O Kal El mostra um bootstrap antes do paint (seção 2.7 #16).
5. **QA automatizado**: gate axe + matriz de viewports no e2e (seção 2.7 #17).

### 2.10 NÃO_DETERMINADO (Kal El)

| Item                                                                                                            | Motivo                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Renderização e fidelidade visual reais dos componentes                                                          | não executado                                                                        |
| Compatibilidade do DS com React 19/Next 16 sem ajustes                                                          | só há testes com React 18                                                            |
| Quantidade de erros de TS e lint se o código fosse portado                                                      | não executado                                                                        |
| Quanto `KE:design-system/20_COMMERCE_WAYNE_UI.md` (UI de CRM da mesma família) serve às telas de CRM do Aluguei | não analisado em profundidade; existe nas duas cópias com diferença só de formatação |
| Licença/propriedade para reuso de código, fontes e imagens do Kal El                                            | nenhum arquivo de licença foi procurado ou lido                                      |
| Conteúdo de `KE:.env`                                                                                           | não lido deliberadamente                                                             |

---

## Apêndice — Método (somente leitura)

- **Ferramentas**: Read, Grep e Glob; bash com `find`, `grep`, `wc`, `sed -n`, `awk`, `sha256sum`, `diff --strip-trailing-cr`, `comm`/`join` (comparação de tokens, classes e componentes, com arquivos intermediários só no scratchpad) e `git log/show --stat/status/branch --show-current`.
- **Mobile**: os 22 arquivos de `apps/mobile` (sem `node_modules`) foram lidos integralmente.
- **API e contratos**: `apps/api/src/{app.ts,errors.ts}`, `plugins/session.ts`, `routes/{auth,visits,inspections}.ts`, `routes/properties.ts:1-330`, `packages/contracts/src/{auth,visits,inspections,property,common}.ts`, `packages/domain/src/{authz/rbac.ts,inspection/stateMachine.ts}`, `apps/worker/src/inspectionJobs.ts`.
- **Kal El**: manifests, `tokens.css`, `status.ts`, `Shell`, `Table`, `Overlays`, `Card`, `FormControls`, `Tabs`, `Badge` e `AppShell` lidos integralmente; `Patterns.tsx`, `Editor.tsx`, `lib/*` e CSS lidos por trechos, com linhas citadas.
- **Contagens**: 667 arquivos no Kal El e 2.383 linhas no mobile, obtidos por `find`/`wc` e somas de `Read`, com as exclusões da seção 2.

--- fim do relatório ---
