import { FakeEmailSender } from './fake.js';
import { ResendEmailSender } from './resend.js';
import type { IEmailSender } from './types.js';

export interface EmailRegistryOptions {
  provider?: string | undefined; // RESEND | FAKE
  apiKey?: string | undefined;
  from?: string | undefined;
  fake?: IEmailSender;
}

/**
 * Escolhe quem entrega os e-mails da caixa de saída: override injetado > FAKE > RESEND com chave e
 * remetente. Sem provedor (o padrão), `null`: nada sai e a mensagem fica na caixa de saída, como
 * antes (D6). A configuração recusa RESEND sem chave em produção e FAKE sem permissão.
 */
export function getEmailSender(opts: EmailRegistryOptions = {}): IEmailSender | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.provider === 'FAKE') {
    return new FakeEmailSender();
  }
  if (opts.provider === 'RESEND' && opts.apiKey && opts.from) {
    return new ResendEmailSender({ apiKey: opts.apiKey, from: opts.from });
  }
  return null;
}
