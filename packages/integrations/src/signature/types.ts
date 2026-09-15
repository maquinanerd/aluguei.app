export type EnvelopeStatus = 'PENDING' | 'SENT' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'FAILED';

export interface EnvelopeParty {
  partyId: string;
  role: 'LANDLORD' | 'TENANT' | 'GUARANTOR';
  signOrder: number;
}

export interface CreateEnvelopeInput {
  contractId: string;
  parties: EnvelopeParty[];
  /** Documento a assinar: PDF em base64, como data URI `data:application/pdf;base64,…`. */
  documentRef: string;
}

export interface CreateEnvelopeResult {
  providerEnvelopeId: string;
}

/** Nome do provider — gravado no envelope e usado pelo webhook para localizá-lo. */
export type SignatureProviderName = 'CLICKSIGN' | 'D4SIGN' | 'FAKE';

/** Provider de assinatura eletrônica — Clicksign/D4Sign reais sem credencial ficam sem adapter. */
export interface ISignatureProvider {
  /**
   * Provider que efetivamente cria o envelope (auditoria 2026-09-10, P1-11): o
   * webhook localiza o envelope por provider + id, então o nome gravado precisa
   * ser o do provider configurado, nunca um valor fixo.
   */
  readonly name: SignatureProviderName;
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;
  getStatus(providerEnvelopeId: string): Promise<EnvelopeStatus>;
}
