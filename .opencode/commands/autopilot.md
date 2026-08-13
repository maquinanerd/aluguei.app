---
description: Executa autonomamente todas as fases do Aluguei.app usando contexto mínimo até conclusão ou bloqueio técnico incontornável
agent: orchestrator
model: deepseek/deepseek-v4-flash
---

AUTOPILOT.

Leia apenas `AGENTS.md`, `docs/EXECUTION_STATE.md` e `orchestration/00_MASTER.md`; identifique a primeira fase incompleta. Para a fase atual, leia seu `orchestration/NN_*.md` e carregue somente as skills/documentos estritamente necessários.

Execute descoberta focada, arquitetura, implementação, review, security review quando aplicável, QA, correções, gates, estado e commit. Não peça confirmação entre fases.

Economia de contexto é requisito: pesquise antes de ler arquivos grandes, use ranges pequenos, não repita docs persistidos e não preserve logs resolvidos.

Credenciais ausentes não bloqueiam implementação; registre `IMPLEMENTED_NOT_LIVE_VERIFIED`.

Pare somente se o ambiente não puder editar/executar o repositório ou quando as fases 1–12 e a auditoria final estiverem verdes.

Nunca execute operações reais com dinheiro, assinatura, mensagens ou Meta Ads durante desenvolvimento.
