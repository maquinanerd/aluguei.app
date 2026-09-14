import { FakeScreeningProvider } from './fake.js';
import { SerasaScreeningProvider } from './serasa.js';
import type { IScreeningProvider } from './types.js';

export interface ScreeningRegistryOptions {
  provider?: string; // SERASA | SPC | FAKE
  clientId?: string;
  clientSecret?: string;
  fake?: FakeScreeningProvider;
}

/**
 * Seleciona o provider de screening: override injetado > FAKE (dev/test).
 * SERASA com clientId/clientSecret → adapter esqueleto que valida configuração
 * e falha de forma TIPADA (BLOCKED_PROVIDER_CONTRACT: endpoint/autenticação
 * exigem o layout do produto contratado). Sem credencial → null (job falha com
 * "provider não configurado"; nunca inventa endpoints).
 */
export function getScreeningProvider(
  opts: ScreeningRegistryOptions = {},
): IScreeningProvider | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.provider === 'FAKE') {
    return new FakeScreeningProvider();
  }
  if (opts.provider === 'SERASA' && opts.clientId && opts.clientSecret) {
    return new SerasaScreeningProvider({
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
    });
  }
  return null;
}
