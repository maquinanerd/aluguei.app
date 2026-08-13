import { createHash } from 'node:crypto';
import type { GeocodeInput, GeocodeResult, GeocodingService } from './types.js';

/**
 * Mock determinístico de geocodificação (dev/test): deriva lat/lng estáveis
 * do hash do endereço — sem rede, resultados reproduzíveis.
 * NUNCA usado em produção sem chave: lá o adapter retorna null (dados falsos
 * são proibidos).
 */
export class GeocodingMockService implements GeocodingService {
  geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
    const key = `${input.street ?? ''}|${input.number ?? ''}|${input.neighborhood ?? ''}|${input.city}|${input.state ?? ''}|${input.zipCode ?? ''}|${input.country ?? ''}`;
    if (!input.city) {
      return Promise.resolve(null);
    }
    const digest = createHash('sha256').update(key).digest();
    // Projeta o hash em uma faixa plausível: lat [-33, 5], lng [-74, -34] (BR/AR).
    const lat = -33 + ((digest[0] ?? 0) / 255) * 38;
    const lng = -74 + ((digest[1] ?? 0) / 255) * 40;
    return Promise.resolve({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      formattedAddress:
        `${input.street ?? ''}${input.number ? `, ${input.number}` : ''}, ${input.city}`.trim(),
      confidence: 0.6,
    });
  }
}
