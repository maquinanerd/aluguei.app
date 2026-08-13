# Estratégia de IA

## Regra central

IA é uma camada assistiva atrás de adapters. Nenhum domínio depende do nome de um modelo específico.

## Contratos

- `ISpeechToTextProvider`
- `IVisionInspectionProvider`
- `ITextExtractionProvider`
- `ILeadIntentProvider`
- `IAdCopyProvider`
- `IDocumentAssistProvider`

## Casos de uso

### Vistoria por áudio

Áudio → transcrição → extração estruturada por ambiente/objeto/condição → revisão humana.

### Vistoria visual

Foto segura → modelo multimodal → sugestões com `observation`, `evidence_media_id`, `confidence_band` e `provider_metadata` → revisão humana.

### CRM/WhatsApp

Conversa → intenção + filtros do cliente → campos estruturados. A busca real é determinística no banco.

### Meta Ads

A IA pode gerar variantes de headline/body/CTA a partir exclusivamente dos dados publicáveis do imóvel. Nunca altera orçamento, agenda, targeting ou status por criatividade própria.

### Documentos

Extrair dados, verificar campos faltantes e apontar inconsistências. Não inventar cláusulas legais ou decisões de crédito.

## Provider policy

- desenvolvimento: `mock` por padrão
- produção: provider configurado por ambiente
- structured output/schema obrigatório nas tarefas de extração
- timeouts e fallback
- logs sem prompt integral quando houver PII
- custo/latência/erros registrados por operação

## Dados proibidos para inferência

Não inferir raça, religião, orientação sexual, condição de saúde, composição familiar, renda aparente, classe social ou identidade de moradores a partir de imagem/voz.
