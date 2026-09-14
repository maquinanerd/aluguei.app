import { z } from 'zod';
import { AiProviderError } from '../ai/errors.js';
import { fetchWithTimeout, readJsonBody, throwForHttpStatus } from '../ai/http.js';
import { extractJsonObject } from '../ai/extract.js';
import { deterministicSuggestions, deterministicTranscribe } from './mock.js';
import type { InspectionAiProvider, ObservationSuggestion, TranscribeResult } from './types.js';

export interface OpenAiInspectionAiProviderOptions {
  apiKey: string;
  /** Modelo de transcrição de áudio (default `whisper-1`, documentado na API). */
  transcribeModel?: string;
  /** Modelo de chat para sugestões visuais (default `gpt-4o-mini`, com visão). */
  suggestModel?: string;
  /** Sobrescreve a base (ex.: proxy/MITM em testes). Default: https://api.openai.com */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Limite de tokens de saída das sugestões (boundary de custo). Default: 600. */
  maxOutputTokens?: number;
  /**
   * Busca os bytes da mídia pelo storageKey. Sem essa função (storage não
   * plugado) o provider degrada para o comportamento determinístico do mock.
   */
  fetchMedia?: (input: { storageKey: string }) => Promise<Blob>;
  /** Callback de observabilidade: recebe o erro tipado antes do fallback. */
  onError?: (err: AiProviderError) => void;
}

const transcriptionResponseSchema = z.object({ text: z.string() }).loose();

const suggestionListSchema = z
  .array(
    z.object({
      category: z.enum([
        'DAMAGE',
        'CONDITION',
        'CLEANLINESS',
        'FURNITURE',
        'INSTALLATION',
        'OTHER',
      ]),
      severity: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
      description: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
    }),
  )
  .max(10);

const SUGGEST_SYSTEM_PROMPT = [
  'Você é um assistente de vistoria de imóveis (pt-BR).',
  'Analise a mídia de um cômodo e liste EVIDÊNCIAS OBSERVÁVEIS do estado do imóvel.',
  'Responda SOMENTE com um array JSON válido, sem texto extra e sem markdown:',
  '[ { "category": "DAMAGE|CONDITION|CLEANLINESS|FURNITURE|INSTALLATION|OTHER", "severity": "NONE|LOW|MEDIUM|HIGH", "description": "descrição curta", "confidence": 0.0 } ]',
  'Regras:',
  '- Descreva APENAS o que é visível (ex.: "mancha visível na parede", "piso com riscos"). NUNCA diagnostique causa invisível (ex.: "infiltração do encanamento").',
  '- Não cite nomes de pessoas nem conteúdo fora do imóvel.',
  '- Máximo 5 sugestões. Sem nada relevante, retorne [].',
  '- Não use o nome do cômodo como evidência se ela não estiver na mídia.',
].join('\n');

/** Derivado do storageKey: último segmento como nome de arquivo (seguro). */
function filenameFromStorageKey(storageKey: string, mimeType: string): string {
  const base = storageKey.split('/').pop() ?? 'media';
  const safe = base.replace(/[^\w.-]/g, '_');
  const extByMime: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  const ext = extByMime[mimeType];
  return ext && !safe.toLowerCase().endsWith(`.${ext}`) ? `${safe}.${ext}` : safe;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  return buf.toString('base64');
}

/**
 * Provider de IA de vistoria via OpenAI:
 * - `transcribeAudio` → `POST /v1/audio/transcriptions` (multipart, modelo whisper/gpt-transcribe).
 * - `suggestObservations` → Chat Completions com entrada de mídia (imagem base64
 *   em `image_url`; vídeo em `file` — suporte a vídeo depende do modelo, ver doc).
 * Timeout via AbortSignal; erros tipados (`AiProviderError`) em `onError`;
 * qualquer falha (rede, timeout, auth, JSON inválido, storage sem fetchMedia)
 * cai no fallback determinístico do mock — o job de vistoria nunca quebra.
 *
 * Documentação consultada em 2026-08-17:
 * - https://platform.openai.com/docs/api-reference/audio/createTranscription
 *   (POST /audio/transcriptions, multipart file+model, response {text}).
 * - https://platform.openai.com/docs/api-reference/chat (image_url content part;
 *   FileContentPart file.file_data base64 — suporte de vídeo depende do modelo).
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real e sem storage plugado não
 * há validação ao vivo.
 */
export class OpenAiInspectionAiProvider implements InspectionAiProvider {
  private readonly apiKey: string;
  private readonly transcribeModel: string;
  private readonly suggestModel: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly fetchMedia: ((input: { storageKey: string }) => Promise<Blob>) | undefined;
  private readonly onError: ((err: AiProviderError) => void) | undefined;

  constructor(opts: OpenAiInspectionAiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.transcribeModel = opts.transcribeModel ?? 'whisper-1';
    this.suggestModel = opts.suggestModel ?? 'gpt-4o-mini';
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxOutputTokens = opts.maxOutputTokens ?? 600;
    this.fetchMedia = opts.fetchMedia;
    this.onError = opts.onError;
  }

