import { FakeSignatureProvider } from './fake.js';
import type { ISignatureProvider } from './types.js';

export interface SignatureRegistryOptions {
  provider?: string; // CLICKSIGN | D4SIGN | FAKE
  token?: string;
  fake?: ISignatureProvider;
}

/**
 * Seleciona o provider de assinatura: override injetado > FAKE (dev/test).
 * Produção sem token → null (nunca assinatura fake em prod — 400 "não configurado").
 */
export function getSignatureProvider(
  opts: SignatureRegistryOptions = {},
): ISignatureProvider | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.provider === 'FAKE') {
    return new FakeSignatureProvider();
  }
  if ((opts.provider === 'CLICKSIGN' || opts.provider === 'D4SIGN') && opts.token) {
    // Adapters reais exigem documentação/contrato — registrados sem adapter até lá.
    return null;
  }
  return null;
}
