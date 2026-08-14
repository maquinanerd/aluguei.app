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
  /**
   * Hook opcional usado pelo webhook de pagamento: confirma a cobrança no
   * provider (modo FAKE/sandbox). Provider real não expõe — a confirmação
   * vem do próprio provider. O worker SEMPRE confirma via getChargeStatus
   * antes de creditar (P1 da auditoria final).
   */
  confirmCharge?(providerChargeId: string): Promise<void>;
}
