# IA Runtime — Estratégia por caso de uso (OpenAI / Gemini)

Status: **IMPLEMENTED_NOT_LIVE_VERIFIED** — adapters implementados e testados com
fetch mockado; **sem credencial real** (nenhuma chamada fora do ambiente de
teste). Modelos/endpoints documentados abaixo; nada foi exercitado ao vivo.

- Data da pesquisa de documentação: **2026-08-17**
- Implementação: `packages/integrations/src/ai/` e `packages/integrations/src/inspection-ai/`
- Estratégia de produto: `docs/AI_STRATEGY.md` (camada assistiva; domínio desacoplado de SDKs)

## Documentação consultada (2026-08-17)

| Provider | Documento                         | URL                                                                      | Confirmado na doc                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | --------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI   | Chat Completions (referência)     | https://platform.openai.com/docs/api-reference/chat                      | `POST /chat/completions` (base `https://api.openai.com/v1`); `messages` (system/user/assistant); `model`; `response_format` `{"type":"json_object"}` (JSON mode) e `{"type":"json_schema"}` (Structured Outputs); `max_completion_tokens` (atual; `max_tokens` deprecated); `temperature`; retorno `choices[].message.content`; `FileContentPart` (`file.file_data` base64) documentado como entrada de arquivo |
| OpenAI   | Audio transcriptions (referência) | https://platform.openai.com/docs/api-reference/audio/createTranscription | `POST /v1/audio/transcriptions`; multipart `file` + `model` (ex.: `gpt-4o-transcribe`, `whisper-1`); `response_format` json → `{ "text" }`                                                                                                                                                                                                                                                                      |
| Gemini   | Discovery REST v1beta             | https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta | `POST v1beta/models/{model}:generateContent`; `GenerateContentRequest` (`contents` obrigatório, `systemInstruction`, `generationConfig`); `GenerationConfig.responseMimeType: "application/json"`, `maxOutputTokens`, `temperature`; resposta `candidates[].content.parts[].text` + `promptFeedback.blockReason`; auth por API key (header `x-goog-api-key`/query `key`)                                        |

### Suposições (não confirmadas diretamente — ai.google.dev inacessível do ambiente)

- **Auth Gemini por header `x-goog-api-key`**: método padrão documentado do REST
  do Gemini API; o discovery doc não expõe o parâmetro de auth (usa o esquema
  padrão de API key). Alternativa suportada pela API: query `?key=`.
- **Modelos default**: OpenAI `gpt-4o-mini` (chat/intenção e sugestões) e
  `whisper-1` (transcrição — presente nos exemplos oficiais atuais; a doc
  também lista `gpt-4o-transcribe`/`gpt-4o-mini-transcribe`). Gemini
  `gemini-1.5-flash` (citado na doc v1beta). Todos configuráveis por opção/env
  — catálogo atual de modelos deve ser conferido na homologação.
- **Sugestões de vídeo via `FileContentPart` (base64)**: entrada de arquivo é
  documentada na API, mas suporte de vídeo depende do modelo; em caso de
  rejeição o fallback determinístico assume (nunca quebra o job).

## Providers e arquivos

| Provider                                      | Módulo                                        | Uso                                                     |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `OpenAiAiProvider`                            | `src/ai/openai.ts`                            | Intenção WhatsApp (`extractIntent`)                     |
| `GeminiAiProvider`                            | `src/ai/gemini.ts`                            | Intenção WhatsApp (`extractIntent`)                     |
| `OpenAiInspectionAiProvider`                  | `src/inspection-ai/openai.ts`                 | Transcrição de áudio + sugestões visuais de vistoria    |
| `MockAiProvider` / `MockInspectionAiProvider` | `src/ai/mock.ts`, `src/inspection-ai/mock.ts` | Default (regras determinísticas, `extractedBy: 'RULE'`) |

Seleção: `ai/registry.ts` e `inspection-ai/registry.ts` — env
`AI_PROVIDER` (`mock`|`openai`|`gemini`), `OPENAI_API_KEY`, `GEMINI_API_KEY`.
Sem chave (ou, para vistoria, sem `fetchMedia` plugado) → **mock, nunca LLM
externo**. Override injetado (`opts.ai`) tem prioridade máxima.

## Regra central (imutável)

IA é assistiva e **nunca decide sozinha**. Ela:

