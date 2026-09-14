# 02 — Auditoria do banco de dados

> Fontes: `packages/db/src/schema/*.ts`, `packages/db/drizzle/*.sql`, `drizzle/meta/*`, introspecção SQL no PostgreSQL 17 isolado (porta 55432, banco `aluguei_audit`) e relatório do agente de banco (`evidence/agent_reports/agent_A_db.md`).

## 1. Execução: migrations do zero (PROVADO)

```
initdb (cluster descartável) → CREATE DATABASE aluguei_audit
DATABASE_URL=postgresql://postgres@localhost:55432/aluguei_audit pnpm --filter @aluguei/db db:apply   # 2,76 s
(repetido)                                                                                          # idempotente, sem erro
```

| Métrica (SQL no banco recém-migrado)                  | Valor                                                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabelas `public`                                      | **72**                                                                                                                                                                           |
| Migrations aplicadas (`drizzle.__drizzle_migrations`) | **11**                                                                                                                                                                           |
| Enums (`pg_type typtype='e'`)                         | **1** (`role`: owner, admin, agent, inspector, finance, viewer)                                                                                                                  |
| Foreign keys                                          | **179** (123 `CASCADE`, 55 `SET NULL`, 1 `RESTRICT`)                                                                                                                             |
| Índices                                               | 218 (44 únicos, excluindo PKs)                                                                                                                                                   |
| CHECK constraints                                     | **0**                                                                                                                                                                            |
| RLS / policies                                        | **0**                                                                                                                                                                            |
| Colunas `timestamptz` / `timestamp` sem tz            | 148 / **0**                                                                                                                                                                      |
| Colunas de dinheiro (`*_cents`)                       | 31, todas `integer` (int4)                                                                                                                                                       |
| Colunas `double precision`                            | 6: `property_addresses.lat/lng`, `properties.total_area_sqm/built_area_sqm`, `conversation_intents.confidence`, `inspection_ai_suggestions.confidence` — **nenhuma de dinheiro** |
| Colunas `status` em `text` sem CHECK                  | 43 (85 colunas de domínio fechado ao todo, segundo o agente)                                                                                                                     |

**Drift**: `pnpm db:generate` (drizzle-kit) não gerou migration → schema TS = snapshot 0011. Porém existe **1 objeto só no SQL**: índice parcial `party_consents_active_unique ... WHERE revoked_at IS NULL`, criado à mão em `0007_parallel_ma_gnuci.sql:150-151` e ausente do TS (`crm.ts:129`) — invisível ao gate de drift do CI.
**Lacuna 0010**: o journal pula de idx 9 para 11; não há arquivo 0010 nem no histórico git; a cadeia de snapshots está íntegra (0011 → 0009). Cosmético, mas qualquer ambiente que tenha aplicado um 0010 local fica fora do controle (NÃO_DETERMINADO se existe).
**Runner** (`packages/db/scripts/apply-migrations.mjs`): migrator do drizzle, tabela de controle, uma transação para as pendentes; **sem advisory lock**; decide só por timestamp (hash não comparado); **imprime a connection string (com senha) no stdout** (`:24`).

## 2. Inventário (72 tabelas — igual à lista histórica, sem adições nem remoções)

