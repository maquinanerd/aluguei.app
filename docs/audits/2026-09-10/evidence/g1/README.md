# Evidências do Gate G1 (Fases 0, 1 e 2)

Logs de execução desta máquina (Windows 11, Node 24.19, pnpm 11.15.1,
PostgreSQL 17.10 local). Sem efeitos externos: providers FAKE, Meta em dry-run,
IA mock, nenhuma credencial real. Cores ANSI removidas.

## Arquivos

| Arquivo                       | O que prova                                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fase0-gates-summary.txt`     | Gates da Fase 0 sem cache: format, lint, typecheck, test, build, secret scan, audit critical, `db:generate` sem drift                                                                                                                     |
| `fase0-e2e.log`               | Playwright 3/3 com boot automático da stack (cluster PostgreSQL descartável, API, worker e web)                                                                                                                                           |
| `fase1-red-pglite.log`        | **Controle negativo** da Fase 1 (PGlite): duplo crédito, estorno forjado executado, cobrança SCHEDULED não liquidada, pagamento após cancelamento perdido, reemissão duplicada, fila sem estado terminal, webhook de produção sem segredo |
| `fase1-red-postgres.log`      | **Controle negativo** da Fase 1 em PostgreSQL real: duplo crédito entre dois workers, seis iniciações simultâneas criando seis tentativas, liquidação impossível com API e worker em processos separados                                  |
| `fase2-red.log`               | **Controle negativo** da Fase 2: 27 casos de referência entre organizações aceitos e vazamento de consentimento                                                                                                                           |
| `fase2-green.log`             | Fase 2 depois da correção: 28/28                                                                                                                                                                                                          |
| `fase2-integration-suite.log` | Suíte de integração inteira no worktree da Fase 2                                                                                                                                                                                         |
| `fase1-green-pglite.log`      | Fase 1 depois da correção (PGlite): 14/14                                                                                                                                                                                                 |
| `fase1-green-postgres.log`    | Fase 1 depois da correção (PostgreSQL real): 4/4                                                                                                                                                                                          |
| `fase2-db-red.log`            | **Controle negativo** da defesa no banco: com a migration 0013 desabilitada, o `INSERT` direto de `leads.party_id` com id de outra organização é aceito                                                                                   |
| `fase2-db-green.log`          | Defesa no banco ativa: 10 inserts diretos recusados com 23503; suíte 30/30                                                                                                                                                                |
| `final-gates-summary.txt`     | Gates da validação final sem cache no commit `247c7eb` — todos exit 0, `db-drift=NO`                                                                                                                                                      |
| `final-lint-continue.log`     | Lint com `--continue` (roda todos os pacotes mesmo com falha): 26/26                                                                                                                                                                      |
| `final-test-counts.txt`       | Contagem por pacote do `pnpm test --force`: 462 testes                                                                                                                                                                                    |
| `final-testpg.log`            | Concorrência em PostgreSQL real na validação final: 4/4                                                                                                                                                                                   |
| `final-e2e.log`               | Playwright na validação final: 3/3, com stack e cluster descartáveis                                                                                                                                                                      |

A leitura de um par RED/GREEN é o que sustenta cada P0: o arquivo `*-red-*` é a
mesma suíte rodando na árvore anterior à correção, e precisa falhar.

## Como reproduzir

```bash
pnpm install --frozen-lockfile

# Gates (sem cache)
pnpm format:check && pnpm lint --force && pnpm typecheck --force \
  && pnpm test --force && pnpm build --force \
  && pnpm security:scan && pnpm security:audit --audit-level=critical \
  && pnpm db:generate   # não pode gerar arquivo novo em packages/db

# Integridade financeira e isolamento multi-tenant (PGlite, in-process)
pnpm --filter @aluguei/tests-integration test

# Concorrência real: dois workers, iniciações simultâneas, API + worker em
# processos separados. Exige PostgreSQL (o teste cria e remove o próprio banco).
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres pnpm test:pg

# Jornada ponta a ponta no navegador (sobe PG + API + worker + web sozinha).
# Use portas livres se 3000/4000/5433 estiverem ocupadas.
WEB_PORT=3300 API_PORT=4300 PG_PORT=5533 \
  pnpm --filter @aluguei/tests-e2e test:e2e
```

O cluster descartável usado nos testes com PostgreSQL local foi criado com
`initdb` em diretório temporário e iniciado com `pg_ctl -o "-p 55433" -l <log> -w`
(sem pipe na saída: com stdio em pipe o `pg_ctl` não retorna no Windows).
