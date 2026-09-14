import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@aluguei/domain';
import { FakeWhatsAppMessenger } from './fake.js';
import { META_GRAPH_DEFAULT_VERSION, MetaWhatsAppAdapter, WhatsAppProviderError } from './meta.js';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeAdapter(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof MetaWhatsAppAdapter>[0]> = {},
): MetaWhatsAppAdapter {
  return new MetaWhatsAppAdapter({
    accessToken: 't',
    phoneNumberId: '1001',
    verifyToken: 'v',
    fetchImpl,
    ...overrides,
  });
}

describe('FakeWhatsAppMessenger', () => {
  it('sendText é determinístico e registra no outbox', async () => {
    const messenger = new FakeWhatsAppMessenger('tok');
    const a = await messenger.sendText('5511999990001', 'Olá');
    const b = await messenger.sendText('5511999990001', 'Olá');
    expect(a.waMessageId).toBe(b.waMessageId); // mesmo to+body → mesmo id (retry não duplica)
    expect(messenger.outbox.length).toBe(2);
  });

  it('verifyWebhook valida token', () => {
    const messenger = new FakeWhatsAppMessenger('tok');
    expect(messenger.verifyWebhook({ mode: 'subscribe', token: 'tok', challenge: 'c' })).toEqual({
      valid: true,
      challenge: 'c',
    });
    expect(
      messenger.verifyWebhook({ mode: 'subscribe', token: 'errado', challenge: 'c' }).valid,
    ).toBe(false);
  });
});

