import { AutentiqueSignatureProvider } from './autentique.js';
import { FakeSignatureProvider } from './fake.js';
import type { ISignatureProvider } from './types.js';

export interface SignatureRegistryOptions {
  provider?: string; // AUTENTIQUE | D4SIGN | FAKE
  token?: string;
  /** Ambiente da Autentique. Sem valor, sandbox: documento de teste, sem custo e sem validade. */
  environment?: 'sandbox' | 'production';
  fake?: ISignatureProvider;
}

/**
 * Seleciona o provider de assinatura: override injetado > FAKE (dev/test).
 * AUTENTIQUE com token → adapter real (IMPLEMENTED_NOT_LIVE_VERIFIED — requer
 * o token da conta para efeito real). Produção sem token é null
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
  return null;
}
