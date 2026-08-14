export type PaymentChargeStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';

export interface CreateChargeInput {
  amountCents: number;
  description: string;
  dueDate: string;
  payerName?: string;
  payerDocument?: string;
}

export interface CreateChargeResult {
  providerChargeId: string;
  pixQrCode?: string;
  boletoUrl?: string;
}

/** Provider de pagamento — Asaas real sem credencial fica registrado sem adapter. */
export interface IPaymentProvider {
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getChargeStatus(providerChargeId: string): Promise<PaymentChargeStatus>;
  cancelCharge(providerChargeId: string): Promise<void>;
  refundPayment(providerPaymentId: string): Promise<void>;
}
