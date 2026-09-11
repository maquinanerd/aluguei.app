export type PaymentChargeStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';

export interface CreateChargeInput {
  amountCents: number;
  description: string;
  dueDate: string;
  payerName?: string;
  payerDocument?: string;
  /** Referência do pagamento no Aluguei — volta nos eventos e na conciliação. */
  externalReference?: string;
}

export interface CreateChargeResult {
  providerChargeId: string;
  pixQrCode?: string;
  boletoUrl?: string;
}

/** Provider de pagamento — Asaas real sem credencial fica registrado sem adapter. */
export interface IPaymentProvider {
  /** Identifica o provider na tentativa de pagamento e nos eventos recebidos. */
  readonly name: 'FAKE' | 'ASAAS';
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getChargeStatus(providerChargeId: string): Promise<PaymentChargeStatus>;
  cancelCharge(providerChargeId: string): Promise<void>;
  refundPayment(providerPaymentId: string): Promise<void>;
  /**
   * Simulação do pagador, exclusiva do FAKE (dev/E2E): marca a cobrança como
   * paga NO PROVIDER. Provider real não expõe — quem paga é o cliente. Nenhum
   * webhook chama isto: o worker sempre relê o status antes de creditar
   * (auditoria 2026-09-10, P0-02).
   */
  confirmCharge?(providerChargeId: string): Promise<void>;
  /** Cobranças conhecidas pelo provider (conciliação). */
  getProviderCharges?(): Promise<
    Array<{ id: string; amountCents: number; status: PaymentChargeStatus }>
  >;
}
