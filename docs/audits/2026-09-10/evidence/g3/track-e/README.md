# Evidências — G3, trilha E1 (portal, vistoria e handoff do WhatsApp)

Escopo (plano do G3, trilha E, primeira entrega): P2-05 (extrato e lista do portal, vistoria visível
no portal e pagamento com encargos), P1-24 (evidência de vistoria imutável depois de concluída, com
auditoria) e P1-18 na parte do handoff (a conversa com a equipe só volta ao bot quando a equipe
devolve), com a interface. A prova de posse do número do WhatsApp e o índice parcial do
`portal_access` precisam de migration e ficam para a E2, depois da trilha D. Rascunhos de decisão em
`docs/audits/2026-09-10/g3/ADR_DRAFTS_TRACK_E.md`.

Logs desta máquina (Windows 11, Node 24.19, pnpm 11.15.1), sem cores ANSI. Sem efeito externo:
providers FAKE, Meta em dry-run, IA mock, nenhuma credencial real. Cada arquivo começa com o
comando, a árvore e a data (UTC) e termina com `# exit=<código>`. Um `*-red` é o teste permanente
rodando **sem** a correção e precisa falhar; o `*-green` correspondente é o mesmo teste com ela.

Base: `main` em `8409420` (trilha C mesclada), branch `g3/track-e-portal`.

## RED

| Arquivo              | O que prova                                                                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portal-red.txt`     | Portal, 4 de 4: `billedCents` 200.000 com uma das duas cobranças cancelada; `total` da lista com o UUID de uma cobrança; três vistorias listadas (entrada concluída, saída em captura e intermediária concluída); pagamento pelo portal de 100.000 numa cobrança vencida que devia 104.300                            |
| `inspection-red.txt` | Vistoria, 2 de 2: nenhum evento `inspection.media_removed` ao apagar mídia; com a vistoria concluída, `POST /rooms` responde 201                                                                                                                                                                                      |
| `whatsapp-red.txt`   | Handoff, 1 de 1: a conversa em NEEDS_HUMAN volta a ACTIVE na mensagem seguinte                                                                                                                                                                                                                                        |
| `web-unit-red.txt`   | Regras novas das telas antes dos módulos: `conversation-rules` e `inspection-rules` não existem (2 arquivos não carregam)                                                                                                                                                                                             |
| `e2e-red.txt`        | Playwright dos specs `g3-e`, 3 de 3, com `apps/` e `packages/` restaurados de `origin/main` (`c04bf7e`) e só o spec novo: sem "Devolver ao atendimento automático" na caixa de entrada, sem aviso de evidência fechada na vistoria concluída e "Total cobrado" de R$ 5.000,00 no portal, somando a cobrança cancelada |

## GREEN

| Arquivo                   | O que prova                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portal-green.txt`        | Integração 9/9: os 4 novos e os 5 do portal                                                                                                                                                                                                              |
| `portal-domain-green.txt` | Domínio 11/11: cobrança cancelada fora dos totais e visibilidade da vistoria por papel, tipo e status                                                                                                                                                    |
| `inspection-green.txt`    | Integração 8/8: os 2 novos e os 6 da vistoria                                                                                                                                                                                                            |
| `whatsapp-green.txt`      | Integração 11/11: o novo, os 7 do WhatsApp e os 3 do painel                                                                                                                                                                                              |
| `web-unit-green.txt`      | Unidade do web 5/5: ações da conversa e edição da evidência comparadas com o domínio                                                                                                                                                                     |
| `e2e-green.txt`           | Playwright dos specs `g3-e` 3/3: devolver a conversa pela caixa de entrada, vistoria concluída sem ações de evidência (com a em revisão como controle) e "Total cobrado" de R$ 2.500,00                                                                  |
| `gates-summary.txt`       | Gates sem cache no commit `b6b7a02`: install, format, lint, typecheck, test, build, secret scan, audit critical e `db:generate`, todos com exit 0; `db-drift=NO` (a E1 não muda o schema)                                                                |
| `gates-*.txt`             | Saída de cada gate. `gates-test-counts.txt`: 851 testes em 14 pacotes, nenhum ignorado                                                                                                                                                                   |
| `testpg.txt`              | `pnpm test:pg` num cluster PostgreSQL 17 descartável: 10/10 em 4 arquivos                                                                                                                                                                                |
| `e2e-full.txt`            | Playwright completo (stack e cluster descartáveis; web 3330, API 4330, PostgreSQL 5563): 35/35, nenhum ignorado — os 32 de antes e os 3 da E1                                                                                                            |
| `run1/`                   | Primeira rodada, guardada como veio: o lint sem cache reprovou um genérico de uso único num teste novo (`no-unnecessary-type-parameters`, corrigido em `b6b7a02`), e o Playwright nem subiu porque a porta 3310 estava com a stack do agente da trilha F |

## Ajustes nos testes depois do RED

Nenhuma asserção foi removida ou afrouxada.

- `g3-e-inspection.test.ts`: o primeiro RED caiu em dados do teste (categoria de observação
  inexistente, payload errado da sugestão, sugestão pendente que impede concluir e `id` sem default
  no insert direto). Corrigidos os dados, o arquivo `inspection-red.txt` guarda o RED pelo motivo
  certo.
- `g3-e-whatsapp.test.ts`: a consulta da auditoria ordenava por `created_at`, que não existe em
  `audit_events` (a coluna é `occurred_at`). O RED falhou antes dessa consulta, na asserção do
  status; a correção veio no GREEN.
- `inspections.test.ts` (teste antigo da comparação entrada × saída): registrava as observações
  depois de COMPLETED, exatamente o que o P1-24 proíbe. Passou a registrá-las em REVIEW, antes de
  concluir; as asserções da comparação (UNCHANGED e NEW) continuam as mesmas.