- ❌ **não aprova crédito** (screening é determinístico e explicável — ADR-019);
- ❌ **não assina contratos** (envelope/signatários controlados pelo domínio);
- ❌ **não movimenta dinheiro** (pagamento só transaciona após confirmação no provider);
- ❌ **não publica anúncio pago** (Meta Ads exige intenção explícita do produto; dry-run por padrão);
- ❌ **não altera cláusula legal** (contratos são templates versionados);
- ✅ só gera texto/dados sujeitos a **revisão humana** — o domínio já impõe
  confirmação humana nas sugestões de vistoria (status `PENDING` → `CONFIRMED`).

Sugestões de vistoria descrevem **evidência observável** apenas — nunca causa
invisível (ex.: "mancha visível na parede", não "infiltração do encanamento") —
e não inferem raça, religião, orientação sexual, condição de saúde, renda
aparente, classe social ou identidade de moradores (docs/AI_STRATEGY.md).

## Estratégia por caso de uso

### 1. Intenção de conversa (WhatsApp gateway) — `AiProvider.extractIntent`

| Aspecto         | Definição                                                                                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input           | Texto bruto da mensagem (`{ text }`) + data de hoje no user message. **PII mínima** — apenas o texto do lead, sem identidade/número                                                                                                                      |
| PII             | Texto da conversa do lead (pode conter nome/bairro/valores) → tratado como PII                                                                                                                                                                           |
| Retenção        | Não persistimos o prompt integral; só o resultado estruturado (`IntentExtraction`) no domínio. Sem logs com prompt integral quando houver PII                                                                                                            |
| Schema de saída | JSON validado com zod (`intentJsonSchema` em `src/ai/extract.ts`): `intent`, `propertyCode`, `budgetMinCents`, `budgetMaxCents` (**centavos inteiros**), `moveInDate` (YYYY-MM-DD), `confidence`; `extractedBy: 'AI'`                                    |
| Revisão humana  | A extração alimenta o atendimento; campos críticos (data/valor) podem ser confirmados na conversa pelo humano. IA não agenda visita sozinha                                                                                                              |
| Fallback        | **Determinístico**: qualquer falha (rede, timeout, auth, JSON inválido/schema) → `extractIntentByRule` (`extractedBy: 'RULE'`, confidence 1). O gateway nunca quebra por falha de IA. Erro tipado (`AiProviderError`) via `onError` para observabilidade |
| Custo           | `max_completion_tokens`/`maxOutputTokens` = **300** (boundary). Modelo econômico default (`gpt-4o-mini` / `gemini-1.5-flash`); `temperature: 0`                                                                                                          |
| Timeout         | `timeoutMs` default **10s**, AbortSignal; TIMEOUT → fallback                                                                                                                                                                                             |
| Endpoint        | OpenAI `POST {base}/v1/chat/completions` (`response_format: json_object`); Gemini `POST {base}/v1beta/models/{model}:generateContent` (`responseMimeType: application/json`)                                                                             |

### 2. Transcrição de áudio de vistoria — `InspectionAiProvider.transcribeAudio`

| Aspecto         | Definição                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input           | `{ storageKey, mimeType }` — **referência de mídia**, nunca bytes no domínio; bytes buscados via `fetchMedia(storageKey)` (storage plugado pelo chamador)                       |
| PII             | Áudio pode conter voz do vistoriador (dado pessoal). Enviado ao provider **somente o arquivo**, sem identidade/contexto além disso                                              |
| Retenção        | Apenas o texto transcrito é persistido (`inspection_transcripts`), nunca o áudio raw fora do storage de vistoria (privacy guard — ADR-015)                                      |
| Schema de saída | `{ text, aiModel }` (transcrição da API `{ text }` validada com zod)                                                                                                            |
| Revisão humana  | Transcrição entra no relatório de vistoria sob revisão do responsável (machine state `PROCESSING → REVIEW`)                                                                     |
| Fallback        | Sem `fetchMedia` configurado, falha de storage, rede, timeout, auth ou JSON inválido → transcrição determinística do mock (hash da key), job nunca falha por IA                 |
| Custo           | Áudio transcrito por segundo de áudio (whisper) — sem boundary de tokens aplicável; limite via tamanho/duração do arquivo em storage. Modelo default `whisper-1` (configurável) |
| Timeout         | `timeoutMs` default **30s** (áudio demora mais que chat)                                                                                                                        |
| Endpoint        | OpenAI `POST {base}/v1/audio/transcriptions` (multipart `file` + `model` + `response_format: json`)                                                                             |

