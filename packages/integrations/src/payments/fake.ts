import { createHash } from 'node:crypto';
import type {
  CreateChargeInput,
  CreateChargeResult,
  IPaymentProvider,
  PaymentChargeStatus,
} from './types.js';

/** Provider mock de pagamento: chargeId determinístico por hash; status transicionável. */
export class FakePaymentProvider implements IPaymentProvider {
  private readonly statuses = new Map<string, PaymentChargeStatus>();
  private readonly charges: Array<{ id: string; amountCents: number }> = [];

  createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const providerChargeId = `pc.fake.${createHash('sha256')
      .update(`${String(input.amountCents)}:${input.dueDate}`)
      .digest('hex')
      .slice(0, 12)}`;
    this.statuses.set(providerChargeId, 'PENDING');
    this.charges.push({ id: providerChargeId, amountCents: input.amountCents });
    return Promise.resolve({
      providerChargeId,
      pixQrCode: `00020126580014BR.GOV.BCB.PIX0136fake-${providerChargeId}5204000053039865802BR`,
      boletoUrl: `https://fake-bank.example/boleto/${providerChargeId}`,
    });
  }

  getChargeStatus(providerChargeId: string): Promise<PaymentChargeStatus> {
    return Promise.resolve(this.statuses.get(providerChargeId) ?? 'PENDING');
  }

  /** Confirma a cobrança no provider (webhook FAKE) — o worker só credita se CONFIRMED. */
  confirmCharge(providerChargeId: string): Promise<void> {
    this.statuses.set(providerChargeId, 'CONFIRMED');
    return Promise.resolve();
  }

  cancelCharge(providerChargeId: string): Promise<void> {
    this.statuses.set(providerChargeId, 'FAILED');
    return Promise.resolve();
  }

  refundPayment(providerPaymentId: string): Promise<void> {
    this.statuses.set(providerPaymentId, 'REFUNDED');
    return Promise.resolve();
  }

  /** Para reconciliação: lista charges conhecidas do provider no período. */
  getProviderCharges(): Array<{ id: string; amountCents: number }> {
    return this.charges.map((c) => ({ ...c }));
  }
}
