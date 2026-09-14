import { describe, expect, it, vi } from 'vitest';
import {
  AsaasPaymentError,
  AsaasPaymentProvider,
  AsaasTimeoutError,
  mapAsaasPaymentWebhook,
} from './asaas.js';
import { getPaymentProvider } from './registry.js';

interface Route {
  method: string;
  path: string | RegExp;
  status?: number;
  body: unknown;
}

/** Registro de chamadas do fetch mockado (parâmetros capturados pelo vi.fn). */
interface FetchCallLog {
  mock: { calls: ReadonlyArray<readonly unknown[]> };
}

/** Mock de fetch roteado por (método, URL). Lança para chamadas não mockadas. */
function mockFetch(routes: Route[]) {
  return vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const route = routes.find(
      (r) =>
        r.method === method &&
        (typeof r.path === 'string' ? url.endsWith(r.path) : r.path.test(url)),
    );
    if (!route) {
      throw new Error(`chamada não mockada: ${method} ${url}`);
    }
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

function lastCallBody(fetchImpl: FetchCallLog, index = 0): Record<string, unknown> {
  const call = fetchImpl.mock.calls[index];
  const init = call?.[1];
  if (init === undefined || init === null || typeof init !== 'object') {
    return {};
  }
  const body = (init as { body?: unknown }).body;
  if (typeof body !== 'string') {
    return {};
  }
  return JSON.parse(body) as Record<string, unknown>;
}

const paymentFixture = {
  id: 'pay_080225913252',
  status: 'PENDING',
  value: 123.45,
  billingType: 'PIX',
};

describe('AsaasPaymentProvider.createCharge', () => {
  it('PIX: cria cobrança e busca o QR code (payload)', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'POST',
        path: '/v3/payments',
        body: paymentFixture,
      },
      {
        method: 'GET',
        path: '/v3/payments/pay_080225913252/pixQrCode',
        body: { payload: '000201010212-pix-copia-e-cola', expirationDate: '2026-09-01 23:59:59' },
      },
    ]);
    const provider = new AsaasPaymentProvider({
      apiKey: 'test-key',
      customerId: 'cus_G7Dvo4iphUNk',
      fetchImpl,
    });

    const result = await provider.createCharge({
      amountCents: 12_345,
      description: 'Aluguel setembro',
      dueDate: '2026-09-10',
      payerName: 'Fulano',
      payerDocument: '11144477735',
    });

    expect(result).toEqual({
      providerChargeId: 'pay_080225913252',
      pixQrCode: '000201010212-pix-copia-e-cola',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // valor em reais (float) convertido de centavos; billingType PIX; customer obrigatório.
    expect(lastCallBody(fetchImpl, 0)).toMatchObject({
      customer: 'cus_G7Dvo4iphUNk',
      billingType: 'PIX',
      value: 123.45,
      dueDate: '2026-09-10',
      description: 'Aluguel setembro',
    });
  });

  it('BOLETO: usa bankSlipUrl da resposta e não chama o QR code', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'POST',
        path: '/v3/payments',
        body: {
          ...paymentFixture,
          billingType: 'BOLETO',
          bankSlipUrl: 'https://www.asaas.com/b/pdf/123',
        },
      },
    ]);
    const provider = new AsaasPaymentProvider({
      apiKey: 'test-key',
      billingType: 'BOLETO',
      customerId: 'cus_1',
      fetchImpl,
    });

    const result = await provider.createCharge({
      amountCents: 50_000,
      description: 'Boleto caução',
      dueDate: '2026-09-05',
    });

    expect(result).toEqual({
      providerChargeId: 'pay_080225913252',
      boletoUrl: 'https://www.asaas.com/b/pdf/123',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lastCallBody(fetchImpl, 0)).toMatchObject({ billingType: 'BOLETO', value: 500 });
  });

  it('sem customerId: busca cliente por externalReference e cria se ausente', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'GET',
        path: '/v3/customers?externalReference=aluguei%3Apayer%3A11144477735&limit=1',
        body: { object: 'list', data: [] },
      },
      { method: 'POST', path: '/v3/customers', body: { id: 'cus_novo' } },
      { method: 'POST', path: '/v3/payments', body: paymentFixture },
      {
        method: 'GET',
        path: '/v3/payments/pay_080225913252/pixQrCode',
        body: { payload: '000201-pix' },
      },
    ]);
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl });

    const result = await provider.createCharge({
      amountCents: 10_000,
      description: 'Aluguel',
      dueDate: '2026-09-10',
      payerName: 'Fulano',
      payerDocument: '11144477735',
    });

    expect(result.providerChargeId).toBe('pay_080225913252');
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      'https://api-sandbox.asaas.com/v3/customers?externalReference=aluguei%3Apayer%3A11144477735&limit=1',
      'https://api-sandbox.asaas.com/v3/customers',
      'https://api-sandbox.asaas.com/v3/payments',
      'https://api-sandbox.asaas.com/v3/payments/pay_080225913252/pixQrCode',
    ]);
    // Cliente com dedupe por cpfCnpj/externalReference e notificações desabilitadas.
    expect(lastCallBody(fetchImpl, 1)).toMatchObject({
      name: 'Fulano',
      cpfCnpj: '11144477735',
      externalReference: 'aluguei:payer:11144477735',
      notificationDisabled: true,
    });
    // Segunda cobrança do mesmo pagador reutiliza o cliente em cache (sem nova busca).
    await provider.createCharge({
      amountCents: 10_000,
      description: 'Aluguel 2',
      dueDate: '2026-10-10',
      payerName: 'Fulano',
      payerDocument: '11144477735',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('exige payerName/payerDocument quando não há customerId fixo', async () => {
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl: mockFetch([]) });
    await expect(
      provider.createCharge({ amountCents: 1_000, description: 'x', dueDate: '2026-09-01' }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_REQUIRED' });
  });
});

