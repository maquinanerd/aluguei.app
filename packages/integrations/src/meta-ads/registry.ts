import { FakeMetaAdsProvider } from './fake.js';
import type { IMetaAdsProvider } from './types.js';

export interface MetaAdsRegistryOptions {
  mode?: string; // dry_run | live
  accessToken?: string;
  fake?: IMetaAdsProvider;
}

/**
 * Seleciona o provider Meta Ads: override injetado > live com credencial
 * (adapter real registrado sem implementação até doc oficial validada) >
 * produção sem credencial → null > dev/test → fake determinístico.
 */
export function getMetaAdsProvider(opts: MetaAdsRegistryOptions = {}): IMetaAdsProvider | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.mode === 'live' && opts.accessToken) {
    // Adapter real exige documentação oficial vigente (Graph API version + scopes +
    // Special Ad Category) — registrado sem adapter até lá (IMPLEMENTED_NOT_LIVE_VERIFIED).
    return null;
  }
  if (opts.mode === 'live') {
    return null; // produção sem credencial: nunca simular anúncio real
  }
  return new FakeMetaAdsProvider();
}
