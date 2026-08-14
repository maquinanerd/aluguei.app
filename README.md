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

## Rodar localmente (dev)

Requisitos: PostgreSQL (Docker `docker compose up -d` ou instalação local) e Redis (opcional; sem ele os rate limits usam memória).

```bash
# 1. Postgres + migrations (aplica as 11 migrations versionadas do zero)
pnpm --filter @aluguei/db db:apply        # usa DATABASE_URL (default postgresql://postgres:postgres@localhost:5432/aluguei)

# 2. API — http://localhost:4000 (health: /health, readiness: /health/ready)
DATABASE_URL=... pnpm --filter @aluguei/api dev

# 3. Web — http://localhost:3000 (registro/login → dashboard; /proprietario e /inquilino para os portais)
API_BASE_URL=http://localhost:4000 APP_BASE_URL=http://localhost:3000 pnpm --filter @aluguei/web dev

# 4. Worker (opcional; processa webhooks/jobs)
DATABASE_URL=... pnpm --filter @aluguei/worker dev
```

Links locais: **web http://localhost:3000** · **api http://localhost:4000** · health `http://localhost:4000/health`.

Sem Docker e com Postgres local exigindo senha: crie um cluster dedicado do projeto com o binário do PostgreSQL (ex.: `initdb -D <dir> -U postgres --auth=trust`, inicie em outra porta com `pg_ctl -o "-p 5433" start`) e aponte `DATABASE_URL=postgresql://postgres@localhost:5433/aluguei` para o `db:apply`.

Em dev, toda integração externa roda em dry-run/mock (fake determinístico); nenhuma ação real (dinheiro, assinatura, anúncio pago, mensagem) é executada sem ambiente homologado — ver `docs/INTEGRATIONS.md` e `docs/BLOCKERS.md`.
