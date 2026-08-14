/** Labels financeiros específicos (PaymentMethod). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão',
  MANUAL: 'Manual',
};

export { CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES, PAYOUT_STATUS_LABELS, RECONCILIATION_STATUS_LABELS, RECONCILIATION_STATUS_TONES } from '@/lib/labels';
export { label } from '@/lib/labels';