describe('AsaasPaymentProvider.getChargeStatus', () => {
  it.each([
    ['PENDING', 'PENDING'],
    ['RECEIVED', 'CONFIRMED'],
    ['CONFIRMED', 'CONFIRMED'],
    ['RECEIVED_IN_CASH', 'CONFIRMED'],
    ['OVERDUE', 'FAILED'],
    ['REFUNDED', 'REFUNDED'],
  ])('mapeia status Asaas %s → %s', async (providerStatus, expected) => {
    const fetchImpl = mockFetch([
      {
        method: 'GET',
        path: '/v3/payments/pay_1',
        body: { id: 'pay_1', status: providerStatus, value: 10 },
      },
    ]);
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl });
    await expect(provider.getChargeStatus('pay_1')).resolves.toBe(expected);
  });

  it('status desconhecido lança erro tipado (nunca mapeia em silêncio)', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'GET',
        path: '/v3/payments/pay_1',
        body: { id: 'pay_1', status: 'NOVO_STATUS', value: 10 },
      },
    ]);
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl });
    await expect(provider.getChargeStatus('pay_1')).rejects.toMatchObject({
      code: 'UNKNOWN_STATUS',
      retryable: false,
    });
  });
});

describe('AsaasPaymentProvider.cancelCharge / refundPayment', () => {
  it('cancelCharge: DELETE no payment; 404 (já removida) resolve como idempotente', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'DELETE',
        path: '/v3/payments/pay_1',
        body: { deleted: true, id: 'pay_1' },
      },
      { method: 'DELETE', path: '/v3/payments/pay_2', status: 404, body: { errors: [] } },
    ]);
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl });
    await expect(provider.cancelCharge('pay_1')).resolves.toBeUndefined();
    await expect(provider.cancelCharge('pay_2')).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls.map((call) => [call[1]?.method, call[0]])).toEqual([
      ['DELETE', 'https://api-sandbox.asaas.com/v3/payments/pay_1'],
      ['DELETE', 'https://api-sandbox.asaas.com/v3/payments/pay_2'],
    ]);
  });

  it('refundPayment: POST /refund sem body (estorno integral)', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'POST',
        path: '/v3/payments/pay_1/refund',
        body: { id: 'pay_1', status: 'REFUNDED', value: 10 },
      },
    ]);
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl });
    await expect(provider.refundPayment('pay_1')).resolves.toBeUndefined();
    const call = fetchImpl.mock.calls[0];
    expect(call?.[1]?.method).toBe('POST');
    expect(call?.[1]?.body).toBeUndefined();
  });
});

