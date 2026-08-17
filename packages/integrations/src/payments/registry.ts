import { AsaasPaymentProvider } from './asaas.js';
import { FakePaymentProvider } from './fake.js';
import type { IPaymentProvider } from './types.js';

export interface PaymentRegistryOptions {
  provider?: string; // FAKE | ASAAS
  apiKey?: string;
  /** Ambiente do Asaas (default sandbox — sem efeito externo real). */
  env?: 'sandbox' | 'production';
  fake?: IPaymentProvider;
}

/**
 * Seleciona o provider de pagamento: override injetado > FAKE (dev/test).
 * ASAAS com apiKey → adapter real; sem chave → null (rotas 400 "não configurado").
 */
export function getPaymentProvider(opts: PaymentRegistryOptions = {}): IPaymentProvider | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.provider === 'FAKE') {
    return new FakePaymentProvider();
  }
  if (opts.provider === 'ASAAS' && opts.apiKey) {
    return new AsaasPaymentProvider({ apiKey: opts.apiKey, env: opts.env ?? 'sandbox' });
  }
  return null;
}
