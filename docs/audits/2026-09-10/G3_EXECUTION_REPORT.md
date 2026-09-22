# G3 — Relatório de execução (Fases 5 e 6)

Auditoria de referência: `docs/audits/2026-09-10/`. Plano: `14_CONTINUATION_PLAN.md` (§4 Fases 5
e 6, §5 Gates) e `g3/G3_PLAN.md`. Execução: 2026-09-17 a 2026-09-22. Máquina: Windows 11 Pro, Node
24.19, pnpm 11.15.1, PostgreSQL 17 local para `test:pg`. Decisões: `docs/DECISIONS.md`, ADR-063 a
ADR-092 (os rascunhos de cada trilha ficam em `g3/ADR_DRAFTS_TRACK_*.md`).

Sem efeito externo em nenhuma etapa: providers FAKE, Meta em dry-run, IA mock, verificador do
WhatsApp FAKE. Nenhuma cobrança, Pix, boleto, estorno, mensagem, consulta de crédito, assinatura,
publicação ou e-mail real: recuperação de senha e convite gravam a mensagem numa caixa de saída
local (`email_outbox`).

## 1. Critério do gate

Critério do plano: "regras/ciclos + operação mínima (fail-fast, logs de job, OTEL, backup
automatizado)".

| Item                                         | Situação                                                                                                                                                                                          | Onde                  | Evidência               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------- |
| P1-07 multa e juros                          | Fechado: juros de 1% ao mês pro rata die (antes 1% ao dia, sem teto) e multa de 2%, por locação, com teto; vencimento no dia da locação com carência de dia útil no calendário de São Paulo       | Trilha C, ADR-063     | `evidence/g3/track-c/`  |
| P1-08 coproprietários                        | Fechado: participação por proprietário (soma exata de 100%), repasse e lançamento por proprietário                                                                                                | Trilha C, ADR-064     | `evidence/g3/track-c/`  |
| P1-20 ciclo da locação                       | Fechado: renovar, reajustar e encerrar com trava e histórico; scheduler por status explícito com varredura diária                                                                                 | Trilha C, ADR-065     | `evidence/g3/track-c/`  |
| P2-01 a P2-04 cadastros e identidade         | Fechado: CPF e CNPJ com dígito verificador; pessoa, visita, proposta e lead com detalhe, edição e ciclo; troca e recuperação de senha; convite por e-mail com token de uso único travado          | Trilha D, ADR-080–087 | `evidence/g3/track-d/`  |
| P2-05 portal                                 | Fechado: extrato sem cobrança cancelada, `total` como contagem, só vistoria concluída visível, pagamento com multa e juros                                                                        | Trilha E1, ADR-066    | `evidence/g3/track-e/`  |
| P1-24 vistoria                               | Fechado: evidência fechada depois de concluída, remoção de mídia auditada                                                                                                                         | Trilha E1, ADR-067    | `evidence/g3/track-e/`  |
| P1-18 WhatsApp                               | Fechado: handoff até a equipe devolver (E1) e prova de posse do número com o token da própria conexão (E2)                                                                                        | ADR-068 e ADR-088     | `track-e/`, `track-e2/` |
| P1-12, P1-14, P1-15 fail-fast e configuração | Fechado: `NODE_ENV` obrigatório, produção para sem configuração, FAKE só com `ALLOW_FAKE_PROVIDERS=true`, Redis sem derrubar a API, http interno só com permissão                                 | Trilha F, ADR-069–072 | `evidence/g3/track-f/`  |
| P2-10 logs de job                            | Fechado: log por job, health HTTP do worker com healthcheck no compose e parada graciosa                                                                                                          | Trilha F, ADR-073     | `evidence/g3/track-f/`  |
| P2-11 OTEL e redação                         | Fechado: spans de HTTP, fetch e pg; erro com pilha; redação de CPF, CNPJ, e-mail, telefone e cookie; diff na auditoria                                                                            | Trilha F, ADR-074–077 | `evidence/g3/track-f/`  |
| Backup automatizado (Fase 6)                 | Fechado: `pg_dump` 17 cifrado (AES-256-GCM), retenção de 14, agendado com healthcheck; restauração provada em PostgreSQL real, tabela a tabela                                                    | Trilha F2, ADR-079    | `evidence/g3/track-f2/` |
| P2-12 banco                                  | Fechado: runner de migration com trava (F), índice parcial do portal (E2), 52 CHECKs presos ao domínio, `bigint` nos totais da conciliação e schema do drizzle como fonte de índices e CHECKs (G) | ADR-078, 089–092      | `track-e2/`, `track-g/` |

