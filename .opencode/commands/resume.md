---
description: Retoma a execução autônoma a partir do estado real do Git e do checkpoint persistido, sem reler documentação desnecessária
agent: orchestrator
model: deepseek/deepseek-v4-flash
---

RESUME.

Leia `AGENTS.md` e `docs/EXECUTION_STATE.md`. Verifique Git, branch, working tree, último commit e fase real. Não confie em memória de sessão se divergir do repositório.

Leia somente o arquivo `orchestration/NN_*.md` da fase ativa e carregue skills necessárias. Continue da primeira ação verificável pendente seguindo o mesmo protocolo de `/autopilot`.
