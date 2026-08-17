export type AiProviderKind = 'openai' | 'gemini';

export type AiProviderErrorKind =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'HTTP'
  | 'INVALID_JSON'
  | 'INVALID_RESPONSE'
  | 'MEDIA_FETCH';

export interface AiProviderErrorOptions {
  kind: AiProviderErrorKind;
  provider: AiProviderKind;
  statusCode?: number;
  retryable?: boolean;
}

/**
 * Erro tipado de chamada a um provider de IA (OpenAI/Gemini).
 * Nunca contém a chave de API nem o corpo integral da resposta.
 * O chamador (gateway/worker) usa `onError` para observabilidade e SEMPRE
 * continua o fluxo com o fallback determinístico — IA nunca bloqueia atendimento.
 */
export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;
  readonly provider: AiProviderKind;
  readonly statusCode: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, opts: AiProviderErrorOptions) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.statusCode = opts.statusCode;
    this.retryable = opts.retryable ?? false;
  }
}
