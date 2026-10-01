export type SignatureProviderErrorCode =
  | 'UNSUPPORTED_DOCUMENT_REF'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_INPUT'
  | 'SIGNER_EMAIL_REQUIRED'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'HTTP'
  | 'TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN_STATUS';

/**
 * Erro tipado do provider de assinatura (código estável para tratamento no domínio). A mensagem
 * nunca repete e-mail, nome ou conteúdo do documento: vai para log e para a resposta da API.
 */
export class SignatureProviderError extends Error {
  readonly code: SignatureProviderErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    code: SignatureProviderErrorCode,
    message: string,
    opts?: { status?: number; details?: unknown },
  ) {
    super(message);
    this.name = 'SignatureProviderError';
    this.code = code;
    if (opts?.status !== undefined) {
      this.status = opts.status;
    }
    if (opts?.details !== undefined) {
      this.details = opts.details;
    }
  }
}
