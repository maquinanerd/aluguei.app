# Decisões arquiteturais

Registro append-only simplificado. O agente adiciona decisões reversíveis tomadas sem perguntar ao usuário.

| ID | Data | Decisão | Motivo | Alternativas | Reversibilidade |
|---|---|---|---|---|---|
| ADR-001 | bootstrap | Monorepo TypeScript | Compartilhar contratos e reduzir linguagens no produto independente | C# + TS, microserviços | alta |
| ADR-002 | bootstrap | Modular monolith + workers | Menos complexidade operacional inicial | microserviços | média |
| ADR-003 | bootstrap | Meta Ads como MCP interno + adapter Marketing API | Permitir operação por agente sem expor tokens | chamadas Meta direto pelo LLM | alta |