| Arquivo           | Tabelas                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.ts`     | organizations, users, memberships, user_sessions, audit_events                                                                                                                                                                |
| `crm.ts`          | parties, party_identities, party_addresses, party_roles, party_consents, party_documents, leads, lead_property_interests, tasks, visits, proposals, timeline_events                                                           |
| `properties.ts`   | properties, property_addresses, property_features, property_financial_terms, property_media, property_owners, listings                                                                                                        |
| `channels.ts`     | listing_channel_publications, channel_sync_jobs                                                                                                                                                                               |
| `whatsapp.ts`     | whatsapp_connections, conversations, conversation_intents, messages, webhook_inbox                                                                                                                                            |
| `contracts.ts`    | contract_templates, contracts, contract_parties, signature_envelopes, signature_events, rental_applications, screening_requests, screening_results                                                                            |
| `inspections.ts`  | inspections, inspection_rooms, inspection_media, inspection_observations, inspection_transcripts, inspection_ai_suggestions, inspection_comparisons                                                                           |
| `finance.ts`      | leases, split_rules, split_allocations, charges, payments, payment_attempts, payouts, ledger_accounts, ledger_entries, party_bank_accounts, reconciliations                                                                   |
| `meta.ts`         | meta_connections, meta_assets, meta_ad_profiles, meta_campaign_links, meta_adset_links, meta_creative_links, meta_ad_links, meta_insight_snapshots, meta_sync_jobs, meta_webhook_events, meta_org_settings, meta_audit_events |
| `portal.ts`       | portal_access, portal_sessions                                                                                                                                                                                                |
| `app-metadata.ts` | app_metadata                                                                                                                                                                                                                  |

Total: 723 colunas.

## 3. Multi-tenancy

- `org_id` presente em **68** tabelas: 65 `NOT NULL` com FK `CASCADE` para `organizations`, 1 como PK (`meta_org_settings`), 2 anuláveis (`audit_events`, `meta_webhook_events` — eventos pré-org).
- Sem `org_id` (correto): `organizations`, `users`, `user_sessions`, `app_metadata`.
- **Isolamento só na aplicação**: não há RLS e as FKs referenciam apenas `id` (não `(org_id, id)`), então o banco aceita uma linha da org B apontando para uma entidade da org A. **Provado por execução** (ver 08, P0-05): o banco aceitou `leads`, `lead_property_interests`, `visits`, `proposals`, `rental_applications`, `inspections` e `tasks` da org B referenciando pessoa/imóvel/lead/usuário da org A.

## 4. Dinheiro e invariantes

- Centavos inteiros em todas as 31 colunas monetárias (**PROVADO** por introspecção). `int4` limita cada valor a R$ 21.474.836,47 — suficiente por cobrança, **insuficiente para totais agregados**: `reconciliations.local_total_cents` recebe a soma histórica de cobranças pagas da org e estoura acima desse valor (`apps/worker/src/paymentJobs.ts:243-253`).
- **Nenhuma CHECK**: nada impede `amount_cents < 0`, sinal incoerente com `entry_type` no ledger, ou soma de bps ≠ 10000 em `split_rules`.
- Ledger: execução hoje mostrou **0 transações desbalanceadas, 0 inconsistências de sinal, soma global 0** (convenção: débito positivo, crédito negativo). O equilíbrio por transação é garantido pela aplicação (`apps/api/src/ledger.ts`), não pelo banco; e a duplicação econômica é possível (P0-01).

## 5. Unicidade e idempotência

44 índices únicos. Relevantes que **existem**: `webhook_inbox (provider, provider_event_id)`, `charges (lease_id, period_start)`, `leases (contract_id)`, `ledger_entries (transaction_id, account_id)`, `split_rules (lease_id)`, `signature_envelopes (provider, provider_envelope_id)`, `property_media/inspection_media (storage_key)`, `listings (org_id, slug)`, `users (email)`, `user_sessions/portal_sessions (token_hash)`.

Que **faltam** (cada um é vetor de duplicação — ver 10):

| Falta                                                                  | Consequência                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `payments.provider_payment_id` único (coluna nunca escrita)            | não há chave para deduplicar pagamento do provider                                                     |
| `charges.provider_charge_id` único                                     | webhook resolve cobrança com `limit(1)` sem ordenação; colisão entre orgs com o FAKE foi **observada** |
| `split_allocations (payment_id, role, party_id)`                       | alocações duplicadas (PROVADO: 4 para 1 pagamento)                                                     |
| `payouts (payment_id, party_id)`                                       | repasses duplicados (PROVADO: 2 para 1 pagamento)                                                      |
| referência de negócio no ledger (`reference_type, reference_id, kind`) | o UNIQUE existente nunca atua porque `transaction_id` é `randomUUID()` a cada execução                 |
| `charges (lease_id, competência mês)`                                  | duas cobranças no mesmo mês aceitas (PROVADO: 01/07 e 15/07)                                           |
| `portal_access` "ativo"                                                | UNIQUE inclui `revoked_at` (NULL nos ativos) → não impede duplicata                                    |

## 6. Foreign keys e CASCADE

- 86 colunas FK (em 53 tabelas) não são a primeira coluna de nenhum índice → joins/deletes lentos em escala (P3).
- `CASCADE` alcança dinheiro e evidências: apagar `organizations` remove 67 tabelas (incluindo `ledger_entries`, `payments`); apagar `contracts` remove `leases → charges → payments → split_allocations`; apagar `ledger_accounts` remove `ledger_entries`; apagar `inspection_media` remove transcrições. **Latente**: não há rota DELETE para essas raízes (os 5 DELETE da API são mídia de imóvel/vistoria, característica, proprietário e membro). Mas `DELETE /inspections/:id/media/:mediaId` apaga evidência em qualquer status da vistoria (P1-24).

## 7. Tabelas órfãs e colunas nunca escritas

- **Sem nenhuma referência fora de `packages/db`**: `app_metadata`, `signature_events` (a trilha de assinatura nunca é gravada — confirmado por execução: 0 linhas após contrato assinado), `party_documents` (não há gestão de documentos de pessoas), `payment_attempts`.
- Colunas nunca escritas pelo código: `parties.status`, `parties.updated_at` (não há UPDATE de parties), `leases.end_date`, `payments.provider_payment_id`, `ledger_entries.description`, `payouts.provider_payout_id/paid_at/updated_at`, `party_bank_accounts.status/updated_at`. `properties.code` só é preenchido pelo gateway do WhatsApp.

## 8. PII em repouso

CPF/CNPJ (`party_identities.value`), dados bancários (`party_bank_accounts`), retorno bruto do bureau (`screening_results`) e endereços privados ficam em texto claro, sem rotina de retenção; só o token Meta tem campo cifrado (e no modo FAKE ele fica `NULL`). Dados bancários são devolvidos sem máscara pela API.

## 9. Backup e restore (PROVADO em banco descartável)

```
pg_dump -Fc aluguei_audit            → 279.729 bytes em 1 s
pg_restore --no-owner → aluguei_restore  → 1 s
fingerprint(contagens de 9 tabelas-chave + migrations): origem = restaurado = 511134920d16c14747bec55019524002  (RESTORE MATCH)
tabelas restauradas: 72 · soma do ledger restaurado: 0
```

O mecanismo funciona. **Não há** job de backup, retenção, criptografia de dump nem teste periódico de restore no repositório; `docs/OPERATIONS.md:35-36` tem erros no comando de restore (agente de docs).

## 10. Achados do banco

| ID    | Sev.                | Achado                                                                                    | Evidência                                |
| ----- | ------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| DB-1  | P0 (parte de P0-05) | Isolamento entre orgs só na aplicação; FKs sem `org_id`; sem RLS                          | §3; linhas cross-org criadas na execução |
| DB-2  | P0 (parte de P0-01) | Falta de UNIQUE para idempotência financeira                                              | §5; harness S1/S1c                       |
| DB-3  | P1                  | CASCADE sobre ledger/pagamentos/evidências                                                | §6                                       |
| DB-4  | P2                  | 0 CHECK; 85 colunas de domínio fechado em `text`                                          | §1                                       |
| DB-5  | P2                  | `int4` em totais de conciliação                                                           | §4                                       |
| DB-6  | P2                  | Índice parcial só no SQL (drift invisível)                                                | §1                                       |
| DB-7  | P2                  | Runner imprime connection string; sem advisory lock                                       | §1                                       |
| DB-8  | P2                  | Tabelas órfãs (`signature_events`, `party_documents`, `payment_attempts`, `app_metadata`) | §7                                       |
| DB-9  | P2                  | PII e dados bancários em claro, sem retenção                                              | §8                                       |
| DB-10 | P3                  | 86 FKs sem índice líder; 33 tabelas sem `updated_at`                                      | §6                                       |
| DB-11 | P3                  | Lacuna 0010 no journal                                                                    | §1                                       |