**G3 PASSED.**

## 2. Como foi executado

Cada trilha virou um PR próprio sobre `main`. As trilhas que mudam o schema rodaram em sequência
(migrations 0019 na C, 0020 na D, 0021 na E2, 0022 na G); a F e a F2 não mudam o schema. A C, a E1 e
a F2 foram feitas pelo orquestrador; a F, a D, a E2 e a G, por agentes em worktrees próprios. O
orquestrador refez, antes de cada merge, os 9 gates sem cache, o `test:pg` e o Playwright
completo, com o `main` mais recente mesclado quando a branch vinha de antes.

| Trilha | PR  | Merge     | Verificação sem cache                                            | Deploy                                                  | Smoke |
| ------ | --- | --------- | ---------------------------------------------------------------- | ------------------------------------------------------- | ----- |
| C      | #10 | `8409420` | `afd59c8`: 837 testes, `test:pg` 10/10, Playwright 32/32         | `hvau435f11817www8noqqxsm`                              | 15/15 |
| E1     | #12 | `aec1ca5` | `b6b7a02`: 851 testes, `test:pg` 10/10, Playwright 35/35         | `5sciyp2ibxej3ybjhyunjc8e`                              | 12/12 |
| F      | #13 | `52e2582` | `227f96e`: 988 testes, `test:pg` 19/19, Playwright 35/35         | `qctghoillmwctojqeb9g9w1s`                              | 12/12 |
| F2     | #15 | `901bb3c` | `eeaea75`: 993 testes, `test:pg` 23/23, Playwright 35/35         | `b0xwl7gcqhamadrqdwrlipxo` (depois de uma falha rápida) | 12/12 |
| D      | #18 | `0d9e352` | `ec3a348`: 1059 testes, `test:pg` 25/25, Playwright 42/42        | `aa0kjmizcc16e05o9oqhxark`                              | 21/21 |
| E2     | #20 | `bef9660` | `51f751e`: 1092 testes, `test:pg` 32/32, Playwright 43/43 (duas) | `xaiauydwuqfz4g47tk06w74q` (depois de uma falha rápida) | 24/24 |
| G      | #22 | `761f2a3` | `7596a0a`: 1165 testes, `test:pg` 37/37, Playwright 43/43        | `nt6zqwe3y8akzh7iquayiokm`                              | 24/24 |

Os 9 gates: install, format, lint, typecheck, test, build, secret scan, audit critical e
`db:generate` sem drift. Todos com exit 0 em cada linha da tabela; nenhum teste ignorado. O audit
segue com 22 high e 9 moderate de antes do G3, nenhum critical. PRs só de registro: #11, #14, #17,
#19 e #21 (deploys), #16 (job `image` do CI) e o PR deste relatório.

O smoke não cria conta nem faz login: rotas novas respondem 401 sem sessão (antes do deploy, 404),
tokens inválidos respondem 404 sem gravar nada, e a regressão das trilhas anteriores roda em cada
deploy. Registros em `evidence/deploy/`.

## 3. O que a própria execução encontrou

Defeitos achados durante o G3, fora dos achados da auditoria, cada um com teste permanente e RED
antes da correção:

- **Data civil um dia antes (trilha C).** `formatDate` mostrava `2026-10-10` como 09/10 no fuso do
  Brasil. Passou a tratar `YYYY-MM-DD` como data civil.
- **Convite reutilizado (trilha D).** Convite já aceito respondia 409 "já é membro" em vez do 404
  uniforme de token usado.
