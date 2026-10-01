import { z } from 'zod';
import { EmailProviderError } from './types.js';
import type { EmailMessage, EmailSendResult, IEmailSender } from './types.js';

export interface ResendEmailSenderOptions {
  apiKey: string;
  /** Remetente verificado no provedor: "AchouImóvel <nao-responda@achouimovel.online>". */
  from: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const respostaDeEnvio = z.object({ id: z.string().min(1) });
const respostaDeErro = z.object({ message: z.string().optional() }).loose();

/** Mensagem de erro curta e sem dado da mensagem: vai para `last_error` e para o log. */
function motivo(status: number, corpo: unknown): string {
  const lido = respostaDeErro.safeParse(corpo);
  const mensagem = lido.success ? lido.data.message : undefined;
  return `Resend HTTP ${String(status)}${mensagem ? `: ${mensagem.slice(0, 200)}` : ''}`;
}

/**
 * Adapter da Resend (API HTTP, `POST /emails`). `IMPLEMENTED_NOT_LIVE_VERIFIED`: sem chave real não
 * há entrega verificada. A chave de idempotência é o id da mensagem na caixa de saída — uma nova
 * tentativa depois de um tempo esgotado não manda o mesmo e-mail duas vezes.
 */
export class ResendEmailSender implements IEmailSender {
  readonly provider = 'RESEND' as const;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ResendEmailSenderOptions) {
    this.apiKey = opts.apiKey;
    this.from = opts.from;
    this.baseUrl = (opts.baseUrl ?? 'https://api.resend.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const controle = new AbortController();
    const prazo = setTimeout(() => {
      controle.abort();
    }, this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': message.id,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: controle.signal,
      });
    } catch (err) {
      if (controle.signal.aborted) {
        throw new EmailProviderError(
          'TIMEOUT',
          `Resend sem resposta em ${String(this.timeoutMs)} ms`,
        );
      }
      throw new EmailProviderError(
        'HTTP',
        `Resend inacessível: ${err instanceof Error ? err.name : 'erro de rede'}`,
      );
    } finally {
      clearTimeout(prazo);
    }

    const corpo: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const lido = respostaDeEnvio.safeParse(corpo);
      if (!lido.success) {
        throw new EmailProviderError('HTTP', 'Resend respondeu sem o id da mensagem', {
          status: res.status,
        });
      }
      return { providerMessageId: lido.data.id };
    }
    if (res.status === 401 || res.status === 403) {
      throw new EmailProviderError('AUTH', motivo(res.status, corpo), { status: res.status });
    }
    if (res.status === 429) {
      throw new EmailProviderError('RATE_LIMIT', motivo(res.status, corpo), { status: res.status });
    }
    if (res.status >= 500) {
      throw new EmailProviderError('HTTP', motivo(res.status, corpo), { status: res.status });
    }
    throw new EmailProviderError('INVALID_INPUT', motivo(res.status, corpo), {
      status: res.status,
    });
  }
}
