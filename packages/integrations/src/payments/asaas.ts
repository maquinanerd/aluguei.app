import { z } from 'zod';
import type {
  CreateChargeInput,
  CreateChargeResult,
  IPaymentProvider,
  PaymentChargeStatus,
} from './types.js';

/**
 * Adapter Asaas (API v3) — cobrança PIX/boleto, status, cancelamento, estorno e
 * mapeamento de webhook.
 *
 * Documentação consultada em 2026-08-17:
 * - Referência/cobranças: https://docs.asaas.com/reference (openapi 3.0.1, info.version 3.0.0)
 * - Autenticação: https://docs.asaas.com/docs/autenticação-1
 * - Webhooks de cobranças: https://docs.asaas.com/docs/webhook-para-cobrancas
 * - Receber eventos: https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook
 * - Rate limits: https://docs.asaas.com/reference/rate-e-quota-limit
 * - Sandbox: https://docs.asaas.com/docs/sandbox
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real (sandbox/produção) não há
 * validação ao vivo. Nunca inventar endpoint/campo — tudo abaixo é documentado.
 */

const BASE_URLS = {
  // Server da OpenAPI sem prefixo: paths documentados já incluem /v3/.
  sandbox: 'https://api-sandbox.asaas.com',
  production: 'https://api.asaas.com',
} as const;

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED';

export interface AsaasPaymentProviderOptions {
  apiKey: string;
  /** Sobrescreve a base derivada de `env` (ex.: proxy/MITM em testes). */
  baseUrl?: string;
  env?: 'sandbox' | 'production';
  /** Forma de pagamento padrão das cobranças criadas. Default: PIX. */
  billingType?: AsaasBillingType;
  /** Id de cliente Asaas fixo (opcional). Sem ele, find-or-create por documento. */
  customerId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** User-Agent obrigatório pela API para contas criadas após 13/06/2024. */
  userAgent?: string;
}

export type AsaasWebhookEventType =
  'PAYMENT_CONFIRMED' | 'PAYMENT_REFUNDED' | 'PAYMENT_FAILED' | 'PAYMENT_OVERDUE';

/** Evento normalizado pelo adapter — compatível com `paymentWebhookEventSchema` (contracts/finance). */
export interface AsaasPaymentWebhookEvent {
  provider: 'ASAAS';
  eventType: AsaasWebhookEventType;
  providerEventId: string;
  providerChargeId: string;
  amountCents: number;
  paidAt?: string;
}

export interface AsaasErrorOptions {
  code: string;
  providerStatusCode?: number;
  retryable?: boolean;
  providerCodes?: string[];
}

/** Erro tipado do provider. `retryable` indica se o chamador deve tentar de novo. */
export class AsaasPaymentError extends Error {
  readonly code: string;
  readonly providerStatusCode: number | undefined;
  readonly retryable: boolean;
  readonly providerCodes: string[];

  constructor(message: string, opts: AsaasErrorOptions) {
    super(message);
    this.name = 'AsaasPaymentError';
    this.code = opts.code;
    this.providerStatusCode = opts.providerStatusCode;
    this.retryable = opts.retryable ?? false;
    this.providerCodes = opts.providerCodes ?? [];
  }
}

export class AsaasTimeoutError extends AsaasPaymentError {
  constructor(timeoutMs: number, method: string, path: string) {
    super(`Asaas timeout após ${String(timeoutMs)}ms: ${method} ${path}`, {
      code: 'TIMEOUT',
      retryable: true,
    });
    this.name = 'AsaasTimeoutError';
  }
}

