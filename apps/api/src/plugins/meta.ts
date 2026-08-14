import fp from 'fastify-plugin';
import { getMetaAdsProvider } from '@aluguei/integrations';
import type { IMetaAdsProvider } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    metaAds: IMetaAdsProvider | null;
  }
}

export interface MetaPluginOptions {
  mode?: string; // dry_run | live
  accessToken?: string;
  meta?: IMetaAdsProvider;
}

/** Registra `app.metaAds` (fake em dev/test; null em produção sem credencial). */
export const metaPlugin = fp<MetaPluginOptions>((app, opts) => {
  const options: Parameters<typeof getMetaAdsProvider>[0] = {};
  if (opts.meta) {
    options.fake = opts.meta;
  }
  if (opts.mode) {
    options.mode = opts.mode;
  }
  if (opts.accessToken) {
    options.accessToken = opts.accessToken;
  }
  app.decorate('metaAds', getMetaAdsProvider(options));
});
