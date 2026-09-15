# ADRs propostos — Gate G2, Track B1 (fundações do frontend)

> Rascunhos da Track B1. **Não** foram registrados em `docs/DECISIONS.md` (fora do escopo da
> trilha). Numeração provisória `G2B1-n`; o número definitivo sai na consolidação do gate, junto
> com os ADRs das outras trilhas. Evidências em `docs/audits/2026-09-10/evidence/g2/track-b1/`.

## G2B1-1 — Entrada numérica pt-BR: centavos inteiros e ambiguidade recusada (P0-07)

Status: Proposto.

Contexto: "3.500" — o próprio placeholder — era gravado como R$ 3,50. Três formulários convertiam
com `parseFloat(v.replace(',', '.'))`, que lê o ponto de milhar como decimal; a área do cadastro de
imóvel tinha o mesmo defeito.

Decisões:

- Um único parser em `packages/ui/src/lib/money.ts`: ponto separa milhares, vírgula separa
  decimais, resultado inteiro na menor unidade (centavos). Sem ponto flutuante na conversão.
- Texto que só faz sentido em outro formato (`3.50`, `1234.56`, `0.500`) é **recusado** com
  mensagem (`AMBIGUOUS`), nunca adivinhado: um valor digitado errado não pode virar outro valor
  gravado. Também recusados: mais de 2 casas, negativo, lixo, milhar mal agrupado (`12.34,56`).
- Teto padrão `2.147.483.647` centavos: as colunas de dinheiro são `integer` (int4).
- `MoneyInput` emite `number | null` e usa `setCustomValidity`: texto inválido bloqueia o envio
  nativo do formulário, com a mensagem no campo.
- Estrutura rótulo/ajuda/erro no padrão `FieldShell` do Kal El, reimplementada sobre
  `.peg-field`/`.peg-input` e os tokens do Aluguei (o CSS do Kal El não é carregado).

Consequências: formulários novos de dinheiro devem usar `MoneyInput`; a guarda
`apps/web/src/lib/money-parsing-guard.test.ts` falha se `parseFloat`/`Number` sobre
`replace(',', '.')` voltar ao web.

## G2B1-2 — BFF transparente: content-type só com corpo e resposta repassada como veio (P1-02)

Status: Proposto.

Contexto: `apiFetch`/`apiProxy` definiam `content-type: application/json` sempre — mutação sem
corpo virava 400 `FST_ERR_CTP_EMPTY_JSON_BODY` (logout, gerar/enviar contrato, cancelar cobrança,
remover característica) — e `apiProxy` convertia toda resposta em JSON (CSV virava `{}`).

Decisões:

- `content-type: application/json` só quando há corpo; o proxy genérico repassa o content-type do
  navegador quando há corpo.
- `apiProxy` devolve status e bytes intactos (vazio em 204/304) e uma lista fechada de headers de
  conteúdo — `content-type`, `content-disposition`, `cache-control` — além de todos os
  `Set-Cookie`. `content-length` e `content-encoding` ficam de fora: o corpo é reenviado já
  decodificado.
- `apiFetch` só interpreta JSON quando a API declara JSON.

## G2B1-3 — `GET /dashboard/summary`: agregação no banco, por organização e por permissão (P1-01)

Status: Proposto.

Contexto: a Visão Geral buscava 12 listagens com `limit=200` (a API aceita até 100) e mostrava tudo
zerado; mesmo com `limit=100`, os números seriam o tamanho de uma página.

Decisões:

- Rota de leitura nova em `apps/api/src/routes/dashboard.ts`: `count(*) filter (where …)` por
  seção, sempre com `org_id` da sessão. Sem migration e sem mudança de rota existente.
- Cada seção só é calculada com a permissão de leitura correspondente (`lead:read`,
  `finance:read`…); sem ela vem `null` e a tela mostra "—" — nunca um zero inventado.
- "Hoje" é o dia civil de `America/Sao_Paulo`, calculado pelo banco de fusos do ICU; todas as
  comparações usam o mesmo instante, devolvido em `generatedAt`, e o teste de integração compara
  com contagens SQL independentes nesse instante.
- Filas (tarefas atrasadas/de hoje, cobranças vencidas, visitas) limitadas a 8/6 itens; as
  contagens são totais.

Alternativas descartadas: aumentar o limite da API (proibido pelo plano e não resolve contagens);
paginar as 12 listas no servidor do Next (N chamadas por visita e contagens ainda erradas).

## G2B1-4 — Referências sem carregar a organização inteira: `ids`, `q`, combobox assíncrono (P1-01)

Status: Proposto.

Contexto: 37 chamadas `limit=200` montavam selects e resolviam nomes carregando todas as pessoas e
imóveis da organização.

Decisões:

