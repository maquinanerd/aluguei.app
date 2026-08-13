import { z } from 'zod';
import type { GeocodeInput, GeocodeResult, GeocodingService } from './types.js';

const geocodeResponseSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        formatted_address: z.string().optional(),
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
        }),
      }),
    )
    .default([]),
});

export interface GoogleMapsGeocodingOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Adapter Google Maps Geocoding (REST + fetch nativo, sem SDK).
 * Sem chave ou com status ZERO_RESULTS → null; erros de cota/negado → throw tipado.
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real de homologação.
 */
export class GoogleMapsGeocodingAdapter implements GeocodingService {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GoogleMapsGeocodingOptions) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  async geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
    const address = [
      input.street && input.number
        ? `${input.street}, ${input.number}`
        : (input.street ?? undefined),
      input.neighborhood,
      input.city,
      input.state,
      input.zipCode,
      input.country,
    ]
      .filter((part): part is string => part !== undefined && part.length > 0)
      .join(', ');

    if (!address) {
      return null;
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Google Geocoding HTTP ${String(response.status)}`);
      }
      const body: unknown = await response.json();
      const parsed = geocodeResponseSchema.parse(body);

      if (parsed.status === 'ZERO_RESULTS') {
        return null;
      }
      if (parsed.status !== 'OK') {
        throw new Error(`Google Geocoding status: ${parsed.status}`);
      }
      const first = parsed.results[0];
      if (!first) {
        return null;
      }
      const result: GeocodeResult = {
        lat: first.geometry.location.lat,
        lng: first.geometry.location.lng,
        confidence: 0.9,
      };
      if (first.formatted_address) {
        result.formattedAddress = first.formatted_address;
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}
