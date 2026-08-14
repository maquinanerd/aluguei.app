export interface WebhookMessageEvent {
  waContactId: string;
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  body: string;
  messageType: string;
  timestamp: string;
}

export interface SendTextResult {
  waMessageId: string;
}

export interface VerifyWebhookParams {
  mode?: string;
  token?: string;
  challenge?: string;
}

export interface VerifyWebhookResult {
  valid: boolean;
  challenge: string | null;
}

/** Messenger WhatsApp — implementado por Meta (live) ou Fake (dev/test). */
export interface WhatsAppMessenger {
  sendText(to: string, body: string): Promise<SendTextResult>;
  verifyWebhook(params: VerifyWebhookParams): VerifyWebhookResult;
  /** Normaliza payload do webhook para eventos de mensagem; [] p/ status/desconhecido. */
  parseWebhookEvent(payload: unknown): WebhookMessageEvent[];
}
