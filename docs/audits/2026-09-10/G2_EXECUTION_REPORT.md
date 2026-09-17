# G2 — Relatório de execução (Fases 3 e 4)

Auditoria de referência: `docs/audits/2026-09-10/`. Plano: `14_CONTINUATION_PLAN.md` (§4 Fases 3
e 4, §5 Gates). Execução: 2026-09-14 a 2026-09-17. Máquina: Windows 11 Pro, Node 24.19, pnpm
11.15.1, PostgreSQL 17 local para `test:pg`. Decisões: `docs/DECISIONS.md`, ADR-047 a ADR-059 e
ADR-061 (o ADR-060, admin da plataforma, veio de decisão do usuário e foi integrado no meio do
gate).

Sem efeito externo em nenhuma etapa: providers FAKE, Clicksign só com `fetch` simulado, Meta em
dry-run, IA mock. Nenhuma cobrança, Pix, boleto, estorno, mensagem, consulta de crédito,
assinatura, publicação ou e-mail real.

## 1. Critério do gate

Critério do plano: "P0-04, P0-07, P1-01..05, P1-16, P1-17 fechados; crawler sem 4xx inesperado;
Playwright dos fluxos de UI".

| Item                                      | Situação                                                                                                                                                              | Onde                         | Evidência                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------- |
| P0-04 contrato assinado regenerável       | Fechado: versões imutáveis, texto congelado no envio, gatilhos no banco                                                                                               | Trilha A, ADR-047            | `evidence/g2/track-a/p0-04-*.txt`        |
| P0-07 valor monetário corrompido          | Fechado: `MoneyInput` pt-BR em centavos, ambiguidade recusada                                                                                                         | Track B1, ADR-052            | `evidence/g2/track-b1/p0-07-*.txt`       |
| P1-01 `limit=200`                         | Fechado: `/dashboard/summary`, `ids` e `q`, `AsyncCombobox`, guarda de `limit`                                                                                        | Track B1, ADR-054 e ADR-055  | `evidence/g2/track-b1/p1-01-*.txt`       |
| P1-02 BFF com `content-type` sem corpo    | Fechado                                                                                                                                                               | Track B1, ADR-053            | `evidence/g2/track-b1/p1-02-*.txt`       |
| P1-03 logout sem encerrar sessão          | Fechado no painel (Track B1, ADR-056) e no portal (a sessão é revogada no servidor)                                                                                   | Track B1 e Track B2, ADR-061 | `track-b1/p1-03-*`, `track-b2/api-*.txt` |
| P1-04 detalhe de vistoria quebrado        | Fechado                                                                                                                                                               | Track B1                     | `evidence/g2/track-b1/p1-04-*.txt`       |
| P1-05 sugestão de IA com `ACCEPT`         | Fechado                                                                                                                                                               | Trilha A, ADR-051            | `evidence/g2/track-a/p1-05-*.txt`        |
| P1-16 portais inacessíveis pela interface | Fechado: concessão na locação (link de uso único, QR, situação, revogação) e `/portal/entrar`; entrega por e-mail ou WhatsApp é da Fase 7                             | Track B2, ADR-061            | `evidence/g2/track-b2/`                  |
| P1-17 parcial (escopo da Fase 4)          | Fechado: nova candidatura com autorização LGPD, primeira publicação em canal, arquivar imóvel no lugar do "Remover", cancelar cobrança                                | Track B2, ADR-061            | `evidence/g2/track-b2/`                  |
| Crawler sem 4xx inesperado                | Passa: painel, portais e visitante                                                                                                                                    | `g2-b2-crawler.spec.ts`      | `track-b2/e2e-full.txt`                  |
| Playwright dos fluxos de UI               | 28/28: anúncio, proposta, vistoria, contrato (gerar e enviar), cobrança, logout, CSV, "3.500", detalhe de vistoria, portal, candidatura, canal, arquivamento, jornada | `tests/e2e/src/`             | `track-b2/e2e-full.txt`                  |

Além do critério, a trilha A fechou P1-06 (decisão de crédito com análise, motivo e origem —
ADR-048), P2-08 (contrato em R$ e `signature_events` — ADR-049) e a parte interna de P1-11 (PDF
com `pdf-lib` e provider real no envelope — ADR-050); a Track B1 tirou `/dev` de produção (P3,
ADR-057) e corrigiu o foco de `Modal` e `Drawer` (ADR-059).

**G2 PASSED.**

## 2. Como foi executado

