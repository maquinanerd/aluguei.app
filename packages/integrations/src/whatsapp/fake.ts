import { createHash } from 'node:crypto';
import type {
  SendTextResult,
  VerifyWebhookParams,
  VerifyWebhookResult,
  WebhookMessageEvent,
  WhatsAppMessenger,
} from './types.js';

/**
 * Messenger WhatsApp mock (dev/test): determinístico, sem rede.
 * `waMessageId` derivado de (to, body) — retry não duplica; outbox em memória.
 */
export class FakeWhatsAppMessenger implements WhatsAppMessenger {
  readonly outbox: Array<{ to: string; body: string; waMessageId: string }> = [];
  private failNextSend = false;

  constructor(private readonly verifyToken = 'fake-verify-token') {}

  reset(): void {
    this.outbox.length = 0;
    this.failNextSend = false;
  }

  failNext(): void {
    this.failNextSend = true;
  }

  sendText(to: string, body: string): Promise<SendTextResult> {
    if (this.failNextSend) {
      this.failNextSend = false;
      return Promise.reject(new Error('FakeWhatsApp: falha injetada'));
    }
    const waMessageId = `wamid.fake.${createHash('sha256').update(`${to}:${body}`).digest('hex').slice(0, 16)}`;
    this.outbox.push({ to, body, waMessageId });
    return Promise.resolve({ waMessageId });
  }

  verifyWebhook(params: VerifyWebhookParams): VerifyWebhookResult {
    if (params.mode === 'subscribe' && params.token === this.verifyToken) {
      return { valid: true, challenge: params.challenge ?? null };
    }
    return { valid: false, challenge: null };
  }

  parseWebhookEvent(payload: unknown): WebhookMessageEvent[] {
    const raw = payload as {
      entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>;
    };
    const events: WebhookMessageEvent[] = [];
    for (const entry of raw.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const messages = value['messages'] as Array<Record<string, unknown>> | undefined;
        if (!messages) {
          continue;
        }
        for (const message of messages) {
          const text = message['text'] as { body?: string } | undefined;
          const from = message['from'];
          const id = message['id'];
          const type = message['type'];
          const timestamp = message['timestamp'];
          const metadata = value['metadata'] as { phone_number_id?: string } | undefined;
          events.push({
            waContactId: typeof from === 'string' ? from : '',
            phoneNumberId:
              typeof metadata?.phone_number_id === 'string' ? metadata.phone_number_id : '',
            waMessageId: typeof id === 'string' ? id : '',
            from: typeof from === 'string' ? from : '',
            body: text?.body ?? '',
            messageType: typeof type === 'string' ? type : 'UNKNOWN',
            timestamp: typeof timestamp === 'string' ? timestamp : '',
          });
        }
      }
    }
    return events;
  }
}
