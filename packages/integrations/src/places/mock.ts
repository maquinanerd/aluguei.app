import { createHash } from 'node:crypto';
import type {
  PlacesAutocompleteInput,
  PlacesAutocompletePrediction,
  PlacesService,
  StructuredAddress,
} from './types.js';

const NEIGHBORHOODS = ['Bela Vista', 'Vila Mariana', 'Pinheiros', 'Moema', 'Tatuapé'];

/**
 * Mock determinístico de Places (dev/test): predictions e endereços derivados
 * de hash — sem rede, resultados reproduzíveis.
 * Convenções: input vazio ou começando com "nao-existe" → sem predictions;
 * placeId 'mock-place-notfound' ou desconhecido → null em placeDetails.
 * NUNCA usado em produção sem chave: dados falsos são proibidos.
 */
export class PlacesMockService implements PlacesService {
  autocomplete(input: PlacesAutocompleteInput): Promise<PlacesAutocompletePrediction[]> {
    const query = input.input.trim();
    if (!query || query.toLowerCase().startsWith('nao-existe')) {
      return Promise.resolve([]);
    }
    const digest = createHash('sha256').update(`places:autocomplete:${query}`).digest();
    const base = digest.toString('hex').slice(0, 10);
    return Promise.resolve([
      {
        placeId: `mock-place-${base}`,
        mainText: query,
        secondaryText: 'Bela Vista, São Paulo - SP',
        types: ['route', 'geocode'],
      },
      {
        placeId: `mock-place-${base}-2`,
        mainText: `${query} (edifício)`,
        secondaryText: 'Vila Mariana, São Paulo - SP',
        types: ['establishment'],
      },
    ]);
  }

  placeDetails(placeId: string): Promise<StructuredAddress | null> {
    const id = placeId.trim();
    if (!id || id === 'mock-place-notfound' || !id.startsWith('mock-place-')) {
      return Promise.resolve(null);
    }
    const digest = createHash('sha256').update(`places:details:${id}`).digest();
    const streetNumber = 1 + ((digest[0] ?? 0) % 2000);
    const streetId = 1 + ((digest[1] ?? 0) % 50);
    const neighborhood = NEIGHBORHOODS[(digest[2] ?? 0) % NEIGHBORHOODS.length] ?? 'Bela Vista';
    const zipLast = 100 + ((digest[4] ?? 0) % 900);
    const lat = -23.5 - ((digest[5] ?? 0) / 255) * 0.2;
    const lng = -46.6 - ((digest[6] ?? 0) / 255) * 0.2;

    return Promise.resolve({
      street: `Rua Mock ${String(streetId).padStart(2, '0')}`,
      number: String(streetNumber),
      neighborhood,
      city: 'São Paulo',
      state: 'SP',
      zipCode: `0131${String((digest[3] ?? 0) % 10)}-${String(zipLast)}`,
      country: 'BR',
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
  }
}
