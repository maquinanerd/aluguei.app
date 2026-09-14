import fp from 'fastify-plugin';
import { GooglePlacesAdapter, PlacesMockService } from '@aluguei/integrations';
import type { PlacesService } from '@aluguei/integrations';

declare module 'fastify' {
  interface FastifyInstance {
    places: PlacesService | null;
  }
}

export interface PlacesPluginOptions {
  apiKey?: string;
  nodeEnv: string;
  places?: PlacesService;
}

/**
 * Registra `app.places` (Places API do Google):
 * - teste: mock determinístico (sem rede);
 * - dev: mock se não houver chave;
 * - produção: Google se houver chave, senão `null` (nunca inventa endereço).
 * O cadastro de imóvel NUNCA é bloqueado pela ausência do serviço (fallback
 * manual obrigatório na UI).
 */
export const placesPlugin = fp<PlacesPluginOptions>((app, opts) => {
  if (opts.places) {
    app.decorate('places', opts.places);
    return;
  }
  if (opts.apiKey) {
    app.decorate('places', new GooglePlacesAdapter({ apiKey: opts.apiKey }));
    return;
  }
  if (opts.nodeEnv === 'production') {
    app.decorate('places', null);
    return;
  }
  app.decorate('places', new PlacesMockService());
});