export class AsaasNetworkError extends AsaasPaymentError {
  constructor(method: string, path: string, cause: unknown) {
    super(
      `Falha de rede Asaas: ${method} ${path}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { code: 'NETWORK', retryable: true },
    );
    this.name = 'AsaasNetworkError';
  }
}

// ---------------------------------------------------------------------------
// Schemas locais (subconjunto dos DTOs documentados). Asaas pode adicionar
// campos novos — `.loose()` mantém o parse resiliente (docs/sobre webhooks).
// ---------------------------------------------------------------------------

const errorResponseSchema = z.object({
  errors: z.array(z.object({ code: z.string(), description: z.string().optional() })).default([]),
});

const paymentResponseSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    value: z.number(),
    billingType: z.string().optional(),
    bankSlipUrl: z.string().nullable().optional(),
    paymentDate: z.string().nullable().optional(),
    confirmedDate: z.string().nullable().optional(),
  })
  .loose();

const pixQrCodeResponseSchema = z
  .object({
    payload: z.string(),
    encodedImage: z.string().optional(),
    expirationDate: z.string().nullable().optional(),
  })
  .loose();

const paymentDeleteResponseSchema = z.object({ deleted: z.boolean(), id: z.string() }).loose();

const customerListResponseSchema = z
  .object({ data: z.array(z.object({ id: z.string() }).loose()) })
  .loose();

const customerResponseSchema = z.object({ id: z.string() }).loose();

const paymentWebhookBodySchema = z
  .object({
    id: z.string(),
    event: z.string(),
    dateCreated: z.string().optional(),
    payment: z
      .object({
        id: z.string(),
        value: z.number(),
        status: z.string().optional(),
        billingType: z.string().optional(),
        paymentDate: z.string().nullable().optional(),
        confirmedDate: z.string().nullable().optional(),
      })
      .loose(),
  })
  .loose();

// ---------------------------------------------------------------------------
// Mapeamentos (status e eventos documentados em PaymentGetResponsePaymentStatus
// e em docs/webhook-para-cobrancas).
// ---------------------------------------------------------------------------

const STATUS_TO_INTERNAL: Record<string, PaymentChargeStatus> = {
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PENDING',
  REFUND_REQUESTED: 'PENDING',
  REFUND_IN_PROGRESS: 'PENDING',
  RECEIVED: 'CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  RECEIVED_IN_CASH: 'CONFIRMED',
  OVERDUE: 'FAILED',
  DUNNING_REQUESTED: 'FAILED',
  DUNNING_RECEIVED: 'FAILED',
  CHARGEBACK_REQUESTED: 'FAILED',
  CHARGEBACK_DISPUTE: 'FAILED',
  AWAITING_CHARGEBACK_REVERSAL: 'FAILED',
  REFUNDED: 'REFUNDED',
};

const WEBHOOK_EVENT_MAP: Record<string, AsaasWebhookEventType> = {
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  // Pix/boleto liquidado: valor disponível (fluxo Pix não passa por CONFIRMED).
  PAYMENT_RECEIVED: 'PAYMENT_CONFIRMED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  PAYMENT_OVERDUE: 'PAYMENT_OVERDUE',
  PAYMENT_DELETED: 'PAYMENT_FAILED',
};

function centsToReais(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

function reaisToCents(value: number): number {
  return Math.round(value * 100);
}

/** Datas Asaas chegam como "yyyy-MM-dd" ou "yyyy-MM-dd HH:mm:ss" (sem timezone). */
function normalizeDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function isRetryableStatus(status: number): boolean {
  // 408 read timed out / 429 rate limit / 5xx — documentados em rate-e-quota-limit
  // e nos erros comuns de webhook/API.
  return status === 408 || status === 429 || status >= 500;
}

// ---------------------------------------------------------------------------

export class AsaasPaymentProvider implements IPaymentProvider {
  readonly name = 'ASAAS';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly billingType: AsaasBillingType;
  private readonly customerId: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly customerCache = new Map<string, string>();

  constructor(opts: AsaasPaymentProviderOptions) {
    const env = opts.env ?? 'sandbox';
    // Chaves são prefixadas por ambiente ($aact_hmlg_ sandbox / $aact_prod_ produção
    // — docs autenticação). Detecta troca de ambiente antes de queimar 401s.
    if (opts.apiKey.startsWith('$aact_prod_') && env === 'sandbox') {
      throw new AsaasPaymentError('Chave Asaas de produção com env sandbox (ENV_MISMATCH)', {
        code: 'ENV_MISMATCH',
      });
    }
    if (opts.apiKey.startsWith('$aact_hmlg_') && env === 'production') {
      throw new AsaasPaymentError('Chave Asaas de sandbox com env production (ENV_MISMATCH)', {
        code: 'ENV_MISMATCH',
      });
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? BASE_URLS[env];
    this.billingType = opts.billingType ?? 'PIX';
    this.customerId = opts.customerId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.userAgent = opts.userAgent ?? 'AlugueiApp/0.1.0';
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const customer = await this.resolveCustomerId(input);
    // value em reais (float) — conversão de centavos do domínio.
    const payment = await this.request('POST', '/v3/payments', paymentResponseSchema, {
      customer,
      billingType: this.billingType,
      value: centsToReais(input.amountCents),
      dueDate: input.dueDate,
      description: input.description,
      // Referência do pagamento no Aluguei: volta nos webhooks e na conciliação.
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
    });

    const result: CreateChargeResult = { providerChargeId: payment.id };

    // PIX e UNDEFINED: QR dinâmico recuperável pelo endpoint documentado.
    if (this.billingType === 'PIX' || this.billingType === 'UNDEFINED') {
      const qr = await this.request(
        'GET',
        `/v3/payments/${encodeURIComponent(payment.id)}/pixQrCode`,
        pixQrCodeResponseSchema,
      );
      if (qr.payload) {
        result.pixQrCode = qr.payload;
      }
    }

    // BOLETO e UNDEFINED: URL do boleto no DTO da cobrança.
    if (
      (this.billingType === 'BOLETO' || this.billingType === 'UNDEFINED') &&
      payment.bankSlipUrl
    ) {
      result.boletoUrl = payment.bankSlipUrl;
    }

    return result;
  }

  async getChargeStatus(providerChargeId: string): Promise<PaymentChargeStatus> {
    const payment = await this.request(
      'GET',
      `/v3/payments/${encodeURIComponent(providerChargeId)}`,
      paymentResponseSchema,
    );
    const internal = STATUS_TO_INTERNAL[payment.status];
    if (!internal) {
      throw new AsaasPaymentError(`Status Asaas não mapeado: ${payment.status}`, {
        code: 'UNKNOWN_STATUS',
        retryable: false,
      });
    }
    return internal;
  }

  async cancelCharge(providerChargeId: string): Promise<void> {
    try {
      await this.request(
        'DELETE',
        `/v3/payments/${encodeURIComponent(providerChargeId)}`,
        paymentDeleteResponseSchema,
      );
    } catch (err) {
      // 404 = já removida (docs excluir-cobranca). Cancelamento idempotente
      // para o worker: cobrança inexistente/removida resolve como sucesso.
      if (err instanceof AsaasPaymentError && err.providerStatusCode === 404) {
        return;
      }
      throw err;
    }
  }

  async refundPayment(providerPaymentId: string): Promise<void> {
    // Sem body = estorno integral (docs estornar-cobranca).
    await this.request(
      'POST',
      `/v3/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      paymentResponseSchema,
    );
  }

