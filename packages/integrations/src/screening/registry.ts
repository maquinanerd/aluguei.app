import { FakeScreeningProvider } from './fake.js';
import type { IScreeningProvider } from './types.js';

export interface ScreeningRegistryOptions {
  provider?: string; // SERASA | SPC | FAKE
  fake?: FakeScreeningProvider;
}

/**
 * Seleciona o provider de screening: override injetado > FAKE (dev/test).
 * Serasa/SPC reais exigem documentação/credencial — sem isso retorna null
 * (job falha com "provider não configurado"; nunca inventa endpoints).
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
  return null;
}
