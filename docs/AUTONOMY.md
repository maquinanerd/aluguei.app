# Protocolo de autonomia do agente

## Objetivo

Permitir que DeepSeek/OpenCode desenvolva o repositório sem interrupções para perguntas rotineiras.

## Regra de decisão

Quando surgir uma decisão:

1. É irreversível/externa com custo real? Não executar; construir suporte e manter dry-run.
2. É reversível e interna? Escolher a opção mais simples e registrar ADR/decisão.
3. Falta credencial? Mock + contract test + blocker e continuar.
4. Documentação externa mudou? Usar fonte oficial vigente e registrar versão/data no adapter.
5. Teste falhou? Corrigir; não avançar com gate vermelho.

## Loop por fase

`DISCOVER → PLAN → TEST/RED → IMPLEMENT → REVIEW → SECURITY → QA/GREEN → COMMIT → UPDATE_STATE → NEXT`

## Subagentes

Orquestrador deve usar, quando disponível:
- architect
- implementer
- reviewer
- security-auditor
- integration-engineer
- qa-engineer

O revisor nunca assume que o implementador está correto.

## Blockers externos

Formato em `docs/BLOCKERS.md`:
- ID
- provider
- o que falta
- impacto
- o que já foi implementado/testado
- como validar quando credencial existir

Blocker externo não impede avanço das demais fases salvo quando o domínio depende matematicamente do resultado real.
