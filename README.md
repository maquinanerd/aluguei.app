# Aluguei.app

Produto independente para operação de locação imobiliária: imóveis, distribuição de anúncios, CRM/leads, WhatsApp, vistoria com fotos/áudio/IA, análise cadastral, contratos, assinatura, cobrança, split/repasse, portais e Meta Ads via MCP.

## OpenCode + DeepSeek V4 Flash

O bootstrap é otimizado para autonomia e baixo desperdício de contexto:

- `AGENTS.md` curto com invariantes;
- documentação detalhada carregada sob demanda;
- skills modulares em `.opencode/skills/`;
- compactação automática e pruning configurados em `opencode.json`;
- plugin de compactação mínima em `.opencode/plugins/aluguei-compaction.js`;
- guard contra leituras acidentais de `.env`, dependências e builds;
- watcher ignora diretórios ruidosos;
- orquestrador usa contexto mínimo por fase.

## Primeira execução

1. Abra a raiz do repositório no OpenCode.
2. Conecte/seleciona `DeepSeek V4 Flash`.
3. Execute `/preflight` uma vez.
4. Se retornar `Pronto para /autopilot: SIM`, execute `/autopilot`.
5. Em sessão futura, use `/resume`.

Não execute ações externas reais durante desenvolvimento. Meta Ads, cobrança, payout, assinatura e mensagens ficam em sandbox/dry-run/mock/PAUSED até ambiente apropriado.

## Fonte de verdade

- regras: `AGENTS.md`
- fronteira: `docs/SCOPE_BOUNDARY.md`
- produto: `docs/PRODUCT.md`
- arquitetura: `docs/ARCHITECTURE.md`
- domínio: `docs/DOMAIN_MODEL.md`
- contexto/tokens: `docs/TOKEN_EFFICIENCY.md`
- segurança: `docs/SECURITY.md`
- Meta/MCP: `docs/META_MCP.md`
- orquestração: `orchestration/00_MASTER.md`
- estado: `docs/EXECUTION_STATE.md`
