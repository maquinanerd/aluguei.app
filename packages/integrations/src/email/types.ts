/**
 * Entrega de e-mail sobre a caixa de saída (B28, D6 b, ADR-105). A API grava a mensagem em
 * `email_outbox`; o worker entrega pelo provedor configurado. Sem provedor, nada sai — a caixa de
 * saída continua sendo o registro.
 */

export type EmailProviderName = 'RESEND' | 'FAKE';

export interface EmailMessage {
  /** Id da mensagem na caixa de saída: é também a chave de idempotência no provedor. */
  id: string;
  to: string;
  subject: string;
  /** Texto puro. O corpo pode ter link com token: nunca vai para log nem auditoria. */
  text: string;
}

export interface EmailSendResult {
  /** Id da mensagem no provedor, para conferir a entrega no painel dele. */
  providerMessageId: string;
}

export interface IEmailSender {
  readonly provider: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type EmailProviderErrorCode = 'AUTH' | 'INVALID_INPUT' | 'RATE_LIMIT' | 'HTTP' | 'TIMEOUT';

/**
 * Erro tipado do provedor. `retryable` diz se vale tentar de novo (limite, instabilidade, tempo
 * esgotado); chave errada e mensagem recusada não melhoram com nova tentativa.
 */
export class EmailProviderError extends Error {
  readonly code: EmailProviderErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: EmailProviderErrorCode, message: string, opts: { status?: number } = {}) {
    super(message);
    this.name = 'EmailProviderError';
    this.code = code;
    this.retryable = code === 'RATE_LIMIT' || code === 'HTTP' || code === 'TIMEOUT';
    if (opts.status !== undefined) {
      this.status = opts.status;
    }
  }
}
