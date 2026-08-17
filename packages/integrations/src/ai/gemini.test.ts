import { describe, expect, it, vi } from 'vitest';
import type { AiProviderError } from './errors.js';
import { GeminiAiProvider } from './gemini.js';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function generateContent(text: string): unknown {
  return {
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  };
}

function makeProvider(fetchImpl: typeof fetch, errors: AiProviderError[] = []): GeminiAiProvider {
  return new GeminiAiProvider({
    apiKey: 'test-key',
    fetchImpl,
    onError: (err) => errors.push(err),
  });
}

describe('GeminiAiProvider.extractIntent', () => {
  it('extrai intenção via generateContent (JSON mime) com sucesso', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson(
        generateContent(
          JSON.stringify({
            intent: 'PRICE_QUERY',
            budgetMaxCents: 250000,
            moveInDate: '2026-08-21',
            confidence: 0.9,
          }),
        ),
      ),
    );
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'qual o preço? até 2.500' });

    expect(result).toMatchObject({
      intent: 'PRICE_QUERY',
      budgetMaxCents: 250000,
      moveInDate: '2026-08-21',
      confidence: 0.9,
      extractedBy: 'AI',
    });
    expect(errors).toHaveLength(0);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    );
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const body = JSON.parse(init.body as string) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      systemInstruction: { parts: Array<{ text: string }> };
      generationConfig: { responseMimeType: string; maxOutputTokens: number; temperature: number };
    };
    expect(body.contents[0]?.role).toBe('user');
    expect(body.systemInstruction.parts[0]?.text).toMatch(/JSON/);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(300);
    expect(body.generationConfig.temperature).toBe(0);
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('JSON inválido no texto → fallback regras com erro tipado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson(generateContent('não é json')));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'o imóvel está disponível?' });

    expect(result).toMatchObject({ intent: 'AVAILABILITY', extractedBy: 'RULE' });
    expect(errors[0]?.kind).toBe('INVALID_RESPONSE');
  });

  it('conteúdo bloqueado por safety (sem candidates) → fallback regras', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okJson({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quero visitar' });

    expect(result).toMatchObject({ intent: 'VISIT_REQUEST', extractedBy: 'RULE' });
    expect(errors[0]?.kind).toBe('INVALID_RESPONSE');
    expect(errors[0]?.message).toMatch(/bloqueou|block/i);
  });

  it('auth error (403) → erro tipado AUTH + fallback', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"code":403}}', { status: 403 }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quanto custa?' });

    expect(result.extractedBy).toBe('RULE');
    expect(errors[0]).toMatchObject({ kind: 'AUTH', statusCode: 403, retryable: false });
  });

  it('rate limit (429) → erro tipado RATE_LIMIT retryable + fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"error":{}}', { status: 429 }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'oi' });

    expect(result.extractedBy).toBe('RULE');
    expect(errors[0]).toMatchObject({ kind: 'RATE_LIMIT', statusCode: 429, retryable: true });
  });

  it('timeout (AbortSignal) → erro tipado TIMEOUT + fallback', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    ) as unknown as typeof fetch;
    const errors: AiProviderError[] = [];
    const provider = new GeminiAiProvider({
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 25,
      onError: (err) => errors.push(err),
    });

    const result = await provider.extractIntent({ text: 'quero agendar visita amanhã' });

    expect(result.extractedBy).toBe('RULE');
    expect(errors[0]).toMatchObject({ kind: 'TIMEOUT', retryable: true });
  });

  it('falha de rede → erro tipado NETWORK + fallback', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quero ver o imóvel' });

    expect(result).toMatchObject({ intent: 'VISIT_REQUEST', extractedBy: 'RULE' });
    expect(errors[0]).toMatchObject({ kind: 'NETWORK', retryable: true });
  });
});