describe('AsaasPaymentProvider erros', () => {
  it('401 auth → AsaasPaymentError não retryable com code do body', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'POST',
        path: '/v3/payments',
        status: 401,
        body: {
          errors: [
            { code: 'invalid_access_token', description: 'A chave de API fornecida é inválida' },
          ],
        },
      },
    ]);
    const provider = new AsaasPaymentProvider({
      apiKey: 'test-key',
      customerId: 'cus_1',
      fetchImpl,
    });
    const error = await provider
      .createCharge({ amountCents: 1_000, description: 'x', dueDate: '2026-09-01' })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AsaasPaymentError);
    expect(error).toMatchObject({
      code: 'invalid_access_token',
      providerStatusCode: 401,
      retryable: false,
    });
  });

  it('429 rate limit → retryable', async () => {
    const fetchImpl = mockFetch([
      {
        method: 'POST',
        path: '/v3/payments',
        status: 429,
        body: { errors: [{ code: 'rate_limit' }] },
      },
    ]);
    const provider = new AsaasPaymentProvider({
      apiKey: 'test-key',
      customerId: 'cus_1',
      fetchImpl,
    });
    await expect(
      provider.createCharge({ amountCents: 1_000, description: 'x', dueDate: '2026-09-01' }),
    ).rejects.toMatchObject({ code: 'rate_limit', providerStatusCode: 429, retryable: true });
  });

  it('timeout (AbortSignal) → AsaasTimeoutError retryable', async () => {
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const provider = new AsaasPaymentProvider({
      apiKey: 'test-key',
      timeoutMs: 20,
      customerId: 'cus_1',
      fetchImpl,
    });
    await expect(
      provider.createCharge({ amountCents: 1_000, description: 'x', dueDate: '2026-09-01' }),
    ).rejects.toBeInstanceOf(AsaasTimeoutError);
  });

  it('resposta 2xx fora do contrato (zod falha) → INVALID_RESPONSE retryable', async () => {
    const fetchImpl = mockFetch([
      { method: 'GET', path: '/v3/payments/pay_1', body: { inesperado: true } },
    ]);
    const provider = new AsaasPaymentProvider({ apiKey: 'test-key', fetchImpl });
    await expect(provider.getChargeStatus('pay_1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: true,
    });
  });

  it('chave de ambiente errada → ENV_MISMATCH sem chamada externa', () => {
    expect(() => new AsaasPaymentProvider({ apiKey: '$aact_prod_abc', env: 'sandbox' })).toThrow(
      AsaasPaymentError,
    );
    expect(() => new AsaasPaymentProvider({ apiKey: '$aact_hmlg_abc', env: 'production' })).toThrow(
      /ENV_MISMATCH/,
    );
  });
});

describe('mapAsaasPaymentWebhook', () => {
  it('PAYMENT_CONFIRMED → evento interno com amountCents e paidAt ISO', () => {
    const event = mapAsaasPaymentWebhook({
      id: 'evt_05b708f961d739ea7eba7e4db318f621',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_080225913252', value: 123.45, paymentDate: '2026-08-17 10:00:00' },
    });
    expect(event).toMatchObject({
      provider: 'ASAAS',
      eventType: 'PAYMENT_CONFIRMED',
      providerEventId: 'evt_05b708f961d739ea7eba7e4db318f621',
      providerChargeId: 'pay_080225913252',
      amountCents: 12_345,
    });
    expect(event?.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('PAYMENT_RECEIVED (Pix) → PAYMENT_CONFIRMED', () => {
    const event = mapAsaasPaymentWebhook({
      id: 'evt_2',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', value: 99.9 },
    });
    expect(event?.eventType).toBe('PAYMENT_CONFIRMED');
    expect(event?.amountCents).toBe(9_990);
  });

  it('PAYMENT_OVERDUE e PAYMENT_DELETED mapeiam; eventos sem mapeamento → null', () => {
    expect(
      mapAsaasPaymentWebhook({
        id: 'evt_3',
        event: 'PAYMENT_OVERDUE',
        payment: { id: 'pay_1', value: 10 },
      })?.eventType,
    ).toBe('PAYMENT_OVERDUE');
    expect(
      mapAsaasPaymentWebhook({
        id: 'evt_4',
        event: 'PAYMENT_DELETED',
        payment: { id: 'pay_1', value: 10 },
      })?.eventType,
    ).toBe('PAYMENT_FAILED');
    // Não suportados pelo modelo interno: ignorados (null), nunca mapeados errado.
    expect(
      mapAsaasPaymentWebhook({
        id: 'evt_5',
        event: 'PAYMENT_CREATED',
        payment: { id: 'pay_1', value: 10 },
      }),
    ).toBeNull();
    expect(
      mapAsaasPaymentWebhook({
        id: 'evt_6',
        event: 'PAYMENT_PARTIALLY_REFUNDED',
        payment: { id: 'pay_1', value: 10 },
      }),
    ).toBeNull();
  });

  it('payload inválido lança erro de schema', () => {
    expect(() => mapAsaasPaymentWebhook({ event: 'PAYMENT_CONFIRMED' })).toThrow();
  });
});

describe('payments/registry', () => {
  it('ASAAS com apiKey → AsaasPaymentProvider (env default sandbox)', () => {
    const provider = getPaymentProvider({ provider: 'ASAAS', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(AsaasPaymentProvider);
  });

  it('ASAAS sem apiKey → null (nunca simula provider real)', () => {
    expect(getPaymentProvider({ provider: 'ASAAS' })).toBeNull();
  });

  it('FAKE continua disponível para dev/test', () => {
    expect(getPaymentProvider({ provider: 'FAKE' })).not.toBeNull();
  });
});
