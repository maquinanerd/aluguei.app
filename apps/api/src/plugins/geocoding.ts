import fp from 'fastify-plugin';
import { GeocodingMockService, GoogleMapsGeocodingAdapter } from '@aluguei/integrations';
import type { GeocodingService } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    geocoding: GeocodingService | null;
  }
}

export interface GeocodingPluginOptions {
  apiKey?: string;
  nodeEnv: string;
  geocoding?: GeocodingService;
}

/**
 * Registra `app.geocoding`:
 * - teste: mock determinístico (sem rede);
 * - dev: mock se não houver chave;
 * - produção: Google se houver chave, senão `null` (geocode nunca inventa dados).
 */
export const geocodingPlugin = fp<GeocodingPluginOptions>((app, opts) => {
  if (opts.geocoding) {
    app.decorate('geocoding', opts.geocoding);
    return;
  }
  if (opts.apiKey) {
    app.decorate('geocoding', new GoogleMapsGeocodingAdapter({ apiKey: opts.apiKey }));
    return;
  }
  if (opts.nodeEnv === 'production') {
    app.decorate('geocoding', null);
    return;
  }
  app.decorate('geocoding', new GeocodingMockService());
});