  async transcribeAudio(input: {
    storageKey: string;
    mimeType: string;
  }): Promise<TranscribeResult> {
    try {
      return await this.transcribeWithApi(input);
    } catch (err) {
      if (err instanceof AiProviderError) {
        this.onError?.(err);
        return deterministicTranscribe(input.storageKey);
      }
      throw err;
    }
  }

  async suggestObservations(input: {
    storageKey: string;
    kind: 'PHOTO' | 'VIDEO';
    roomName?: string;
  }): Promise<ObservationSuggestion[]> {
    try {
      return await this.suggestWithApi(input);
    } catch (err) {
      if (err instanceof AiProviderError) {
        this.onError?.(err);
        return deterministicSuggestions(input);
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Transcrição de áudio
  // -------------------------------------------------------------------------

  private async transcribeWithApi(input: {
    storageKey: string;
    mimeType: string;
  }): Promise<TranscribeResult> {
    const blob = await this.loadMedia(input.storageKey);
    const path = '/v1/audio/transcriptions';
    const form = new FormData();
    form.append('file', blob, filenameFromStorageKey(input.storageKey, input.mimeType));
    form.append('model', this.transcribeModel);
    form.append('response_format', 'json');
    const response = await fetchWithTimeout(
      this.fetchImpl,
      `${this.baseUrl}${path}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
      },
      this.timeoutMs,
      'openai',
      'POST',
      path,
    );
    if (!response.ok) {
      throwForHttpStatus(response, 'openai', 'POST', path);
    }
    const body = await readJsonBody(response, 'openai', 'POST', path);
    const parsed = transcriptionResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AiProviderError('Resposta OpenAI de transcrição fora do contrato', {
        kind: 'INVALID_RESPONSE',
        provider: 'openai',
        retryable: true,
      });
    }
    return { text: parsed.data.text, aiModel: this.transcribeModel };
  }

  // -------------------------------------------------------------------------
  // Sugestões visuais
  // -------------------------------------------------------------------------

  private async suggestWithApi(input: {
    storageKey: string;
    kind: 'PHOTO' | 'VIDEO';
    roomName?: string;
  }): Promise<ObservationSuggestion[]> {
    const blob = await this.loadMedia(input.storageKey);
    const path = '/v1/chat/completions';
    const b64 = await blobToBase64(blob);
    const mime = blob.type || (input.kind === 'PHOTO' ? 'image/jpeg' : 'video/mp4');
    const mediaPart =
      input.kind === 'PHOTO'
        ? { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
        : {
            // FileContentPart documentado na API (base64); suporte de vídeo
            // depende do modelo — fallback determinístico cobre rejeição.
            type: 'file' as const,
            file: {
              file_data: b64,
              filename: filenameFromStorageKey(input.storageKey, mime),
            },
          };
    const userText = input.roomName ? `Cômodo informado: ${input.roomName}.` : '';
    const userContentParts = userText
      ? [{ type: 'text' as const, text: userText }, mediaPart]
      : [mediaPart];
    const response = await fetchWithTimeout(
      this.fetchImpl,
      `${this.baseUrl}${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.suggestModel,
          messages: [
            { role: 'system', content: SUGGEST_SYSTEM_PROMPT },
            { role: 'user', content: userContentParts },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_completion_tokens: this.maxOutputTokens,
        }),
      },
      this.timeoutMs,
      'openai',
      'POST',
      path,
    );
    if (!response.ok) {
      throwForHttpStatus(response, 'openai', 'POST', path);
    }
    const body = await readJsonBody(response, 'openai', 'POST', path);
    const parsed = chatCompletionTextSchema.safeParse(body);
    if (!parsed.success) {
      throw new AiProviderError('Resposta OpenAI de sugestões fora do contrato', {
        kind: 'INVALID_RESPONSE',
        provider: 'openai',
        retryable: true,
      });
    }
    const content = parsed.data.choices[0]?.message.content;
    const suggestions = content ? parseSuggestionsJson(content) : null;
    if (!suggestions) {
      throw new AiProviderError('JSON de sugestões ausente ou inválido', {
        kind: 'INVALID_RESPONSE',
        provider: 'openai',
        retryable: true,
      });
    }
    return suggestions;
  }

  private async loadMedia(storageKey: string): Promise<Blob> {
    if (!this.fetchMedia) {
      throw new AiProviderError('fetchMedia não configurado — storage não plugado', {
        kind: 'MEDIA_FETCH',
        provider: 'openai',
        retryable: false,
      });
    }
    try {
      return await this.fetchMedia({ storageKey });
    } catch (err) {
      throw new AiProviderError(
        `Falha ao buscar mídia ${storageKey}: ${err instanceof Error ? err.message : String(err)}`,
        { kind: 'MEDIA_FETCH', provider: 'openai', retryable: true },
      );
    }
  }
}

const chatCompletionTextSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string().nullable() }).loose(),
          })
          .loose(),
      )
      .min(1),
  })
  .loose();

/** Converte o JSON do LLM (array) em `ObservationSuggestion[]` ou null. */
function parseSuggestionsJson(raw: string): ObservationSuggestion[] | null {
  const json = extractJsonObject(raw);
  if (json === null) {
    return null;
  }
  const parsed = suggestionListSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.map((item) => ({
    category: item.category,
    severity: item.severity,
    description: item.description,
    confidence: item.confidence ?? 0.7,
  }));
}
