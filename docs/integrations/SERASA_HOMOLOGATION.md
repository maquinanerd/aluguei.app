# Serasa Experian — Homologação (Screening de crédito)

Status: **BLOCKED_PROVIDER_CONTRACT**

> A documentação pública confirma o produto e o modelo geral de integração, mas o
> endpoint, a autenticação detalhada e os schemas de chamada/retorno só existem no
> **layout do produto contratado**. O adapter entregue é um esqueleto que falha de
> forma tipada com instruções e **nunca** inventa endpoint nem chama a rede.

## Documentação consultada (17/08/2026)

| Fonte                           | URL                                                                         | O que confirmou                                                                |
| ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Score e Atributos via API       | https://www.serasaexperian.com.br/solucoes/score-e-atributos-api/           | Produto de score via API, faixa 0–1000, consumo isolado                        |
| Família Serasa Score            | https://www.serasaexperian.com.br/solucoes/score/                           | Modelos (Referência/Segmento/Customizado/Pro), score 0–1000                    |
| Consulta e concessão de crédito | https://www.serasaexperian.com.br/solucoes/consulta-de-credito-e-analytics/ | Formas de consumo: API, Batch e Web                                            |
| Portal Integração               | https://www.serasaexperian.com.br/portal-integracao/                        | Modelo técnico: HTTPS/POST, TLS 1.2+, autenticação IAM, sandbox, erros         |
| Developer Portal                | https://developer.serasaexperian.com.br/                                    | Portal de APIs (SPA protegida por Incapsula; catálogo exige cadastro/contrato) |
| SPC Brasil                      | https://www.spcbrasil.com.br/                                               | Produtos comerciais; sem documentação técnica pública                          |

## O que a doc pública confirmou (Serasa Score PF)

- **Produto**: "Score e Atributos via API" — score de crédito PF para consumo isolado via API (também lote/string de dados/Web).
- **Faixa do score**: **0 a 1000** (inteiro); "quanto mais próximo de 1.000, menor a chance de inadimplência". Probabilidade de inadimplência em até 6 meses.
- **Modelos**: Score Referência (2.0), Score Segmento (Varejo/Fintech/Seguradora/Atacadista), Score Customizado, Score Pro e Score de Curto Prazo (janela 3 meses).
- **Transporte**: HTTPS combinado com POST; **TLSv1.2 ou superior** obrigatório.
- **APIs REST/JSON**: existem ("Portfólio {APIs REST}") com **autenticação IAM** (detalhes só no layout do produto contratado).
- **Erro público conhecido**: `USER-NOT-AUTHORIZED` quando a credencial não possui a transação/feature contratada.
- **Sandbox/homologação**: ambiente de testes sem custo, logon de homologação com **vigência de 90 dias**, troca de senha em `http://www.serasaexperian.com.br/homologa`; massa de dados de teste fornecida ao iniciar a homologação.
- **Canais oficiais**: representante comercial ou Central de Atendimento **(11) 3003-7372**.

## Endpoint base

**Não confirmado publicamente.**

- O Portal Integração publica exemplos do modelo legado "string de dados" com endpoint de homologação
  `https://mqlinuxext-2.serasa.com.br/Homologa/consultahttps?p=...` (protocolo B49C, blocos P002/P006, terminador T999)
  para produtos Concentre/Credit Bureau/Combo Concessão (com SPC)/Crednet — **NÃO é o endpoint do Score via API REST e não deve ser usado**.
- Para o "Score e Atributos via API" (REST/JSON) a URL de homologação e produção vem do **layout do produto contratado**.
- Observação (não confirmado como contrato do produto): o Developer Portal referencia `api.serasaexperian.com.br` como base da plataforma.

## Autenticação

- **REST/JSON**: autenticação **IAM** (fluxo de token não detalhado publicamente; o manual de autenticação acompanha o layout do produto).
- **Legado string**: logon + senha (troca de senha no primeiro acesso; "nova senha" no payload quando aplicável).
- O adapter esqueleto (`packages/integrations/src/screening/serasa.ts`) valida `clientId`/`clientSecret`
  (credenciais de aplicação esperadas no contrato IAM). O fluxo exato (ex.: client credentials → token) será
  confirmado durante a homologação e implementado no adapter.