- Listagens de `properties`, `parties` e `listings` aceitam `ids` (1 a 100 uuids, separados por
  vírgula) e `properties` aceita `q` (trecho do título, `ILIKE` com `%`, `_` e `\` escapados). Id de
  outra organização some da resposta, igual a id inexistente. Testes de isolamento em
  `tests/integration/src/list-search.test.ts`.
- `apps/web/src/lib/lookup.ts`: `useLookup` resolve só os ids da página (lotes de 100);
  `useAllPages` percorre, de 100 em 100 e com teto de 50 páginas marcado como `truncated`, as
  listagens sem `ids` que pertencem à trilha A (`rental-applications`, `contracts`), sem alterar
  essas rotas.
- `AsyncCombobox` (padrão combobox + listbox do WAI-ARIA) substitui os selects de imóvel dos modais
  de anúncio, proposta e vistoria; a lista fica no fluxo, abaixo do campo, para não ser cortada
  pelo corpo rolável do modal. Referência Kal El: `TokenPicker`, reimplementado para seleção única
  assíncrona.
- Guarda permanente `apps/web/src/lib/api-limits.test.ts`: todo `limit` literal do web é validado
  contra o `paginationQuerySchema` real da API, e `limit` calculado em tempo de execução é proibido.

Consequências: `leads?limit=100` (detalhe do lead, inbox) e `proposals?limit=100` (detalhe da
candidatura) continuam válidos, mas só enxergam os 100 mais recentes — pendência P2-03.

## G2B1-5 — Logout só conclui com confirmação da API (P1-03)

Status: Proposto.

Decisões:

- `requestLogout` considera a saída concluída com 2xx ou 401 (sessão que já não existe); qualquer
  outra resposta, ou falha de rede, mantém a pessoa na página com a mensagem.
- Sucesso faz recarga completa (`window.location.assign`), para nada da sessão encerrada ficar em
  memória no navegador.
- Portais: "Sair" deixa de ser link e chama `/api/portal/auth/logout`.

Consequências: `POST /portal/auth/logout` (`apps/api/src/routes/portal.ts`, fora da trilha) só
limpa o cookie e não revoga a linha de `portal_sessions`: um cookie copiado antes do "Sair" segue
válido até expirar. Pendência para a trilha dona do portal. No painel, o logout revoga todas as
sessões do usuário na organização ativa (P2-23), comportamento da API mantido.

## G2B1-6 — Rotas `/dev` do web fora de produção (P3)

Status: Proposto.

Decisão: `/dev/calibration` chama `notFound()` quando `NODE_ENV === 'production'`, o mesmo critério
da API (`apps/api/src/app.ts` só registra rotas `/dev` fora de produção). No build de produção a
rota é pré-renderizada como 404.

## G2B1-7 — Regras da trilha A na interface: módulos puros testados, domínio fora do bundle do cliente

Status: Proposto.

Contexto: a trilha A mudou regras que a interface precisa refletir (crédito só decidido em
`MANUAL_REVIEW` com motivo; contrato imutável após o envio e regeneração explícita; `VOID` só a
partir de `GENERATED`; variáveis de template; status da sugestão de IA).

Decisões:

- As decisões de tela ficam em módulos puros em `apps/web/src/lib` (`credit-decision`,
  `contract-rules`, `contract-template-hints`, `inspection-suggestions`), cobertos por testes
  unitários; os componentes só os consomem.
- Os módulos **não importam `@aluguei/domain` em tempo de execução**: o pacote traz `node:crypto`
  e quebraria o bundle do cliente (mesma cautela de `apps/web/src/lib/rbac.ts`). A consistência com
  o domínio é garantida nos testes, que rodam no Node e comparam com `canTransitionContract`,
  `CONTRACT_TEMPLATE_VARIABLES`, `renderTemplate` e `suggestionStatusSchema`.

## G2B1-8 — Foco de `Modal` e `Drawer` não depende de `onClose`

Status: Proposto.

Contexto: na revisão final da trilha, o diálogo da decisão de crédito (motivo digitado, G2B1-7)
perdia o foco a cada tecla. `Modal` e `Drawer` de `packages/ui` rodavam o efeito de foco com
`[open, onClose]`, e as telas passam uma função nova a cada render: cada tecla num campo controlado
re-executava o efeito, que devolvia o foco ao botão que abriu o diálogo e o levava para "Fechar" — o
espaço seguinte fechava o diálogo. O `fill` do Playwright troca o valor de uma vez e escondia o
defeito. Reproduzido também em "Novo contato" (CRM) e no `Drawer` da página de calibração; pelo
código, "Nova ocorrência" (detalhe da vistoria) tem a mesma causa.

Decisões:

- Um hook compartilhado, `packages/ui/src/lib/use-dialog-focus.ts`, usado por `Modal` e `Drawer`:
  o efeito depende só de `open`; uma referência guarda o `onClose` mais recente. Padrão do `Modal`
  de `packages/design-system/src/components/Overlays.tsx` do Kal El, reimplementado — o CSS e o
  restante do componente do Kal El não foram trazidos.
- A lista de focáveis é lida a cada Tab, sem elementos desabilitados ou invisíveis, porque o
  conteúdo do diálogo muda enquanto ele está aberto.
- O listener de teclado continua na fase de bolha (o Kal El usa captura): o `AsyncCombobox` para a
  propagação do Escape para fechar só a lista de opções, sem fechar o modal.
- Spec que digita em diálogo usa `pressSequentially`, como uma pessoa digita.

Consequências: todo `Modal`, `ConfirmModal` e `Drawer` do web herda a correção sem mudança nas
telas. Teste permanente: `tests/e2e/src/g2-b1-dialog-focus.spec.ts` (decisão de crédito com Tab e
Escape, "Novo contato" e campo controlado no `Drawer` da página de calibração).
