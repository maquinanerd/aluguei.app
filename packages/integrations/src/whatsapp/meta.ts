import { z } from 'zod';
import { DomainError } from '@aluguei/domain';
import type {
  SendTextResult,
  VerifyWebhookParams,
  VerifyWebhookResult,
  WebhookMessageEvent,
  WhatsAppMessenger,
} from './types.js';

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

/**
 * Adapter Meta WhatsApp Cloud API (REST + fetch nativo, sem SDK).
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real de homologação.
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
    this.baseUrl = `https://graph.facebook.com/${opts.apiVersion ?? 'v21.0'}`;
  }

  async sendText(to: string, body: string): Promise<SendTextResult> {
    if (!body || body.length === 0) {
      throw new DomainError('INVALID_INPUT', 'Mensagem vazia');
    }
    if (body.length > 4096) {
      throw new DomainError('INVALID_INPUT', 'Mensagem excede 4096 caracteres');
    }
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      });
      if (!response.ok) {
        throw new DomainError('PROVIDER_ERROR', `Meta WhatsApp HTTP ${String(response.status)}`);
      }
      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      const messageId = data.messages?.[0]?.id;
      if (!messageId) {
        throw new DomainError('PROVIDER_ERROR', 'Meta WhatsApp: resposta sem message id');
      }
      return { waMessageId: messageId };
    } finally {
      clearTimeout(timer);
    }
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
          continue; // status/delivery/unknown
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
