import { describe, expect, it, vi } from 'vitest';
import type { AiProviderError } from './errors.js';
import { OpenAiAiProvider } from './openai.js';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function chatCompletion(content: string): unknown {
  return {
    id: 'chatcmpl-test',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  };
}

function makeProvider(fetchImpl: typeof fetch, errors: AiProviderError[] = []): OpenAiAiProvider {
  return new OpenAiAiProvider({
    apiKey: 'test-key',
    fetchImpl,
    onError: (err) => errors.push(err),
  });
}

describe('OpenAiAiProvider.extractIntent', () => {
  it('extrai intenção via chat completions (JSON mode) com sucesso', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson(
        chatCompletion(
          JSON.stringify({
            intent: 'VISIT_REQUEST',
            propertyCode: 'APT123',
            budgetMaxCents: 300000,
            moveInDate: '2026-08-20',
            confidence: 0.95,
          }),
        ),
      ),
    );
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quero visitar o APT123, até 3 mil' });

    expect(result).toMatchObject({
      intent: 'VISIT_REQUEST',
      propertyCode: 'APT123',
      budgetMaxCents: 300000,
      moveInDate: '2026-08-20',
      confidence: 0.95,
      extractedBy: 'AI',
    });
    expect(errors).toHaveLength(0);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-key' });
    const body = JSON.parse(init.body as string) as {
      model: string;
      response_format: { type: string };
      max_completion_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_completion_tokens).toBe(300);
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[1]?.role).toBe('user');
    // Segredo nunca vai no corpo nem aparece em logs/assertions.
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('confiança default 0.8 quando o LLM omite confidence', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okJson(chatCompletion(JSON.stringify({ intent: 'PRICE_QUERY' }))));
    const provider = makeProvider(fetchImpl);
    const result = await provider.extractIntent({ text: 'qual o valor?' });
    expect(result).toMatchObject({ intent: 'PRICE_QUERY', confidence: 0.8, extractedBy: 'AI' });
  });

  it('JSON inválido no conteúdo → fallback determinístico (regras) com erro tipado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson(chatCompletion('isto não é JSON')));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'qual o preço do imóvel?' });

    expect(result).toMatchObject({ intent: 'PRICE_QUERY', extractedBy: 'RULE', confidence: 1 });
    expect(errors[0]?.kind).toBe('INVALID_RESPONSE');
    expect(errors[0]?.retryable).toBe(true);
  });

  it('JSON válido mas fora do schema (orçamento não-inteiro) → fallback regras', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        okJson(chatCompletion(JSON.stringify({ intent: 'PRICE_QUERY', budgetMaxCents: 3000.5 }))),
      );
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quanto custa?' });

    expect(result.extractedBy).toBe('RULE');
    expect(errors[0]?.kind).toBe('INVALID_RESPONSE');
  });

  it('resposta 200 com corpo não-JSON → INVALID_JSON + fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>erro</html>', { status: 200 }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'oi' });

    expect(result.extractedBy).toBe('RULE');
    expect(errors[0]?.kind).toBe('INVALID_JSON');
  });

  it('auth error (401) → erro tipado AUTH + fallback (nunca quebra o atendimento)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"invalid api key"}}', { status: 401 }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'o imóvel está disponível?' });

    expect(result).toMatchObject({ intent: 'AVAILABILITY', extractedBy: 'RULE' });
    expect(errors[0]).toMatchObject({ kind: 'AUTH', statusCode: 401, retryable: false });
  });

  it('HTTP 500 → erro tipado HTTP retryable + fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"error":{}}', { status: 500 }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quero agendar visita' });

    expect(result).toMatchObject({ intent: 'VISIT_REQUEST', extractedBy: 'RULE' });
    expect(errors[0]).toMatchObject({ kind: 'HTTP', statusCode: 500, retryable: true });
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
    const provider = new OpenAiAiProvider({
      apiKey: 'k',
      fetchImpl,
      timeoutMs: 25,
      onError: (err) => errors.push(err),
    });

    const result = await provider.extractIntent({ text: 'qual o aluguel?' });

    expect(result.extractedBy).toBe('RULE');
    expect(errors[0]).toMatchObject({ kind: 'TIMEOUT', retryable: true });
    expect(errors[0]?.message).toMatch(/timeout/i);
  });

  it('falha de rede → erro tipado NETWORK + fallback', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors);

    const result = await provider.extractIntent({ text: 'quero conhecer o imóvel' });

    expect(result).toMatchObject({ intent: 'VISIT_REQUEST', extractedBy: 'RULE' });
    expect(errors[0]).toMatchObject({ kind: 'NETWORK', retryable: true });
  });
});
