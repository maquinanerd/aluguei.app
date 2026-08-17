import { z } from 'zod';
import { AiProviderError } from './errors.js';
import { fetchWithTimeout, readJsonBody, throwForHttpStatus } from './http.js';
import {
  buildIntentUserMessage,
  fallbackIntentByRule,
  INTENT_SYSTEM_PROMPT,
  intentFromAiJson,
} from './extract.js';
import type { AiProvider, IntentExtraction } from './types.js';

export interface OpenAiAiProviderOptions {
  apiKey: string;
  /** Modelo de chat (default `gpt-4o-mini`, econômico e com JSON mode/visão). */
  model?: string;
  /** Sobrescreve a base (ex.: proxy/MITM em testes). Default: https://api.openai.com */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Limite de tokens de saída (boundary de custo). Default: 300. */
  maxOutputTokens?: number;
  /** Callback de observabilidade: recebe o erro tipado antes do fallback às regras. */
  onError?: (err: AiProviderError) => void;
}

const chatCompletionResponseSchema = z
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

/**
 * Provider de IA via OpenAI Chat Completions (`POST /v1/chat/completions`).
 * Extrai intenção como JSON com `response_format: json_object` + validação zod.
 * Timeout via AbortSignal; erros tipados (`AiProviderError`) reportados em
 * `onError`; QUALQUER falha cai no fallback determinístico por regras
 * (`extractedBy: 'RULE'`) — o atendimento WhatsApp nunca quebra por falha de IA.
 *
 * Documentação consultada em 2026-08-17:
 * https://platform.openai.com/docs/api-reference/chat (POST /chat/completions;
 * response_format {type: json_object}; max_completion_tokens; temperature).
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real não há validação ao vivo.
 */
export class OpenAiAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly onError: ((err: AiProviderError) => void) | undefined;

  constructor(opts: OpenAiAiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gpt-4o-mini';
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxOutputTokens = opts.maxOutputTokens ?? 300;
    this.onError = opts.onError;
  }

  async extractIntent(input: { text: string }): Promise<IntentExtraction> {
    try {
      return await this.extractIntentWithApi(input.text);
    } catch (err) {
      if (err instanceof AiProviderError) {
        this.onError?.(err);
        return fallbackIntentByRule(input.text);
      }
      throw err;
    }
  }

  private async extractIntentWithApi(text: string): Promise<IntentExtraction> {
    const path = '/v1/chat/completions';
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
          model: this.model,
          messages: [
            { role: 'system', content: INTENT_SYSTEM_PROMPT },
            { role: 'user', content: buildIntentUserMessage(text) },
          ],
          // JSON mode documentado (a instrução JSON está no system prompt).
          response_format: { type: 'json_object' },
          temperature: 0,
          // Campo atual (max_tokens está deprecated na doc).
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
    const parsed = chatCompletionResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AiProviderError('Resposta OpenAI fora do contrato de chat completion', {
        kind: 'INVALID_RESPONSE',
        provider: 'openai',
        retryable: true,
      });
    }
    const content = parsed.data.choices[0]?.message.content;
    const extraction = content ? intentFromAiJson(content) : null;
    if (!extraction) {
      throw new AiProviderError('Conteúdo JSON de intenção ausente ou inválido', {
        kind: 'INVALID_RESPONSE',
        provider: 'openai',
        retryable: true,
      });
    }
    return extraction;
  }
}
