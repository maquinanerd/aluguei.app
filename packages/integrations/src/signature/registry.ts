import { ClicksignSignatureProvider } from './clicksign.js';
import { FakeSignatureProvider } from './fake.js';
import type { ISignatureProvider } from './types.js';

export interface SignatureRegistryOptions {
  provider?: string; // CLICKSIGN | D4SIGN | FAKE
  token?: string;
  fake?: ISignatureProvider;
}

/**
 * Seleciona o provider de assinatura: override injetado > FAKE (dev/test).
 * CLICKSIGN com token → adapter real (IMPLEMENTED_NOT_LIVE_VERIFIED — requer
 * conta sandbox/homologação para efeito real). Produção sem token é null
 * (nunca assinatura fake em prod — 400 "não configurado").
 * D4SIGN permanece registrado sem adapter até contrato/documentação.
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
  if (opts.provider === 'CLICKSIGN' && opts.token) {
    return new ClicksignSignatureProvider({ token: opts.token });
  }
  return null;
}
