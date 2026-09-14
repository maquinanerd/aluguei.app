# 00 — Sumário executivo · Auditoria técnica, funcional e de produto 360° · Aluguei.app

> Data: 2026-09-10 · Commit auditado: `a6683bf` (branch `main` local = worktree `claude/aluguei-technical-audit-6cea11`) · Método: código atual + migrations do zero em PostgreSQL 17 isolado + gates sem cache + API/worker/web rodando + ~3.000 requisições HTTP + navegador + Playwright + harness financeiro temporário + 8 agentes de leitura. **Nenhum efeito externo real** (tudo FAKE/dry-run).

## O que é

Um _operating system_ de locação: imóvel → anúncio → site/portais/Meta → lead → CRM/WhatsApp → visita → proposta → crédito → contrato → assinatura → vistoria → locação → cobrança → pagamento → split → repasse → conciliação/ledger, com portais de proprietário e locatário e um MCP próprio para Meta Ads.

## Estado atual em uma frase

**A API executa a jornada completa até a cobrança com providers simulados e o domínio é extenso e bem testado, mas o dinheiro não é seguro (duplicação, estorno forjado, recebimento sem registro), o isolamento entre imobiliárias vaza por referência, a interface bloqueia as principais criações e nenhuma integração real funciona.** O veredito anterior **HOMOLOGATION_READY (17/08) não se sustenta**.

## Números (medidos hoje)

| Item                                                              | Valor                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tabelas / migrations                                              | **72 / 11** (do zero em 2,8 s, idempotente, sem drift)                                                                |
| Endpoints                                                         | **154** (GET 67 · POST 69 · PATCH 11 · PUT 2 · DELETE 5) — 106 usados pelo web, 11 pelo mobile, **33 sem consumidor** |
| Rotas frontend                                                    | **44 páginas** + 7 route handlers                                                                                     |
| Schemas zod / módulos de domínio / máquinas de estado / tools MCP | 306 / 29 / 12 / 17                                                                                                    |
| Testes                                                            | **418 vitest (65 arquivos) + 3 Playwright — 421/421 verdes, 0 skip**                                                  |
| Gates                                                             | lint ✅ typecheck ✅ test ✅ build ✅ secret-scan ✅ · **format ❌ (1 arquivo) · audit critical ❌ (Next RCE)**       |
| Integrações                                                       | **0 LIVE · 0 SANDBOX** · 3 BROKEN (Asaas, Clicksign, Redis) · 4 PARTIAL · 6 NOT_IMPLEMENTED                           |

## O que funciona (PROVADO por execução)

Registro/login/sessões/RBAC; isolamento por ID direto (~40 tentativas bloqueadas); cadastro de imóvel (API e UI), endereço, termos e características; regressão owners+mídia **corrigida**; listing com máquina de estados e vitrine sem vazamento de dado privado; CRM (leads/funil/tarefas); gate LGPD no crédito; screening FAKE com revisão humana; contrato com hash; assinatura FAKE até SIGNED; locação; cobrança; ledger balanceado por transação; portais por API com escopo por pessoa; WhatsApp inbound → conversa → lead; canal FAKE → leads; Meta dry-run completo com salvaguardas (HOUSING, PAUSED, teto, PII, HTTPS); logs sem PII; 2 workers sem duplicidade; backup/restore manual.

## O que está parcial / é mock / não existe

- **Parcial**: pessoas (sem editar), visitas e propostas (sem ciclo de vida), locação (sem renovar/encerrar), repasse (nunca executa), conciliação (sem significado), mobile (**MOBILE PARCIAL**: sem fotos/áudio/offline), storage (sem bucket não há upload), observabilidade (OTEL sem spans).
- **Só mock**: IA de vistoria (grava transcrição fabricada), pagamentos/assinatura/crédito/Meta/canais funcionam apenas com fakes.
- **Não existe**: captação de lead no site, ingestão de leads da Meta no CRM, portais imobiliários reais, D4Sign/Serasa/SPC, e-mail, Sentry, troca/recuperação de senha, convite por e-mail, documentos de pessoa, backup automatizado, deploy.

## O que quebrou / está quebrado

Na UI: dashboard mostra **zero** com dados existentes; **não é possível criar anúncio, proposta, vistoria nem contrato** (select vazio por `limit=200`); detalhe de vistoria quebra; logout, cancelar/estornar cobrança, gerar/enviar contrato e aprovar template dão 400; export CSV sai `{}`; portais inalcançáveis. Na stack integrada, **nenhum pagamento liquida** (fakes em processos distintos). `REDIS_URL` derruba a API. Asaas e Clicksign não funcionariam mesmo com credenciais.

## P0 (7)

1. **P0-01** Duplo crédito e **duplo repasse** sob concorrência (provado: 1 pagamento de R$ 1.000 → R$ 2.000 em caixa e 2 repasses de R$ 900).
2. **P0-02** Estorno forjável por webhook sem token em produção, executado no provider antes de validar, repetível, sem clawback (provado com fake).
3. **P0-03** Dinheiro recebido sem registro (pagamento via portal de cobrança agendada; pagamento após cancelamento; reemissão de cobrança).
4. **P0-04** Contrato **assinado** pode ser regenerado (volta a GENERATED).
5. **P0-05** Isolamento multi-tenant quebrado por referência (org B cria registros apontando para dados da org A e lê o consentimento LGPD da A).
6. **P0-06** `next` 16.3.0 com 2 advisories **críticos** de RCE (CI bloqueado).
7. **P0-07** Aluguel digitado "3.500" gravado como **R$ 3,50**.

## P1 principais (24 no total)

`limit=200` e content-type do BFF (UI bloqueada) · logout que não revoga sessão · detalhe de vistoria quebrado · aceitar sugestão de IA quebra a vistoria · crédito aprovável sem screening · **juros de 1% ao dia** fixos · coproprietários ignorados no repasse · estorno/cancelamento só locais · Asaas/Clicksign quebrados · defaults inseguros (NODE_ENV, fakes silenciosos, Serasa-esqueleto em produção) · Redis · web exige API https · portais sem acesso na UI · handoff do WhatsApp desfeito · transcrição fabricada · scheduler cobra locações encerradas · MCP sem autenticação · CI vermelho · zip de outro produto versionado.

## Principal gargalo

**Integridade financeira + isolamento entre tenants.** Tudo o que envolve dinheiro precisa de transação, idempotência e confirmação no provider antes de qualquer sandbox; e o frontend precisa de duas correções transversais baratas (paginação e BFF) para destravar os fluxos.

## Maturidade

| Dimensão          | Nível               | Justificativa                                                                                    |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| Backend / domínio | **Médio**           | API ampla, RBAC, 418 testes verdes; P0 de dinheiro/tenant/contrato                               |
| Frontend          | **Baixo-médio**     | 44 páginas renderizam e são responsivas; criações essenciais bloqueadas, dados falsos, ações 400 |
| Mobile            | **Baixo** (PARCIAL) | fluxo de vistoria sem mídia; sessão volátil                                                      |
| Integrações       | **Baixo**           | nada verificado; 3 quebradas                                                                     |
| Produção          | **Baixo**           | sem deploy, backup automatizado, OTEL/Sentry, fail-fast; dependências críticas                   |

## Veredito

# **PARTIALLY_FUNCTIONAL**

Próximo passo: executar `14_CONTINUATION_PLAN.md` até o **Gate G1** (CI verde, dependências sem crítico, P0 financeiros e de isolamento fechados com testes permanentes).
