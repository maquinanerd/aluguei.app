# Evidências — G3, trilha D (cadastros e identidade)

Escopo (plano do G3, trilha D): P2-01 (pessoas: dígito verificador, detalhe, edição, arquivamento e
documentos), P2-02 (ciclo de vida da visita e da proposta, com expiração no worker), P2-03 (detalhe
e edição do lead com responsável) e P2-04 (troca e recuperação de senha e convite de membro por
e-mail), com a interface do painel (parte do P1-17). Rascunhos de decisão em
`docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_D.md`.

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1), sem cores ANSI. Sem efeito externo:
providers FAKE, Meta em dry-run, IA mock, nenhuma credencial real e **nenhum e-mail enviado** — a
recuperação de senha e o convite gravam a mensagem na caixa de saída local (`email_outbox`). Cada
arquivo começa com o comando, a árvore e a data (UTC) e termina com `# exit=<código>` (o código do
comando, não do `echo`). Um `*-red` é o teste permanente rodando **sem** a correção e precisa
falhar; o `*-green` correspondente é o mesmo teste com ela.

Base: `origin/main` em `8409420` (trilha C mergeada). O domínio e a migration 0020 vieram primeiro
(`d6178fd` RED → `050bc3d`, `57eaede`). O teste de integração das rotas foi escrito e rodado contra
`57eaede`, sem as rotas, e só então a implementação da API foi reaplicada (`5ea6eeb` teste →
`8805b9d` implementação). Em `57eaede` a rota antiga da proposta ainda gravava a validade como
instante numa coluna que já era data civil: o 500 do `api-red.txt` vem daí, e `8805b9d` corrige.

## RED