  // Provider real não expõe confirmCharge: a confirmação vem do próprio Asaas
  // (webhook/status) e o worker SEMPRE verifica via getChargeStatus antes de creditar.

  // -------------------------------------------------------------------------
  // Cliente Asaas (obrigatório na criação de cobrança)
  // -------------------------------------------------------------------------

  private async resolveCustomerId(input: CreateChargeInput): Promise<string> {
    if (this.customerId) {
      return this.customerId;
    }
    const document = input.payerDocument?.trim();
    const name = input.payerName?.trim();
    if (!document || !name) {
      throw new AsaasPaymentError(
        'Asaas exige um cliente: informe payerName e payerDocument (ou customerId no adapter)',
        { code: 'CUSTOMER_REQUIRED' },
      );
    }
    const externalReference = `aluguei:payer:${document}`;
    const cached = this.customerCache.get(externalReference);
    if (cached) {
      return cached;
    }
    // Prevenção de duplicidade recomendada na doc: buscar por externalReference
    // antes de criar (listar-clientes + criar-novo-cliente).
    const list = await this.request(
      'GET',
      `/v3/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
      customerListResponseSchema,
    );
    const first = list.data[0];
    if (first?.id) {
      this.customerCache.set(externalReference, first.id);
      return first.id;
    }
    const created = await this.request('POST', '/v3/customers', customerResponseSchema, {
      name,
      cpfCnpj: document,
      externalReference,
      // Evita notificações automáticas duplicadas (o domínio cuida das suas).
      notificationDisabled: true,
    });
    this.customerCache.set(externalReference, created.id);
    return created.id;
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            access_token: this.apiKey,
            accept: 'application/json',
            'user-agent': this.userAgent,
            // GET sem body (docs: body em GET → 403).
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new AsaasTimeoutError(this.timeoutMs, method, path);
        }
        throw new AsaasNetworkError(method, path, err);
      }

      const raw: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = errorResponseSchema.safeParse(raw);
        const codes = parsed.success ? parsed.data.errors.map((e) => e.code) : [];
        const first = codes[0] ?? `http_${String(response.status)}`;
        const message =
          (parsed.success && parsed.data.errors[0]?.description) ||
          `Asaas HTTP ${String(response.status)} em ${method} ${path}`;
        throw new AsaasPaymentError(message, {
          code: first,
          providerStatusCode: response.status,
          providerCodes: codes,
          retryable: isRetryableStatus(response.status),
        });
      }

      const parsedBody = schema.safeParse(raw);
      if (!parsedBody.success) {
        // Resposta 2xx fora do contrato: provável indisponibilidade parcial.
        throw new AsaasPaymentError(`Resposta Asaas inválida em ${method} ${path}`, {
          code: 'INVALID_RESPONSE',
          providerStatusCode: response.status,
          retryable: true,
        });
      }
      return parsedBody.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Mapeia o webhook de cobrança do Asaas para o evento interno (compatível com
 * `paymentWebhookEventSchema` em packages/contracts). Eventos sem mapeamento
 * (PAYMENT_CREATED, PAYMENT_UPDATED, chargebacks, PAYMENT_PARTIALLY_REFUNDED…)
 * retornam null e devem ser ignorados — o modelo interno não suporta estorno
 * parcial; chargeback exige tratamento manual/reconciliação.
 */
export function mapAsaasPaymentWebhook(body: unknown): AsaasPaymentWebhookEvent | null {
  const parsed = paymentWebhookBodySchema.parse(body);
  const eventType = WEBHOOK_EVENT_MAP[parsed.event];
  if (!eventType) {
    return null;
  }
  const event: AsaasPaymentWebhookEvent = {
    provider: 'ASAAS',
    eventType,
    providerEventId: parsed.id,
    providerChargeId: parsed.payment.id,
    amountCents: reaisToCents(parsed.payment.value),
  };
  const paidAt = parsed.payment.paymentDate ?? parsed.payment.confirmedDate;
  if (paidAt) {
    event.paidAt = normalizeDate(paidAt);
  }
  return event;
}
