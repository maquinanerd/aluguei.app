import { z } from 'zod';
import { DomainError } from '@aluguei/domain';
import type {
  SendTextResult,
  VerifyWebhookParams,
  VerifyWebhookResult,
  WebhookMessageEvent,
  WhatsAppMessenger,
} from './types.js';

/**
 * Versão vigente documentada da Graph API (changelog oficial de 2026-07-09:
 * v25.0 introduzida em 2026-02-18). Configurável via `apiVersion`.
 * v21.0 ainda disponível; v20.0 expira em 2026-09-24.
 */
export const META_GRAPH_DEFAULT_VERSION = 'v25.0';

/** Códigos de erro da API que indicam falha transitória (retry com backoff). */
const RETRYABLE_PROVIDER_CODES = new Set<number>([
  4, // app atingiu throughput rate limit
  80007, // WABA atingiu rate limit
  130429, // Cloud API message throughput atingido
  131000, // erro desconhecido — docs sugerem tentar de novo
  131016, // serviço temporariamente indisponível
  131056, // pair rate limit (1 msg/6s para o mesmo usuário)
  131057, // conta em manutenção (ex.: upgrade de throughput)
  133004, // servidor temporariamente indisponível
]);

const metaPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              metadata: z.object({ phone_number_id: z.string() }).optional(),
              contacts: z.array(z.object({ wa_id: z.string() })).optional(),
              messages: z
                .array(
                  z.object({
                    from: z.string(),
                    id: z.string(),
                    timestamp: z.string(),
                    type: z.string().optional(),
                    text: z.object({ body: z.string() }).optional(),
                  }),
                )
                .optional(),
            }),
          }),
        ),
      }),
    )
    .default([]),
});

export interface MetaWhatsAppAdapterOptions {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Corpo de erro padrão da Graph API (RFC: `{ "error": { code, message, error_subcode, error_data, fbtrace_id } }`). */
interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { messaging_product?: string; details?: string };
    fbtrace_id?: string;
  };
}

/** Metadata de business phone number retornada por `GET /<PHONE_NUMBER_ID>`. */
interface PhoneNumberInfoResponse {
  verified_name?: string;
  code_verification_status?: string;
  display_phone_number?: string;
  quality_rating?: string;
  platform_type?: string;
  throughput?: { level?: string };
  id?: string;
}

/** Erro tipado da WhatsApp Cloud API (código da Meta preservado para decisão de retry). */
export class WhatsAppProviderError extends DomainError {
  readonly status: number | undefined;
  readonly providerCode: number | undefined;
  readonly providerSubcode: number | undefined;
  readonly providerDetails: string | undefined;
  readonly fbtraceId: string | undefined;
  /** `true` quando a falha é transitória (429/5xx/códigos de throttling) e pode ser retentada. */
  readonly retryable: boolean;

  constructor(info: {
    status?: number | undefined;
    providerCode?: number | undefined;
    providerSubcode?: number | undefined;
    message: string;
    providerDetails?: string | undefined;
    fbtraceId?: string | undefined;
    retryable?: boolean | undefined;
  }) {
    super('PROVIDER_ERROR', info.message, info.providerDetails);
    this.name = 'WhatsAppProviderError';
    this.status = info.status;
    this.providerCode = info.providerCode;
    this.providerSubcode = info.providerSubcode;
    this.providerDetails = info.providerDetails;
    this.fbtraceId = info.fbtraceId;
    this.retryable = info.retryable ?? false;
  }
}

export interface WhatsAppConnectionInfo {
  phoneNumberId: string;
  verifiedName?: string | undefined;
  displayPhoneNumber?: string | undefined;
  qualityRating?: string | undefined;
  codeVerificationStatus?: string | undefined;
  platformType?: string | undefined;
  throughputLevel?: string | undefined;
}

export interface SendTemplateMessageInput {
  to: string;
  templateName: string;
  languageCode: string;
  /** Parâmetros posicionais do corpo (`{{1}}`, `{{2}}`…) na ordem da variável. */
  bodyParameters?: string[];
}

/**
 * Adapter Meta WhatsApp Cloud API (REST + fetch nativo, sem SDK).
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real de homologação.
 * Doc oficial: developers.facebook.com/documentation/business-messaging/whatsapp
 * (ver docs/integrations/WHATSAPP_HOMOLOGATION.md).
 */
