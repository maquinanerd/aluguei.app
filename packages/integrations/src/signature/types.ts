export type EnvelopeStatus = 'PENDING' | 'SENT' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'FAILED';

export interface EnvelopeParty {
  partyId: string;
  role: 'LANDLORD' | 'TENANT' | 'GUARANTOR' | 'SELLER' | 'BUYER';
  signOrder: number;
  /** Nome no cadastro da pessoa. Fica no produto: o provider recebe só o e-mail. */
  name: string;
  /** Primeiro e-mail do cadastro da pessoa; o provider real manda o pedido de assinatura por ele. */
  email: string | null;
}

export interface CreateEnvelopeInput {
  contractId: string;
  /** Nome do documento no provider ("Contrato de locação · versão 2"), sem dado pessoal. */
  title: string;
  parties: EnvelopeParty[];
  /** Documento a assinar: PDF em base64, como data URI `data:application/pdf;base64,…`. */
  documentRef: string;
}

/** Signatário como o provider o identifica — o webhook usa o id para achar a parte. */
export interface EnvelopeSigner {
  signOrder: number;
  providerSignerId: string;
}

export interface CreateEnvelopeResult {
  providerEnvelopeId: string;
  /** Presente quando o provider identifica cada assinatura por um id próprio (Autentique, Clicksign). */
  signers?: EnvelopeSigner[];
}

/** Nome do provider — gravado no envelope e usado pelo webhook para localizá-lo. */
export type SignatureProviderName = 'AUTENTIQUE' | 'CLICKSIGN' | 'D4SIGN' | 'FAKE';

/** Provider de assinatura eletrônica — D4Sign real sem credencial fica sem adapter. */
export interface ISignatureProvider {
  /**
   * Provider que efetivamente cria o envelope (auditoria 2026-09-10, P1-11): o
   * webhook localiza o envelope por provider + id, então o nome gravado precisa
   * ser o do provider configurado, nunca um valor fixo.
   */
  readonly name: SignatureProviderName;
  /** O pedido de assinatura sai por e-mail: toda parte precisa ter e-mail no cadastro. */
  readonly requiresSignerEmail: boolean;
  /** Documento sem validade jurídica (FAKE e sandbox): o painel mostra o "modo de teste". */
  readonly testOnly: boolean;
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;
  getStatus(providerEnvelopeId: string): Promise<EnvelopeStatus>;
}
