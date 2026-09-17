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
 * dry_run explícito → fake determinístico. Live sem credencial, modo ausente ou desconhecido →
 * null (auditoria 2026-09-10, P1-12: o fake respondia fora de `live`).
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
  if (opts.mode === 'dry_run') {
    return new FakeMetaAdsProvider();
  }
  return null;
}
