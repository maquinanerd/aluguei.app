# Orquestração mestre

## Estado por fase

`NOT_STARTED → DISCOVERED → PLANNED → IMPLEMENTING → REVIEWING → SECURITY_REVIEW → QA → GREEN → COMMITTED → DONE`

## Contexto obrigatório mínimo

Por fase, carregue somente:

- `AGENTS.md`;
- `docs/EXECUTION_STATE.md`;
- `orchestration/NN_*.md` da fase atual.

Depois carregue skills relevantes. Só leia docs extensos quando a tarefa exigir. Não faça múltiplos subagentes relerem o mesmo material sem necessidade.

## Protocolo por fase

1. Inspecione estado real, código e critérios da fase.
2. Use busca por símbolo/ranges pequenos antes de leituras amplas.
3. Chame `architect` apenas com fase, critérios, arquivos-alvo e skills necessárias.
4. Chame `implementer`; use `integration-engineer` apenas para integração real da fase.
5. Rode testes focados.
6. Chame `reviewer` com diff/arquivos relevantes, não com o histórico completo.
7. Se tocar auth, PII, arquivo, contrato, crédito, financeiro, Meta ou webhook, chame `security-auditor`.
8. Corrija P0/P1 e regressões concretas.
9. Chame `qa-engineer`; execute gates amplos aplicáveis somente no fechamento da fase.
10. Atualize `docs/EXECUTION_STATE.md`, decisões e blockers apenas quando houver mudança real.
11. Commit da fase.
12. Avance imediatamente.

## Saídas e logs

Não despeje logs extensos no contexto. Preserve somente comando, resultado, falha relevante e evidência necessária. Informação persistida no repositório deve ser referenciada por caminho, não repetida.

## Dependências externas

Credenciais ausentes não bloqueiam arquitetura/código. Estado permitido: `IMPLEMENTED_NOT_LIVE_VERIFIED`. É proibido marcar `LIVE_VERIFIED` sem chamada real comprovada.

## Definição global de pronto

- app inicializa;
- migrations reproduzíveis;
- authz entre organizações testada;
- fluxos principais E2E cobertos;
- integrações têm mocks/contratos e status honesto;
- nenhum secret no repo;
- documentação operacional mínima;
- Fase 12 sem P0/P1.
