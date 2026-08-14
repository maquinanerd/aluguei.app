import { FakePaymentProvider } from './fake.js';
import type { IPaymentProvider } from './types.js';

export interface PaymentRegistryOptions {
  provider?: string; // FAKE | ASAAS
  apiKey?: string;
  fake?: IPaymentProvider;
}

/**
 * Seleciona o provider de pagamento: override injetado > FAKE (dev/test).
 * Asaas real sem credencial/documentação → null (rotas 400 "não configurado").
 */
export function getPaymentProvider(opts: PaymentRegistryOptions = {}): IPaymentProvider | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.provider === 'FAKE') {
    return new FakePaymentProvider();
  }
  if (opts.provider === 'ASAAS' && opts.apiKey) {
    // Adapter real exige documentação/contrato — registrado sem adapter até lá.
    return null;
  }
  return null;
}
