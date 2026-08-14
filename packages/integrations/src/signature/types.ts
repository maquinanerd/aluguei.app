export type EnvelopeStatus = 'PENDING' | 'SENT' | 'PARTIALLY_SIGNED' | 'SIGNED' | 'FAILED';

export interface EnvelopeParty {
  partyId: string;
  role: 'LANDLORD' | 'TENANT' | 'GUARANTOR';
  signOrder: number;
}

export interface CreateEnvelopeInput {
  contractId: string;
  parties: EnvelopeParty[];
  documentRef: string;
}

export interface CreateEnvelopeResult {
  providerEnvelopeId: string;
}

/** Provider de assinatura eletrônica — Clicksign/D4Sign reais sem credencial ficam sem adapter. */
export interface ISignatureProvider {
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;
  getStatus(providerEnvelopeId: string): Promise<EnvelopeStatus>;
}