export class MetaWhatsAppAdapter implements WhatsAppMessenger {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly verifyToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: MetaWhatsAppAdapterOptions) {
    this.accessToken = opts.accessToken;
    this.phoneNumberId = opts.phoneNumberId;
    this.verifyToken = opts.verifyToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.baseUrl = `https://graph.facebook.com/${opts.apiVersion ?? META_GRAPH_DEFAULT_VERSION}`;
  }

  async sendText(to: string, body: string): Promise<SendTextResult> {
    if (!to) {
      throw new DomainError('INVALID_INPUT', 'Destinatário vazio');
    }
    if (!body || body.length === 0) {
      throw new DomainError('INVALID_INPUT', 'Mensagem vazia');
    }
    if (body.length > 4096) {
      throw new DomainError('INVALID_INPUT', 'Mensagem excede 4096 caracteres');
    }
    const response = await this.request(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
      }),
    });
    return this.messageIdFromResponse(response);
  }

  /**
   * Envio de mensagem de template (única forma de iniciar conversa fora da
   * janela de atendimento — erro 131047). Método extra do adapter; a interface
   * `WhatsAppMessenger` permanece intacta.
   */
  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<SendTextResult> {
    if (!input.to) {
      throw new DomainError('INVALID_INPUT', 'Destinatário vazio');
    }
    if (!input.templateName || input.templateName.length === 0) {
      throw new DomainError('INVALID_INPUT', 'Nome do template vazio');
    }
    if (!input.languageCode || input.languageCode.length < 2) {
      throw new DomainError('INVALID_INPUT', 'Código de idioma do template inválido');
    }
    const components = input.bodyParameters?.length
      ? [{ type: 'body', parameters: input.bodyParameters.map((text) => ({ type: 'text', text })) }]
      : undefined;
    const response = await this.request(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          components,
        },
      }),
    });
    return this.messageIdFromResponse(response);
  }

  /**
   * Valida a conexão com a Meta: `GET /<PHONE_NUMBER_ID>` retorna metadata do
   * número (verified_name, quality_rating, code_verification_status…).
   * Método extra do adapter; a interface `WhatsAppMessenger` permanece intacta.
   */
  async testConnection(): Promise<WhatsAppConnectionInfo> {
    const response = await this.request(`${this.baseUrl}/${this.phoneNumberId}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    const data = (await response.json()) as PhoneNumberInfoResponse;
    return {
      phoneNumberId: data.id ?? this.phoneNumberId,
      verifiedName: data.verified_name,
      displayPhoneNumber: data.display_phone_number,
      qualityRating: data.quality_rating,
      codeVerificationStatus: data.code_verification_status,
      platformType: data.platform_type,
      throughputLevel: data.throughput?.level,
    };
  }

  verifyWebhook(params: VerifyWebhookParams): VerifyWebhookResult {
    if (params.mode === 'subscribe' && params.token !== undefined) {
      const valid = timingSafeEqual(params.token, this.verifyToken);
      if (valid) {
        return { valid: true, challenge: params.challenge ?? null };
      }
    }
    return { valid: false, challenge: null };
  }

  parseWebhookEvent(payload: unknown): WebhookMessageEvent[] {
    const parsed = metaPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return [];
    }
    const events: WebhookMessageEvent[] = [];
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value.messages || value.messages.length === 0) {
          continue; // status/delivery/unknown — fora do contrato da interface
        }
        for (const message of value.messages) {
          events.push({
            waContactId: message.from,
            phoneNumberId: value.metadata?.phone_number_id ?? '',
            waMessageId: message.id,
            from: message.from,
            body: message.text?.body ?? '',
            messageType: message.type ?? 'UNKNOWN',
            timestamp: message.timestamp,
          });
        }
      }
    }
    return events;
  }

  private jsonHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.accessToken}`,
      'content-type': 'application/json',
    };
  }

  /** Executa o fetch com timeout; converte falhas HTTP em `WhatsAppProviderError` tipado. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw await this.providerErrorFromResponse(response);
      }
      return response;
    } catch (error) {
      if (error instanceof WhatsAppProviderError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new WhatsAppProviderError({
          status: 0,
          message: `Meta WhatsApp: timeout após ${String(this.timeoutMs)}ms`,
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Constrói o erro tipado a partir do corpo de erro padrão da Graph API. */
  private async providerErrorFromResponse(response: Response): Promise<WhatsAppProviderError> {
    let message = `Meta WhatsApp HTTP ${String(response.status)}`;
    let providerCode: number | undefined;
    let providerSubcode: number | undefined;
    let providerDetails: string | undefined;
    let fbtraceId: string | undefined;
    try {
      const body = (await response.json()) as MetaErrorBody;
      const error = body.error;
      if (error) {
        message = error.message ?? message;
        providerCode = typeof error.code === 'number' ? error.code : undefined;
        providerSubcode = typeof error.error_subcode === 'number' ? error.error_subcode : undefined;
        providerDetails = error.error_data?.details;
        fbtraceId = error.fbtrace_id;
      }
    } catch {
      // corpo não-JSON: mantém a mensagem genérica com o status HTTP
    }
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      (providerCode !== undefined && RETRYABLE_PROVIDER_CODES.has(providerCode));
    return new WhatsAppProviderError({
      status: response.status,
      providerCode,
      providerSubcode,
      message,
      providerDetails,
      fbtraceId,
      retryable,
    });
  }

  private async messageIdFromResponse(response: Response): Promise<SendTextResult> {
    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id;
    if (!messageId) {
      throw new DomainError('PROVIDER_ERROR', 'Meta WhatsApp: resposta sem message id');
    }
    return { waMessageId: messageId };
  }
}

/** Comparação de token em tempo constante (evita oracle de timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
