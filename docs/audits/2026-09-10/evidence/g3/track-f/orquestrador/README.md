# Verificação do orquestrador — trilha F sobre o main com a trilha C

O agente da trilha F rodou os gates na própria branch, baseada em `3aa922b`. O orquestrador trouxe o
`main` com a trilha C (`c04bf7e`) para a branch (merge `32f6bcb`, sem conflito textual) e refez
toda a verificação sem cache nesta máquina, em portas próprias:

| Arquivo             | Resultado                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gates-summary.txt` | 9 gates com exit 0 no commit `32f6bcb`; `db-drift=NO`                                                                                                      |
| `gates-*.txt`       | Saída de cada gate. `gates-test-counts.txt`: 974 testes em 14 pacotes, nenhum ignorado                                                                     |
| `testpg.txt`        | `pnpm test:pg` num cluster PostgreSQL 17 descartável (porta 54333): 19/19 em 7 arquivos, incluindo o runner de migrations e o ciclo da locação da trilha C |
| `e2e-full.txt`      | Playwright completo (web 3340, API 4340, PostgreSQL 5573): 32/32, incluindo os 4 specs da trilha C sobre a entrada nova do worker e o fail-fast            |