- **Função em código interno no convite (trilha D).** A mensagem dizia "como agent".
- **Camadas do design system (trilha D).** O drawer cobria o modal, que cobria o toast.
- **Worker sem healthcheck (trilha F).** Era o único serviço contínuo sem saúde, e a aplicação
  aparecia como `running:unknown`; passou a `running:healthy`.
- **`pg_dump` 15 na imagem (trilha F2).** O bookworm traz o cliente 15, que não lê um banco 17; a
  imagem instala o 17 do repositório oficial do PostgreSQL.
- **Limite de cadastro na suíte (integração da D).** Com as trilhas D e E juntas, o Playwright passou
  de 10 cadastros por minuto do mesmo IP e o limite respondeu 429. O limite ficou; o proxy do painel
  passou a repassar o `retry-after`, que se perdia até o navegador, e os auxiliares de cadastro
  esperam por ele.
- **Conciliação com mais de R$ 21 milhões (trilha G).** Os totais em `int4` quebravam o job com
  `value "3000000000" is out of range for type integer`.

Registrado sem causa provada:

- **Falha intermitente do Playwright da trilha C.** `g3-c-lease-lifecycle.spec.ts:208` falhou uma
  vez em seis rodadas completas depois da E2 (duas do agente e duas do orquestrador na E2, uma do
  agente e uma do orquestrador na G): a cobrança existia na API, a linha não apareceu na
  lista. A asserção passou a trazer na mensagem as falhas do backend e os erros da página.
- **Deploys que falham rápido.** Duas de nove tentativas de deploy do G3 falharam em 66 s e 110 s e passaram na
  tentativa seguinte, sem mudança de código; a homologação ficou na versão anterior nas duas vezes.
  O build das imagens é provado em todo PR pelo job `image` do CI. O log do deploy só é legível no
  painel do Coolify (o token não tem `read:sensitive`).

## 4. Pendências que continuam abertas

| Pendência                                                                                                                                                                                               | Destino                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Envio do WhatsApp com o token da própria conexão (hoje, credencial da plataforma), revalidação do token, desativar e remover a conexão pela tela, reverificação quando a Meta sinalizar perda de acesso | Fase 7                                          |
| Provider real de e-mail (hoje, caixa de saída local)                                                                                                                                                    | Fase 7, decisão do usuário                      |
| Cópia do backup fora do servidor e guarda da chave `SERVICE_HEX_64_BACKUPKEY`; sem PITR; arquivos do MinIO sem backup                                                                                   | Fase 7, usuário                                 |
| Colunas de domínio sem CHECK por falta de fonte única (filas, `split_allocations`, `screening_requests`, ledger, links de anúncio, `meta_assets`)                                                       | P2-12, depois da constante no domínio           |
| `timeline_events.entity_type` recebe `CONVERSATION` e `LISTING` fora do contrato; filtro da lista de conciliações com status que a coluna não guarda; `reconciliations.provider` como `NONE`            | Resolvido depois do G3: ADR-093, migration 0023 |
| Valores em centavos por linha sem teto no contrato da API (acima de R$ 21 milhões falha no `int4`)                                                                                                      | Correção de contrato                            |
| Falha intermitente do Playwright da trilha C (acima)                                                                                                                                                    | Investigar quando repetir                       |
| Conexões de WhatsApp antigas da homologação precisam do token da imobiliária e de nova verificação (efeito esperado da 0021)                                                                            | Usuário, na homologação                         |

## 5. Implantação na homologação

Todas as trilhas estão no ar no app `aluguei-app` do Coolify (`hvwxasfarzxnpnw4fjoerqws`), pela
ordem da tabela da seção 2, com a aplicação `running:healthy` e nenhum recurso não saudável depois
do último deploy (2026-09-22, 04:50 UTC). Os volumes: `aluguei-pgdata` (só leitura, ADR-062),
`aluguei-minio-data` e o novo `aluguei-backups`. Nenhum foi apagado. Registros:
`evidence/deploy/coolify-mcp-2026-09-2*-*.txt` e os smokes ao lado.

## 6. Próximo passo

G4 (Fase 7.1–7.3): Storage, Asaas e Clicksign `SANDBOX_VERIFIED`. Depende de credenciais de sandbox
do usuário; sem elas, nada da Fase 7 roda.
