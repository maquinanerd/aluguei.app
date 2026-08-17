import { FakeMetaAdsProvider } from './fake.js';
import { MetaGraphAdsProvider } from './graph.js';
import type { IMetaAdsProvider } from './types.js';

export interface MetaAdsRegistryOptions {
  mode?: string; // dry_run | live
  accessToken?: string;
  adAccountId?: string;
  apiVersion?: string;
  fake?: IMetaAdsProvider;
}

/**
 * Seleciona o provider Meta Ads: override injetado > live com credencial
 * (adapter Graph real — IMPLEMENTED_NOT_LIVE_VERIFIED; falhas de integração
 * (ex.: image_hash/página) são erros tipados, nunca efeito externo inventado) >
 * produção sem credencial → null > dev/test → fake determinístico.
 * Campanhas reais são sempre criadas PAUSADAS e ativadas por intenção explícita.
 */
export function getMetaAdsProvider(opts: MetaAdsRegistryOptions = {}): IMetaAdsProvider | null {
  if (opts.fake) {
    return opts.fake;
  }
  if (opts.mode === 'live' && opts.accessToken) {
    const providerOptions: ConstructorParameters<typeof MetaGraphAdsProvider>[0] = {
      accessToken: opts.accessToken,
      adAccountId: opts.adAccountId ?? '',
    };
    if (opts.apiVersion) {
      providerOptions.apiVersion = opts.apiVersion;
    }
    return new MetaGraphAdsProvider(providerOptions);
  }
  if (opts.mode === 'live') {
    return null; // produção sem credencial: nunca simular anúncio real
  }
  return new FakeMetaAdsProvider();
}