| Etapa             | Branch / PR                                   | Verificação                                                                                                               |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Trilha A          | `g2/track-a-contracts`                        | Gates sem cache no commit `53cbc93`, 504 testes; RED/GREEN por item em `evidence/g2/track-a/`                             |
| Track B1          | `g2/track-b1-web`                             | Três rodadas de gates, a última com 664 testes; Playwright 18/18; `evidence/g2/track-b1/`                                 |
| Integração A + B1 | `g2/integration`, PR #3 (mesclado 2026-09-16) | O orquestrador rodou de novo, sem cache: 9 gates, 672 testes, `test:pg` 4/4, Playwright 18/18; `evidence/g2/integration/` |
| Admin plataforma  | `feat/platform-admin`, PR #4 (mesclado)       | 713 testes, `test:pg` 7/7, Playwright 19/19, implantado na homologação; `evidence/platform-admin/`                        |
| Track B2          | `g2/track-b2` (sobre `main` `db3f95f`)        | 9 gates sem cache em `c96d6c6`, 741 testes, `test:pg` 9/9, Playwright completo 28/28; `evidence/g2/track-b2/`             |

Cada correção seguiu o ciclo: teste permanente, RED provado, correção, GREEN, regressão e gate
global. Os testes de um commit RED só mudaram quando o dado do teste estava errado, e isso está
registrado no README da evidência de cada etapa.

## 3. O que a própria execução encontrou (Track B2)

Três defeitos apareceram só durante a implementação da Track B2, cada um com RED próprio:

- **Concessão do portal duplicada.** Gerar o link de novo depois de revogar criava outra
  concessão ativa e o link anterior continuava valendo: a rota procurava a concessão sem filtrar
  as revogadas e sem ordem. Com pedidos simultâneos, o PostgreSQL real também gravava duas. O
  índice único da tabela inclui `revoked_at` e não impede isso (nulos são distintos). Correção:
  transação com trava da pessoa e só concessão não revogada; provada em PGlite e em PostgreSQL
  real (`portal-access-concurrency.pg.test.ts`).
- **Detalhe por cima dos diálogos.** Em Cobranças, o clique em "Cancelar" chegava à linha e abria
  o painel de detalhe, que cobria a confirmação; "Receber" abria o detalhe de propósito. Correção
  no `DataTable` (clique em controle da linha não aciona a linha) e estado próprio do pagamento.
- **Acentuação corrompida.** Mensagens de `properties.ts` e `places.ts` com UTF-8 decodificado
  duas vezes (P3 da auditoria), exibidas nas telas. Correção e guarda permanente sobre o código.

A lista de cobranças também ganhou as ações do domínio: agendada passou a oferecer "Cancelar", e
vencida deixou de oferecer (a API responde 409).

## 4. Pendências que continuam abertas

| Pendência                                                                                                                                             | Destino            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Resto do P1-17: proprietários e mídia do imóvel, contas bancárias, consentimentos, edição de pessoa, lead, visita e proposta, perfis e campanhas Meta | Fase 5 e seguintes |
| Entrega do link do portal por e-mail ou WhatsApp                                                                                                      | Fase 7             |
| Índice parcial `WHERE revoked_at IS NULL` em `portal_access` (hoje a garantia é a trava da rota)                                                      | P2-12 (banco)      |
| Cancelar contrato já enviado não cancela o envelope no provider (ADR-047); PDF enviado não é armazenado (ADR-050)                                     | Fase 7             |
| `leads?limit=100` e `proposals?limit=100` só enxergam os 100 mais recentes (ADR-055)                                                                  | P2-03              |
| As telas não escondem ações por permissão; o servidor responde 403                                                                                    | Fase 5 (UX)        |

## 5. Implantação na homologação (2026-09-17)

O usuário mesclou o PR #5 (`a31c88e`). O app `aluguei-app` do Coolify, que acompanha `main`, foi
implantado pelo deployment `vsl4ewzg5oapqyjarz0szbmc` (12:41–12:47 UTC). A Track B2 não trouxe
migration, então o serviço de migração não tinha o que aplicar.

| Smoke                                         | Resultado                                                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evidence/deploy/smoke-2026-09-17-antes.txt`  | Com `db3f95f` implantado: as 7 checagens já existentes passam; as 7 da Track B2 falham (`GET /channels` e `GET /portal/access` respondem 404, `/portal/entrar` não existe)                                        |
| `evidence/deploy/smoke-2026-09-17-depois.txt` | 14/14: saúde, sessão, plataforma e site público continuam; rotas novas respondem 401 sem sessão, também pelo BFF do web; `/portal/entrar` responde 200 com `no-referrer`, `noindex, nofollow` e o consumo do link |

O smoke não cria conta nem faz login: os fluxos com sessão ficam cobertos pelo Playwright
(`track-b2/e2e-full.txt`).

## 6. Próximo passo

G3 (Fases 5 e 6: regras e ciclos de vida, operação mínima).