## Scopes

Não documentados publicamente. Transações/features são contratadas por produto; credencial sem a transação
retorna `USER-NOT-AUTHORIZED`. Ao contratar, solicitar a lista de transações/features do score PF.

## Consentimento LGPD

Já resolvido no domínio — não é responsabilidade do adapter: a consulta só ocorre com
`party_consents` + finalidade `CREDIT_SCREENING` registrados (gate em `apps/worker/src/screeningJobs.ts`).
O adapter nunca consulta sem esse consentimento (a decisão de consultar é do domínio).

## Rate limits

Não documentados publicamente. Confirmar no layout/contrato antes de habilitar produção (configurar timeout
e retry seletivo no adapter quando implementado).

## Sandbox

Existe e é gratuito durante a integração: logon de homologação (90 dias) + massa de testes básica.
Troca de senha inicial em `http://www.serasaexperian.com.br/homologa`. Logons de teste não acessam produção.

## Erros

| Erro                  | Significado                                            |
| --------------------- | ------------------------------------------------------ |
| `USER-NOT-AUTHORIZED` | Credencial não possui a transação contratada (público) |
| Demais códigos        | Não públicos — constam no layout do produto contratado |

## Implementado hoje (esqueleto)

- `packages/integrations/src/screening/serasa.ts` — `SerasaScreeningProvider` implementa `IScreeningProvider`:
  - valida `clientId`/`clientSecret` (DomainError `INVALID_INPUT`) e `timeoutMs` positivo;
  - `requestCreditScreening` lança DomainError `PROVIDER_ERROR` "provider não documentado/sem contrato"
    com instruções de desbloqueio (contato 3003-7372, layout, IAM, homologação) — **nunca chama a rede**;
  - `serasaScoreResponseSchema` (score int 0–1000, baseado na doc pública) + `mapSerasaScoreResponse`
    (mapeia para `IScreeningResult`; red flags de negativação a mapear a partir do layout contratado).
- `packages/integrations/src/screening/serasa.test.ts` — cobertura de configuração, erro tipado, "sem contrato",
  não-uso de rede e schema 0–1000.
- Não há wiring no registry (`getScreeningProvider` continua retornando `null` para SERASA) — o adapter será
  registrado quando o contrato estiver em mãos e a chamada real implementada.

## O que falta para IMPLEMENTED_NOT_LIVE_VERIFIED / produção

1. **Contrato comercial** do produto "Score e Atributos via API" (ou report equivalente com Score PF) +
   **layout oficial** (endpoint, campos de request/response, features, códigos de erro).
2. **Credenciais IAM** (clientId/clientSecret, ou logon/senha conforme o layout) + **logon de homologação** (90 dias).
3. **Scopes/transações** contratadas (solicitar lista de transações do score PF).
4. Implementar no adapter: auth IAM (token), POST HTTPS/TLS 1.2+, timeout/retry seletivo, parse via schema
   alinhado ao layout, mapeamento de red flags e auditoria; registrar no registry.
5. Homologar no sandbox com a massa de testes; só então classificar como **IMPLEMENTED_NOT_LIVE_VERIFIED**
   (produção exige credencial real de produção).

---

## SPC Brasil (classificação separada)

Status: **BLOCKED_PROVIDER_CONTRACT** (mesmo motivo).

- https://www.spcbrasil.com.br/ comercializa consultas de CPF/CNPJ, score com Cadastro Positivo,
  análise de crédito, cobrança e recuperação — porém apenas via **loja de consultas** e **proposta comercial**.
- Não há documentação técnica pública de API (endpoints/auth/schemas) sem contrato.
- Quando contratado: avaliar se o produto cobre o mesmo propósito de `IScreeningProvider` (score + restrições)
  e, se sim, implementar adapter próprio no mesmo diretório e registrar no registry.
