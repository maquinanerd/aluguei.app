# Política de eficiência de contexto

Objetivo: reduzir tokens sem reduzir qualidade, auditabilidade ou segurança.

## Contexto mínimo por fase

Carregar sempre apenas:

1. `AGENTS.md`;
2. `docs/EXECUTION_STATE.md`;
3. o arquivo `orchestration/NN_*.md` da fase atual.

Depois, carregar skills relevantes. Documentos extensos entram somente quando a skill ou a tarefa indicar necessidade concreta.

## Regras operacionais

- Pesquisar antes de ler: use `rg`/busca por símbolo e abra ranges pequenos.
- Não ecoar conteúdo que já está persistido em arquivo; cite o caminho.
- Em logs, guardar apenas resumo + erro relevante + últimas linhas úteis.
- Teste focado durante implementação; suíte completa no gate.
- Subagentes recebem somente fase, arquivos-alvo, critérios de aceite e skills necessárias.
- Não passar o histórico completo para subagentes se o repositório já contém o estado.
- Após cada milestone, persistir estado em `docs/EXECUTION_STATE.md` para permitir compactação segura.

## Compactação

O plugin `.opencode/plugins/aluguei-compaction.js` substitui o prompt de compactação por um checkpoint mínimo contendo apenas objetivo, fase, trabalho concluído, arquivos ativos, decisões não persistidas, testes, blockers, Git e próxima ação.

## Regra de ouro

Repositório é memória durável. Conversa é memória transitória.