describe('MetaWhatsAppAdapter parseWebhookEvent', () => {
  it('normaliza mensagens e ignora payloads sem messages', () => {
    const adapter = makeAdapter(() => Promise.resolve(okJson({})));
    const events = adapter.parseWebhookEvent({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1001' },
                messages: [
                  { from: '5511', id: 'w1', timestamp: '1', type: 'text', text: { body: 'oi' } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ waContactId: '5511', body: 'oi', waMessageId: 'w1' });

    const status = adapter.parseWebhookEvent({
      entry: [{ changes: [{ value: { statuses: [] } }] }],
    });
    expect(status).toHaveLength(0);
  });

  it('retorna [] para payload malformado', () => {
    const adapter = makeAdapter(() => Promise.resolve(okJson({})));
    expect(adapter.parseWebhookEvent(null)).toEqual([]);
    expect(adapter.parseWebhookEvent({ foo: 1 })).toEqual([]);
  });
});

describe('MetaWhatsAppAdapter sendText', () => {
  it('envia payload padrão da Cloud API e retorna waMessageId', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ messages: [{ id: 'wamid.A' }] }));
    const adapter = makeAdapter(fetchImpl);
    const result = await adapter.sendText('5511999990001', 'Olá');

    expect(result).toEqual({ waMessageId: 'wamid.A' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${META_GRAPH_DEFAULT_VERSION}/1001/messages`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer t' });
    const body = JSON.parse(init.body as string) as {
      messaging_product: string;
      recipient_type: string;
      to: string;
      type: string;
      text: { body: string };
    };
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511999990001',
      type: 'text',
      text: { body: 'Olá' },
    });
  });

  it('respeita apiVersion customizada', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ messages: [{ id: 'w' }] }));
    const adapter = makeAdapter(fetchImpl, { apiVersion: 'v24.0' });
    await adapter.sendText('5511', 'oi');
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v24.0/1001/messages');
  });

  it('lança INVALID_INPUT para mensagem vazia ou longa demais', async () => {
    const adapter = makeAdapter(() => Promise.resolve(okJson({})));
    await expect(adapter.sendText('5511', '')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(adapter.sendText('5511', 'x'.repeat(4097))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(adapter.sendText('', 'oi')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('lança PROVIDER_ERROR quando a resposta não traz message id', async () => {
    const adapter = makeAdapter(() => Promise.resolve(okJson({})));
    await expect(adapter.sendText('5511', 'oi')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: /sem message id/,
    });
  });

  it('lança WhatsAppProviderError tipado com código da API (131026)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      errorJson(400, {
        error: {
          message: '(#131026) Message undeliverable',
          type: 'OAuthException',
          code: 131026,
          error_data: {
            messaging_product: 'whatsapp',
            details: 'Recipient phone number is not a WhatsApp phone number.',
          },
          fbtrace_id: 'Az8or2yhqkZfEZ-_4Qn_Bam',
        },
      }),
    );
    const adapter = makeAdapter(fetchImpl);
    const promise = adapter.sendText('5511', 'oi');
    await expect(promise).rejects.toBeInstanceOf(WhatsAppProviderError);
    await expect(promise).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 400,
      providerCode: 131026,
      providerDetails: 'Recipient phone number is not a WhatsApp phone number.',
      fbtraceId: 'Az8or2yhqkZfEZ-_4Qn_Bam',
      retryable: false,
    });
  });

  it('marca erros de rate limit (429/130429) como retryable', async () => {
    const throttled = vi.fn().mockResolvedValue(
      errorJson(429, {
        error: {
          message: '(#130429) Rate limit hit',
          type: 'OAuthException',
          code: 130429,
          error_data: {
            messaging_product: 'whatsapp',
            details: 'Cloud API message throughput has been reached.',
          },
        },
      }),
    );
    const adapter = makeAdapter(throttled);
    await expect(adapter.sendText('5511', 'oi')).rejects.toMatchObject({
      providerCode: 130429,
      retryable: true,
    });
  });

  it('timeout aborta o fetch e lança erro retryable', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    ) as unknown as typeof fetch;
    const adapter = makeAdapter(fetchImpl, { timeoutMs: 25 });
    await expect(adapter.sendText('5511', 'oi')).rejects.toMatchObject({
      name: 'WhatsAppProviderError',
      retryable: true,
      message: /timeout/,
    });
  });
});

describe('MetaWhatsAppAdapter sendTemplateMessage', () => {
  it('envia template com parâmetros posicionais de body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ messages: [{ id: 'wamid.T' }] }));
    const adapter = makeAdapter(fetchImpl);
    const result = await adapter.sendTemplateMessage({
      to: '5511999990001',
      templateName: 'imovel_disponivel',
      languageCode: 'pt_BR',
      bodyParameters: ['AP-001', 'R$ 2.500'],
    });

    expect(result).toEqual({ waMessageId: 'wamid.T' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${META_GRAPH_DEFAULT_VERSION}/1001/messages`);
    const body = JSON.parse(init.body as string) as {
      messaging_product: string;
      recipient_type: string;
      to: string;
      type: string;
      template: {
        name: string;
        language: { code: string };
        components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>;
      };
    };
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511999990001',
      type: 'template',
      template: {
        name: 'imovel_disponivel',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'AP-001' },
              { type: 'text', text: 'R$ 2.500' },
            ],
          },
        ],
      },
    });
  });

  it('envia template sem parâmetros', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ messages: [{ id: 'w' }] }));
    const adapter = makeAdapter(fetchImpl);
    await adapter.sendTemplateMessage({
      to: '5511',
      templateName: 'boas_vindas',
      languageCode: 'pt_BR',
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      template: { name: string; language: { code: string }; components?: unknown };
    };
    expect(body.template.components).toBeUndefined();
  });

  it('rejeita template sem nome ou idioma', async () => {
    const adapter = makeAdapter(() => Promise.resolve(okJson({})));
    await expect(
      adapter.sendTemplateMessage({ to: '5511', templateName: '', languageCode: 'pt_BR' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      adapter.sendTemplateMessage({ to: '5511', templateName: 'x', languageCode: '' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('MetaWhatsAppAdapter testConnection', () => {
  it('GET /<phone_number_id> retorna metadata do número', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson({
        verified_name: 'Aluguei',
        code_verification_status: 'VERIFIED',
        display_phone_number: '5511999990001',
        quality_rating: 'GREEN',
        platform_type: 'CLOUD_API',
        throughput: { level: 'STANDARD' },
        id: '1001',
      }),
    );
    const adapter = makeAdapter(fetchImpl);
    const info = await adapter.testConnection();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${META_GRAPH_DEFAULT_VERSION}/1001`);
    expect(init.method).toBe('GET');
    expect(info).toEqual({
      phoneNumberId: '1001',
      verifiedName: 'Aluguei',
      displayPhoneNumber: '5511999990001',
      qualityRating: 'GREEN',
      codeVerificationStatus: 'VERIFIED',
      platformType: 'CLOUD_API',
      throughputLevel: 'STANDARD',
    });
  });

  it('propaga WhatsAppProviderError em falha de conexão', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        errorJson(400, { error: { message: '(#100) Invalid parameter', code: 100 } }),
      );
    const adapter = makeAdapter(fetchImpl);
    const promise = adapter.testConnection();
    await expect(promise).rejects.toBeInstanceOf(WhatsAppProviderError);
    await expect(promise).rejects.toMatchObject({ status: 400, providerCode: 100 });
  });
});

describe('WhatsAppProviderError', () => {
  it('é um DomainError PROVIDER_ERROR', () => {
    const error = new WhatsAppProviderError({
      status: 400,
      providerCode: 131026,
      message: '(#131026) Message undeliverable',
    });
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.retryable).toBe(false);
  });
});
