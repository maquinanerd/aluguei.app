import { z } from 'zod';
import type {
  PlacesAutocompleteInput,
  PlacesAutocompletePrediction,
  PlacesService,
  StructuredAddress,
} from './types.js';

/**
 * Adapter Google Places API (New) — REST v1 via fetch nativo (sem SDK).
 * - Autocomplete: POST https://places.googleapis.com/v1/places:autocomplete
 * - Place Details: GET https://places.googleapis.com/v1/places/{placeId}
 * - Autenticação: API key no header `X-Goog-Api-Key` (billing obrigatório no projeto).
 *
 * IMPLEMENTED_NOT_LIVE_VERIFIED: sem credencial real de homologação.
 */

const autocompleteResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }).optional(),
            structuredFormat: z
              .object({
                mainText: z.object({ text: z.string() }),
                secondaryText: z.object({ text: z.string() }),
              })
              .optional(),
            types: z.array(z.string()).default([]),
          })
          .optional(),
        queryPrediction: z.unknown().optional(),
      }),
    )
    .default([]),
});

const addressComponentSchema = z.object({
  longText: z.string().optional(),
  shortText: z.string().optional(),
  types: z.array(z.string()),
});

const placeDetailsResponseSchema = z.object({
  addressComponents: z.array(addressComponentSchema).default([]),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

export interface GooglePlacesAdapterOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACE_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places';
const DEFAULT_TIMEOUT_MS = 5000;
/** Só pede os campos que mapeamos — controla custo (billing por SKU). */
const DETAILS_FIELD_MASK = 'places.addressComponents,places.formattedAddress,places.location';

export class GooglePlacesAdapter implements PlacesService {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GooglePlacesAdapterOptions) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async autocomplete(input: PlacesAutocompleteInput): Promise<PlacesAutocompletePrediction[]> {
    const query = input.input.trim();
    if (!query) {
      return [];
    }
    const body: Record<string, string | string[]> = { input: query };
    if (input.regionCode) body.regionCode = input.regionCode;
    if (input.languageCode) body.languageCode = input.languageCode;
    if (input.includedPrimaryTypes && input.includedPrimaryTypes.length > 0) {
      body.includedPrimaryTypes = input.includedPrimaryTypes;
    }
    if (input.includedRegionCodes && input.includedRegionCodes.length > 0) {
      body.includedRegionCodes = input.includedRegionCodes;
    }
    if (input.sessionToken) body.sessionToken = input.sessionToken;

    const payload = await this.request(AUTOCOMPLETE_URL, { method: 'POST', body });
    const parsed = autocompleteResponseSchema.parse(payload);

    return parsed.suggestions.flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) {
        return [];
      }
      return [
        {
          placeId: prediction.placeId,
          mainText: prediction.structuredFormat?.mainText.text ?? prediction.text?.text ?? query,
          secondaryText: prediction.structuredFormat?.secondaryText.text ?? '',
          types: prediction.types,
        },
      ];
    });
  }

  async placeDetails(placeId: string): Promise<StructuredAddress | null> {
    const id = placeId.trim();
    if (!id) {
      return null;
    }
    const url = new URL(`${PLACE_DETAILS_BASE_URL}/${encodeURIComponent(id)}`);
    url.searchParams.set('languageCode', 'pt-BR');
    url.searchParams.set('regionCode', 'BR');

    const payload = await this.request(url.toString(), {
      method: 'GET',
      headers: { 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
    });
    const parsed = placeDetailsResponseSchema.parse(payload);
    return mapToStructuredAddress(parsed);
  }

  private async request(
    url: string,
    init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown },
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'X-Goog-Api-Key': this.apiKey,
    };
    const requestInit: RequestInit = {
      method: init.method,
      signal: controller.signal,
      headers,
    };
    if (init.headers) {
      for (const [key, value] of Object.entries(init.headers)) {
        headers[key] = value;
      }
    }
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      requestInit.body = JSON.stringify(init.body);
    }
    try {
      const response = await this.fetchImpl(url, requestInit);
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(`Google Places HTTP ${String(response.status)}: ${detail}`);
      }
      return (await response.json()) as unknown;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Google Places timeout após ${String(this.timeoutMs)}ms`, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) {
      return 'sem detalhes';
    }
    return text.slice(0, 200);
  } catch {
    return 'sem detalhes';
  }
}

/**
 * Mapeia addressComponents do Google para o formato BR do Aluguei.
 * Referência dos types: https://developers.google.com/maps/documentation/places/web-service/place-types
 * - route → street; street_number (ou subpremise) → number
 * - sublocality* → neighborhood; administrative_area_level_2 (ou locality) → city
 * - administrative_area_level_1 → state (shortText = UF no BR)
 * - postal_code → zipCode; country → country (shortText = código)
 */
function mapToStructuredAddress(
  parsed: z.infer<typeof placeDetailsResponseSchema>,
): StructuredAddress {
  const find = (types: string[]) =>
    parsed.addressComponents.find((component) =>
      component.types.some((type) => types.includes(type)),
    );

  const street = find(['route']);
  const number = find(['street_number']) ?? find(['subpremise']);
  const neighborhood =
    find(['sublocality_level_1']) ??
    find(['sublocality_level_2']) ??
    find(['sublocality_level_3']) ??
    find(['sublocality']);
  const city = find(['administrative_area_level_2']) ?? find(['locality']);
  const state = find(['administrative_area_level_1']);
  const zipCode = find(['postal_code']);
  const country = find(['country']);

  return {
    street: street?.longText ?? null,
    number: number?.longText ?? null,
    neighborhood: neighborhood?.longText ?? null,
    city: city?.longText ?? null,
    state: state?.shortText ?? state?.longText ?? null,
    zipCode: zipCode?.longText ?? null,
    country: country?.shortText ?? country?.longText ?? null,
    lat: parsed.location?.latitude ?? null,
    lng: parsed.location?.longitude ?? null,
  };
}
