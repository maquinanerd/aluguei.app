# AGENTS.md — Aluguei.app

## Fonte de verdade

O Aluguei.app é um produto independente. Requisitos válidos vêm somente deste repositório: `AGENTS.md`, `docs/`, `orchestration/`, contratos, testes e código. Leia `docs/SCOPE_BOUNDARY.md` antes de qualquer decisão de escopo.

## Autonomia

- Não pergunte ao usuário sobre decisões técnicas reversíveis. Decida, implemente e registre apenas decisões relevantes em `docs/DECISIONS.md`.
- Falta de credencial/homologação não bloqueia desenvolvimento: implemente adapter, mock, fixture e testes; registre `IMPLEMENTED_NOT_LIVE_VERIFIED` em `docs/BLOCKERS.md`.
- Nunca declare integração real como validada sem evidência real.
- Após um gate verde, atualize `docs/EXECUTION_STATE.md`, faça commit e avance automaticamente.

## Engenharia

- TypeScript strict; monorepo pnpm; versões estáveis e suportadas.
- Domínio desacoplado de SDKs de terceiros por interfaces/adapters.
- Dinheiro em centavos inteiros; datas persistidas em UTC; IDs internos independentes de providers.
- Integrações externas: schema, idempotência, timeout, retry seletivo, validação de webhook e auditoria.
- Nenhum segredo em código, prompt, log, fixture, commit ou frontend.

## Autoridade e segurança

- IA pode sugerir, extrair e classificar; não movimenta dinheiro, não assina contratos, não aprova crédito sozinha e não ativa anúncios pagos sem uma intenção explícita do produto.
- Desenvolvimento usa sandbox, dry-run, mock ou recursos PAUSED quando houver efeito externo real.
- Meta Ads para imóveis deve respeitar as regras vigentes de Housing/Special Ad Category.
- Operações sensíveis — credenciais, conta bancária, split, payout e publicação paga — exigem controles explícitos no produto.
- Não envie PII desnecessária a IA, analytics ou Meta.

## Qualidade

Antes de concluir uma fase: format, lint, typecheck, testes focados, testes de integração relevantes, build, review e security review quando aplicável. Rode suíte ampla somente no gate de fase ou quando uma mudança transversal justificar.

## Git

Commits pequenos e coerentes. Não use reset destrutivo, force-push ou limpeza de trabalho desconhecido. Atualize `docs/EXECUTION_STATE.md` ao final de cada fase.

## Economia de contexto — obrigatório

1. Contexto base de cada fase: `AGENTS.md` + `docs/EXECUTION_STATE.md` + `orchestration/NN_*.md`.
2. Não releia todos os docs. Carregue skills sob demanda e leia apenas os arquivos/trechos exigidos pela tarefa atual.
3. Prefira `rg`, busca por símbolo e ranges pequenos antes de abrir arquivos grandes.
4. Não cole logs completos no contexto. Em falhas, capture somente comando, erro relevante e últimas linhas úteis.
5. Não releia arquivos inalterados na mesma fase sem motivo concreto.
6. Não abra `node_modules`, builds, coverage, `.git`, caches ou arquivos gerados para entender código-fonte.
7. Referencie caminhos e decisões persistidas em vez de reexplicar conteúdo já salvo no repositório.
8. Use subagentes apenas quando houver trabalho independente real; não faça vários agentes relerem os mesmos documentos.

## Conclusão

"Pronto" = implementado, testado e verificável. Dependência externa sem credencial = `IMPLEMENTED_NOT_LIVE_VERIFIED`, nunca sucesso inventado.
