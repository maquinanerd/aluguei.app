import type { EmailMessage, EmailSendResult, IEmailSender } from './types.js';

/** Provedor de mentira: guarda as mensagens em memória. Dev e testes; em produção, só com permissão. */
export class FakeEmailSender implements IEmailSender {
  readonly provider = 'FAKE' as const;
  readonly sent: EmailMessage[] = [];
  private falhas: Error[] = [];

  /** A próxima entrega falha com o erro dado (uma vez por chamada). */
  failNext(err: Error): void {
    this.falhas.push(err);
  }

  send(message: EmailMessage): Promise<EmailSendResult> {
    const falha = this.falhas.shift();
    if (falha) {
      return Promise.reject(falha);
    }
    this.sent.push(message);
    return Promise.resolve({ providerMessageId: `fake-${message.id}` });
  }
}