### 3. Sugestões de observação visual — `InspectionAiProvider.suggestObservations`

| Aspecto         | Definição                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input           | `{ storageKey, kind: PHOTO\|VIDEO, roomName? }` — referência de mídia; imagem base64 (`data:image/...;base64`) para PHOTO; `FileContentPart` para VIDEO                                                   |
| PII             | Foto/vídeo do imóvel pode conter pertences — enviado somente o arquivo + nome do cômodo; sem identidade de pessoas                                                                                        |
| Retenção        | Sugestões persistidas em `inspection_ai_suggestions` com `status PENDING`, `confidence` e evidência (`storageKey`). Nada além do resultado estruturado                                                    |
| Schema de saída | Array JSON validado com zod: `category` (DAMAGE/CONDITION/CLEANLINESS/FURNITURE/INSTALLATION/OTHER), `severity` (NONE/LOW/MEDIUM/HIGH), `description` (evidência observável), `confidence`; máx. 10 itens |
| Revisão humana  | **Obrigatória**: sugestões entram `PENDING` e só viram observação após confirmação humana (ADR do fluxo de vistoria)                                                                                      |
| Fallback        | Qualquer falha → sugestões determinísticas do mock por `roomName` (sem diagnóstico de causa)                                                                                                              |
| Custo           | `maxOutputTokens` = **600** (boundary). Modelo default `gpt-4o-mini` (visão); temperatura 0. Para vídeos longos, extrair frames antes de enviar (produção)                                                |
| Timeout         | `timeoutMs` default **30s**                                                                                                                                                                               |
| Endpoint        | OpenAI `POST {base}/v1/chat/completions` (multimodal; `response_format: json_object`)                                                                                                                     |

### 4. Ad copy (Meta Ads) — **futuro, ainda sem adapter**

| Aspecto         | Definição                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Input           | Somente dados publicáveis do imóvel (endereço público, características, valor) — **nunca PII de lead/proprietário** |
| PII             | Nenhuma além dos dados do anúncio; nenhuma PII de pessoas                                                           |
| Retenção        | Rascunhos com `status DRAFT`; aprovação humana antes de qualquer publicação                                         |
| Schema de saída | JSON com headline/body/CTA (zod) — a definir no adapter                                                             |
| Revisão humana  | **Obrigatória**: IA gera variantes, humano escolhe e ativa (anúncio pago exige intenção explícita do produto)       |
| Fallback        | Modelo/template de copy padrão ou recusa sem IA                                                                     |
| Custo           | Boundary de tokens por variante (a definir); dry-run por padrão                                                     |
| Timeout         | Mesma política (AbortSignal + fallback)                                                                             |
| Regra Meta      | Housing/Special Ad Category — sem atributos protegidos e sem inferência de perfil                                   |

## Erros tipados e observabilidade

- `AiProviderError` (`src/ai/errors.ts`): `kind` (`TIMEOUT | NETWORK | AUTH | RATE_LIMIT | HTTP | INVALID_JSON | INVALID_RESPONSE | MEDIA_FETCH`), `provider`, `statusCode`, `retryable`.
- A mensagem **nunca contém a chave de API nem o corpo integral da resposta**
  (pode ecoar dados sensíveis). Erros 401/403 → `AUTH`; 429/5xx → retryable.
- O erro é entregue ao chamador via `onError` (observabilidade/logs/metrics) e o
  fluxo continua com o fallback determinístico — **IA nunca bloqueia atendimento
  nem job de vistoria**.

## Credenciais necessárias (homologação)

| Variável              | Provider | Observação                                                                                                       |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`      | OpenAI   | Necessária para `AI_PROVIDER=openai` (intenção, transcrição e sugestões)                                         |
| `GEMINI_API_KEY`      | Gemini   | Necessária para `AI_PROVIDER=gemini` (intenção)                                                                  |
| `AI_PROVIDER`         | seleção  | `mock` (default) \| `openai` \| `gemini`                                                                         |
| Storage (`STORAGE_*`) | vistoria | `fetchMedia` precisa ser plugado pelo worker/API para transcrição/sugestão reais (sem ele → mock determinístico) |

## Classificação

- **IMPLEMENTED_NOT_LIVE_VERIFIED** — implementado e testado com fetch mockado
  (154 testes no pacote `@aluguei/integrations`, incluindo sucesso, JSON inválido,
  timeout, auth, rede, storage e registries); nenhuma chamada real feita;
  nenhuma credencial em código, prompt, log, fixture ou commit.