| Arquivo                         | O que prova                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain-red.txt`                | Domínio antes: 4 arquivos de teste não carregam (`documents.ts`, `visit.ts`, `proposal.ts` e `recovery.ts` não existem); 171 testes antigos passam                                                                                                                                                                             |
| `api-red.txt`                   | Integração da trilha D, 17 de 17 falham: `12345678900` aceito como CPF (201), sem `GET/PATCH /parties/:id` nem documentos, sem transições de visita e proposta (proposta com validade em data civil responde 500), worker sem expiração, sem `GET/PATCH /leads/:id`, sem troca e recuperação de senha e sem convite por e-mail |
| `api-invite-reuse-red.txt`      | Defeito achado no primeiro GREEN: convite já aceito não contava como token usado — o reuso respondia 409 "já é membro" em vez do 404 uniforme (16 de 17)                                                                                                                                                                       |
| `tokens-concurrency-pg-red.txt` | PostgreSQL real, com a redefinição de senha e o aceite do convite **sem** `FOR UPDATE` (alteração temporária, desfeita em seguida): o segundo uso do mesmo link responde 200, e o segundo aceite do mesmo convite responde 201 criando outra conta                                                                             |
| `api-team-red.txt`              | `GET /me/members` não existe (404): o corretor edita o lead e não tem `member:read` para escolher o responsável                                                                                                                                                                                                                |
| `api-invite-role-red.txt`       | A mensagem do convite dizia "como agent" (código interno) em vez da função em português                                                                                                                                                                                                                                        |
| `web-unit-red.txt`              | Regras novas das telas antes dos módulos: `party-rules`, `crm-lifecycle` e `account-rules` não existem (3 arquivos não carregam)                                                                                                                                                                                               |
| `ui-z-order-red.txt`            | Camadas do design system: `[100, 110, 140, 130, 120]` — o drawer (140) cobria o modal (130), que cobria o toast (120)                                                                                                                                                                                                          |
| `e2e-red.txt`                   | Playwright da trilha D sem a interface nova, 7 de 7: CPF inválido sem aviso na tela, visita sem "Confirmar", proposta com a validade mandada como instante (a API recusa e não aparece "Proposta criada"), lead sem "Editar lead", convite só por ID de usuário, sem "Trocar senha" e sem "Esqueci minha senha"                |

## GREEN

| Arquivo                           | O que prova                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-green.txt`                | Domínio 203/203 em 25 arquivos: CPF e CNPJ pelo módulo 11 (repetidos recusados), validação por tipo de identidade, ciclo da visita e da proposta, expiração por data civil, token de uso único e senha nova                                                                                                                                   |
| `api-green.txt`                   | Integração da trilha D 17/17 com as rotas, a caixa de saída e o job de expiração                                                                                                                                                                                                                                                              |
| `api-regression.txt`              | Integração completa 239/239 em 34 arquivos com a API da trilha D                                                                                                                                                                                                                                                                              |
| `tokens-concurrency-pg-green.txt` | PostgreSQL real 2/2: com a trava, o segundo uso espera o primeiro, vê o token usado e recebe 404; nenhuma senha trocada duas vezes e nenhuma segunda conta                                                                                                                                                                                    |
| `api-team-green.txt`              | Trilha D 18/18 com `GET /me/members` (nome e função, sem e-mail)                                                                                                                                                                                                                                                                              |
| `api-invite-role-green.txt`       | Trilha D 18/18 com a função em português na mensagem do convite                                                                                                                                                                                                                                                                               |
| `web-unit-green.txt`              | Unidade do web 143/143: dígito verificador igual ao domínio em milhares de números gerados, ações da visita e da proposta iguais às máquinas do domínio, validade civil, senha nova e convite                                                                                                                                                 |
| `ui-z-order-green.txt`            | Pacote `ui` 91/91 com drawer 130 < modal 140 < toast 150                                                                                                                                                                                                                                                                                      |
| `e2e-green-run1.txt`              | Playwright da trilha D 7/7 na primeira execução: CPF recusado na tela, detalhe, edição, documento (erro "Storage não configurado" mostrado) e arquivamento da pessoa; visita confirmada, reagendada e cancelada; proposta com validade civil, editada, enviada e recusada; lead com responsável; convite aceito; troca e recuperação de senha |
| `gates-summary.txt`               | Gates sem cache no commit `1db63fa`: install, format, lint, typecheck, test, build, secret scan, audit critical e `db:generate`, todos com exit 0; `db-drift=NO` (a migration 0020 já está no repositório)                                                                                                                                    |
| `gates-*.txt`                     | Saída de cada gate. `gates-test-counts.txt`: 902 testes em 14 pacotes, nenhum ignorado. O audit tem 22 high e 9 moderate de antes da trilha, nenhum critical                                                                                                                                                                                  |
| `testpg.txt`                      | `pnpm test:pg` no commit `1db63fa`, cluster PostgreSQL 17 descartável na porta 54334: 12/12 em 5 arquivos (os 4 de antes e o de token de uso único)                                                                                                                                                                                           |
| `e2e-full.txt`                    | Playwright completo no commit `1db63fa`: 39/39 (stack e cluster descartáveis; web 3320, API 4320, PostgreSQL 5553)                                                                                                                                                                                                                            |

## Ajustes nos testes depois do RED

Nenhuma asserção foi removida ou afrouxada.

- Três testes antigos cadastravam CPF sem dígito verificador válido (`11122233344` em
  `cross-org.test.ts`, `123.456.789-01` em `dedupe.test.ts` e `99988877766` em
  `properties.test.ts`) e passaram a usar CPFs válidos. Só o dado mudou.
- A semente de `dashboard-summary.test.ts` gravava direto no banco visita cancelada sem motivo e
  proposta enviada sem validade e recusada sem motivo. Desde a 0020 o banco recusa esses estados; a
  semente ganhou motivo e validade, e as contagens do dashboard continuam as mesmas.
- No spec do Playwright, a função auxiliar que punha a sessão (`useSession` dentro de uma função
  async nomeada) foi desfeita por causa do `react-hooks/rules-of-hooks`; a sessão passa a ser posta
  em cada teste, como nos outros specs. Nenhuma asserção mudou.
- A asserção nova da função em português no convite (`api-invite-role-*`) foi acrescentada ao teste
  de integração, com RED próprio.
