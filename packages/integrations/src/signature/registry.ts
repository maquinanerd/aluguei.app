import { AutentiqueSignatureProvider } from './autentique.js';
import { ClicksignSignatureProvider } from './clicksign.js';
import { FakeSignatureProvider } from './fake.js';
import type { ISignatureProvider } from './types.js';

export interface SignatureRegistryOptions {
  provider?: string; // AUTENTIQUE | CLICKSIGN | D4SIGN | FAKE
  token?: string;
  /** Ambiente do provider. Sem valor, sandbox: documento de teste, sem validade jurídica. */
  environment?: 'sandbox' | 'production';
  fake?: ISignatureProvider;
}

/**
 * Seleciona o provider de assinatura: override injetado > FAKE (dev/test).
 * AUTENTIQUE ou CLICKSIGN com token → adapter real (IMPLEMENTED_NOT_LIVE_VERIFIED —
 * requer o token da conta para efeito real; ADR-107). Produção sem token é null
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
  if (opts.provider === 'AUTENTIQUE' && opts.token) {
    return new AutentiqueSignatureProvider({
      token: opts.token,
      sandbox: opts.environment !== 'production',
    });
  }
  if (opts.provider === 'CLICKSIGN' && opts.token) {
    return new ClicksignSignatureProvider({
      token: opts.token,
      sandbox: opts.environment !== 'production',
    });
  }
  return null;
}
