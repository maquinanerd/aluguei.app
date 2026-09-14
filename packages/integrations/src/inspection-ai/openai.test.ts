import { describe, expect, it, vi } from 'vitest';
import type { AiProviderError } from '../ai/errors.js';
import { OpenAiInspectionAiProvider } from './openai.js';
import type { OpenAiInspectionAiProviderOptions } from './openai.js';

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

function makeProvider(
  fetchImpl: typeof fetch,
  errors: AiProviderError[] = [],
  fetchMedia?: (input: { storageKey: string }) => Promise<Blob>,
): OpenAiInspectionAiProvider {
  const opts: OpenAiInspectionAiProviderOptions = {
    apiKey: 'test-key',
    fetchImpl,
    onError: (err) => errors.push(err),
  };
  if (fetchMedia) {
    opts.fetchMedia = fetchMedia;
  }
  return new OpenAiInspectionAiProvider(opts);
}

describe('OpenAiInspectionAiProvider.transcribeAudio', () => {
  it('transcreve via /v1/audio/transcriptions (multipart) com sucesso', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        okJson({ text: 'paredes com manchas visíveis', usage: { type: 'tokens' } }),
      );
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([0x50, 0x4b])], { type: 'audio/mpeg' }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors, fetchMedia);

    const result = await provider.transcribeAudio({
      storageKey: 'inspections/1/audio.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result).toEqual({ text: 'paredes com manchas visíveis', aiModel: 'whisper-1' });
    expect(errors).toHaveLength(0);
    expect(fetchMedia).toHaveBeenCalledWith({ storageKey: 'inspections/1/audio.mp3' });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-key' });
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('json');
    const file = form.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe('audio/mpeg');
  });

  it('sem fetchMedia → fallback determinístico com erro MEDIA_FETCH', async () => {
    const errors: AiProviderError[] = [];
    const provider = makeProvider(vi.fn(), errors);

    const result = await provider.transcribeAudio({
      storageKey: 'inspections/1/audio.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result.aiModel).toBe('mock-inspection');
    expect(result.text).toMatch(/Transcrição mock/);
    expect(errors[0]?.kind).toBe('MEDIA_FETCH');
  });

  it('falha ao buscar mídia no storage → fallback determinístico', async () => {
    const fetchMedia = vi.fn().mockRejectedValue(new Error('bucket not found'));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(vi.fn(), errors, fetchMedia);

    const result = await provider.transcribeAudio({
      storageKey: 'inspections/1/audio.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result.aiModel).toBe('mock-inspection');
    expect(errors[0]?.kind).toBe('MEDIA_FETCH');
  });

  it('auth error → erro tipado AUTH + fallback determinístico', async () => {
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"bad key"}}', { status: 401 }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors, fetchMedia);

    const result = await provider.transcribeAudio({
      storageKey: 'inspections/1/audio.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result.aiModel).toBe('mock-inspection');
    expect(errors[0]).toMatchObject({ kind: 'AUTH', statusCode: 401, retryable: false });
  });

  it('timeout → erro tipado TIMEOUT + fallback determinístico', async () => {
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }));
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    ) as unknown as typeof fetch;
    const errors: AiProviderError[] = [];
    const provider = new OpenAiInspectionAiProvider({
      apiKey: 'k',
      fetchImpl,
      fetchMedia,
      timeoutMs: 25,
      onError: (err) => errors.push(err),
    });

    const result = await provider.transcribeAudio({
      storageKey: 'inspections/1/audio.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(result.aiModel).toBe('mock-inspection');
    expect(errors[0]?.kind).toBe('TIMEOUT');
  });
});

describe('OpenAiInspectionAiProvider.suggestObservations', () => {
  it('gera sugestões via chat completions com imagem base64 (PHOTO)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson(
        chatCompletion(
          JSON.stringify([
            {
              category: 'DAMAGE',
              severity: 'MEDIUM',
              description: 'Mancha visível na parede',
              confidence: 0.9,
            },
            { category: 'FURNITURE', severity: 'LOW', description: 'Móvel presente' },
          ]),
        ),
      ),
    );
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors, fetchMedia);

    const result = await provider.suggestObservations({
      storageKey: 'inspections/1/foto.jpg',
      kind: 'PHOTO',
      roomName: 'Quarto',
    });

    expect(result).toEqual([
      {
        category: 'DAMAGE',
        severity: 'MEDIUM',
        description: 'Mancha visível na parede',
        confidence: 0.9,
      },
      { category: 'FURNITURE', severity: 'LOW', description: 'Móvel presente', confidence: 0.7 },
    ]);
    expect(errors).toHaveLength(0);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body as string) as {
      model: string;
      response_format: { type: string };
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    const parts = body.messages[1]?.content as Array<Record<string, unknown>>;
    expect(parts[0]).toMatchObject({ type: 'text', text: 'Cômodo informado: Quarto.' });
    const imagePart = parts[1] as { image_url: { url: string } };
    expect(imagePart.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('vídeo (VIDEO) envia FileContentPart com base64', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson(chatCompletion('[]')));
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([4, 5])], { type: 'video/mp4' }));
    const provider = makeProvider(fetchImpl, [], fetchMedia);

    const result = await provider.suggestObservations({
      storageKey: 'inspections/1/video.mp4',
      kind: 'VIDEO',
    });

    expect(result).toEqual([]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ content: unknown }>;
    };
    const parts = body.messages[1]?.content as Array<Record<string, unknown>>;
    expect(parts[0]).toMatchObject({
      type: 'file',
      file: { filename: 'video.mp4' },
    });
  });

  it('JSON inválido → fallback determinístico por cômodo com erro tipado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson(chatCompletion('não é json')));
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    const errors: AiProviderError[] = [];
    const provider = makeProvider(fetchImpl, errors, fetchMedia);

    const result = await provider.suggestObservations({
      storageKey: 'inspections/1/foto.jpg',
      kind: 'PHOTO',
      roomName: 'Quarto',
    });

    expect(result[0]).toMatchObject({ category: 'DAMAGE', description: /mancha/i });
    expect(errors[0]?.kind).toBe('INVALID_RESPONSE');
  });

  it('sem fetchMedia → fallback determinístico com erro MEDIA_FETCH', async () => {
    const errors: AiProviderError[] = [];
    const provider = makeProvider(vi.fn(), errors);

    const result = await provider.suggestObservations({
      storageKey: 'inspections/1/foto.jpg',
      kind: 'PHOTO',
      roomName: 'Cozinha',
    });

    expect(result[0]).toMatchObject({ category: 'CLEANLINESS' });
    expect(errors[0]?.kind).toBe('MEDIA_FETCH');
  });

  it('timeout → erro tipado TIMEOUT + fallback determinístico', async () => {
    const fetchMedia = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    ) as unknown as typeof fetch;
    const errors: AiProviderError[] = [];
    const provider = new OpenAiInspectionAiProvider({
      apiKey: 'k',
      fetchImpl,
      fetchMedia,
      timeoutMs: 25,
      onError: (err) => errors.push(err),
    });

    const result = await provider.suggestObservations({
      storageKey: 'inspections/1/foto.jpg',
      kind: 'PHOTO',
    });

    expect(result[0]).toMatchObject({ category: 'CONDITION' });
    expect(errors[0]?.kind).toBe('TIMEOUT');
  });
});
