# Meta Ads MCP — arquitetura obrigatória

## Objetivo

Permitir que uma imobiliária conecte seus ativos Meta ao Aluguei.app e, a partir de um imóvel já cadastrado, prepare/crie/edite/acompanhe anúncios de Facebook/Instagram. O MCP é uma interface de ferramentas para o agente; a regra de negócio permanece no Aluguei.app.

## Princípio de segurança

O LLM nunca recebe `access_token`, `app_secret` ou segredo Meta. Ferramentas recebem apenas IDs locais (`connection_id`, `property_id`, `campaign_id`) e o servidor resolve credenciais no backend.

## Conexão

Fluxo de produto:

1. usuário autorizado inicia conexão Meta
2. OAuth/login permitido pela Meta
3. backend troca/valida token e descobre ativos autorizados
4. usuário escolhe Business, ad account, Page e Instagram account
5. `MetaConnection` persiste referências; segredo fica criptografado/secret store
6. sistema registra scopes, expiração e último teste

As permissões/scopes e versão da Graph API devem ser validadas contra a documentação oficial vigente durante implementação. Não congelar versões antigas no código.

## Housing

Anúncios de imóveis devem ser tratados como publicidade de moradia/housing quando exigido pela Meta. O adapter deve aplicar `special_ad_categories`/configuração equivalente vigente e rejeitar targeting incompatível com a categoria. Nunca contornar restrições de targeting.

## Fluxo imóvel → anúncio

```text
Property + Listing público
   ↓
AdProfile (copy, CTA, destination, media selection)
   ↓
Budget + schedule + allowed targeting
   ↓
Validation
   ↓
Upload/reuse media hash
   ↓
Campaign
   ↓
Ad Set
   ↓
Creative
   ↓
Ad
   ↓
CREATED_PAUSED
   ↓
Preview no Aluguei.app
   ↓
Runtime user action → ACTIVE
```

Durante desenvolvimento, manter `META_MODE=dry_run`. Em testes nunca criar campanha ACTIVE.

## Dados locais

- `meta_connections`
- `meta_assets`
- `meta_ad_profiles`
- `meta_campaign_links`
- `meta_adset_links`
- `meta_creative_links`
- `meta_ad_links`
- `meta_insight_snapshots`
- `meta_sync_jobs`
- `meta_webhook_events`
- `meta_audit_events`

## MCP tools v1

### Leitura
- `meta_connection_status`
- `meta_list_assets`
- `meta_get_property_ad_material`
- `meta_get_campaign`
- `meta_preview_campaign`
- `meta_get_insights`
- `meta_list_property_campaigns`

### Escrita controlada
- `meta_prepare_property_campaign`
- `meta_create_prepared_campaign_paused`
- `meta_publish_prepared_campaign`
- `meta_pause_campaign`
- `meta_resume_campaign`
- `meta_update_budget`
- `meta_update_schedule`
- `meta_update_creative`
- `meta_archive_campaign`
- `meta_sync_insights`

Cada tool deve ter Zod schema estrito, autorização por organização, idempotency key e audit event.

## Parâmetros do preparo

- `property_id`
- `connection_id`
- `ad_account_id` local/permitido
- objetivo suportado
- `daily_budget_cents` OU `lifetime_budget_cents`
- `start_at`
- `end_at`
- geografia permitida pela política Housing
- ids das imagens selecionadas
- Page/Instagram asset local
- URL pública do imóvel
- copy manual ou variantes geradas

## Regras

- property precisa estar `READY/PUBLISHED` e possuir landing page pública válida
- usar somente mídia do próprio imóvel e aprovada para anúncio
- nunca usar documentos/fotos privadas de vistoria
- nunca enviar nome/CPF/telefone do proprietário ou locatário à Meta
- valores de budget possuem limites configuráveis por organização
- mudanças de budget/status geram audit event
- retries de criação precisam ser idempotentes para não duplicar campanhas
- insights são snapshots derivados e podem ser reconsultados

## Métricas

Persistir, conforme disponível: impressions, reach, spend, clicks, link_clicks, CTR, CPC, CPM, frequency, leads/conversions e custo por lead. Nunca recalcular gasto financeiro como fonte de verdade fora do retorno Meta.

## MCP transport

- desenvolvimento local/OpenCode: stdio
- integração remota futura: Streamable HTTP com autenticação própria
- SDK oficial MCP TypeScript estável vigente

## OpenCode

O `opencode.json` mantém o MCP desligado no bootstrap porque `apps/meta-mcp` ainda não existe. A Fase 9 deve criá-lo, testar por stdio e então habilitar a entrada `aluguei-meta`.
