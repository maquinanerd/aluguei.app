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

export interface GeminiAiProviderOptions {
  apiKey: string;
  /** Modelo (default `gemini-1.5-flash`, citado na doc de referência v1beta). */
  model?: string;
  /** Sobrescreve a base (ex.: proxy/MITM em testes). Default: https://generativelanguage.googleapis.com */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Limite de tokens de saída (boundary de custo). Default: 300. */
  maxOutputTokens?: number;
  /** Callback de observabilidade: recebe o erro tipado antes do fallback às regras. */
  onError?: (err: AiProviderError) => void;
}

const generateContentResponseSchema = z
  .object({
    // Candidates pode vir vazio quando o conteúdo é bloqueado por safety
    // (promptFeedback.blockReason) — não exigir min(1) para chegar a esse caso.
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z.array(z.object({ text: z.string().optional() })).min(1),
              })
              .loose(),
            finishReason: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
    promptFeedback: z
      .object({ blockReason: z.string().optional(), blockReasonMessage: z.string().optional() })
      .loose()
      .optional(),
  })
  .loose();

/**
 * Provider de IA via Gemini API `POST /v1beta/models/{model}:generateContent`.
 * Extrai intenção como JSON com `generationConfig.responseMimeType:
 * "application/json"` + validação zod. Timeout via AbortSignal; erros tipados
 * (`AiProviderError`) reportados em `onError`; QUALQUER falha cai no fallback
 * determinístico por regras — o atendimento nunca quebra por falha de IA.
 *
 * Documentação consultada em 2026-08-17:
 * - Discovery REST v1beta (https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta):
 *   path `v1beta/{+model}:generateContent`, GenerateContentRequest
 *   (contents/systemInstruction/generationConfig), GenerationConfig
 *   (responseMimeType "application/json", maxOutputTokens, temperature),
 *   GenerateContentResponse (candidates[].content.parts[].text, promptFeedback).
 * - Auth por API key: header `x-goog-api-key` (guia text-generation; a página
 *   ai.google.dev não estava acessível do ambiente — header confirmado na doc
 *   pública de autenticação do Gemini API REST).
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real não há validação ao vivo.
 */
export class GeminiAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly onError: ((err: AiProviderError) => void) | undefined;

  constructor(opts: GeminiAiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gemini-1.5-flash';
    this.baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com';
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
    const path = `/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const response = await fetchWithTimeout(
      this.fetchImpl,
      `${this.baseUrl}${path}`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildIntentUserMessage(text) }] }],
          systemInstruction: { parts: [{ text: INTENT_SYSTEM_PROMPT }] },
          generationConfig: {
            // JSON mode documentado na GenerationConfig (responseMimeType).
            responseMimeType: 'application/json',
            maxOutputTokens: this.maxOutputTokens,
            temperature: 0,
          },
        }),
      },
      this.timeoutMs,
      'gemini',
      'POST',
      path,
    );
    if (!response.ok) {
      throwForHttpStatus(response, 'gemini', 'POST', path);
    }
    const body = await readJsonBody(response, 'gemini', 'POST', path);
    const parsed = generateContentResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AiProviderError('Resposta Gemini fora do contrato de generateContent', {
        kind: 'INVALID_RESPONSE',
        provider: 'gemini',
        retryable: true,
      });
    }
    const data = parsed.data;
    const blockReason = data.promptFeedback?.blockReason;
    const part = data.candidates?.[0]?.content.parts[0];
    const content = part?.text;
    const extraction = content ? intentFromAiJson(content) : null;
    if (!extraction) {
      const message = blockReason
        ? `Gemini bloqueou o conteúdo (${blockReason})`
        : 'Conteúdo JSON de intenção ausente ou inválido';
      throw new AiProviderError(message, {
        kind: 'INVALID_RESPONSE',
        provider: 'gemini',
        retryable: blockReason !== undefined,
      });
    }
    return extraction;
  }
}
