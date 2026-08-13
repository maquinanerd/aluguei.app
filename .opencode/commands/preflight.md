---
description: Valida bootstrap, escopo, Git e segurança antes do primeiro autopilot sem implementar features
agent: orchestrator
model: deepseek/deepseek-v4-flash
---

PRE-FLIGHT mecânico. Não implemente features.

1. Leia `AGENTS.md`, `docs/SCOPE_BOUNDARY.md`, `docs/EXECUTION_STATE.md` e `orchestration/00_MASTER.md`.
2. Confirme que o Aluguei.app é independente e que o PDF legado não define requisitos.
3. Audite `.gitignore`, `.env.example` e procure segredos sem imprimir valores.
4. Confirme Git `main`, remote `origin`, working tree e arquivos de bootstrap.
5. Garanta que `planejamento-plataforma-inteligencia-imobiliaria-v2.pdf` não seja stageado/versionado.
6. Rode `git diff --check` e inspeção do stage.
7. Se ainda não houver commit inicial e o bootstrap estiver consistente, faça `chore: bootstrap autonomous Aluguei.app development` e push para `origin/main`.
8. Não comece Fase 01.

Responda somente: PRE-FLIGHT, Commit, Push, Branch, Working tree, Secrets check, Scope boundary, Legacy PDF, Primeira fase pendente, Bloqueios, Pronto para /autopilot.
