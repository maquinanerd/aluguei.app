/**
 * Google Places API (Web Service) — Places API (New), REST v1.
 * Contrato local desacoplado do provider (sem SDK).
 *
 * Docs consultadas (2026-08-17):
 * - Autocomplete (New): https://developers.google.com/maps/documentation/places/web-service/autocomplete
 * - Place Details (New): https://developers.google.com/maps/documentation/places/web-service/place-details
 * - Usage and Billing: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
 */

export interface PlacesAutocompleteInput {
  /** Texto digitado pelo usuário (obrigatório). */
  input: string;
  /** Código de região CLDR (ex.: 'BR') — afeta formatação e ranking. */
  regionCode?: string;
  /** Idioma dos resultados (ex.: 'pt-BR'). */
  languageCode?: string;
  /** Tipos primários incluídos (máx. 5), ex.: ['(cities)']. */
  includedPrimaryTypes?: string[];
  /** Regiões CLDR restritas (máx. 15). */
  includedRegionCodes?: string[];
  /** Token de sessão para billing (base64 url-safe, <= 36 chars; UUID v4 recomendado). */
  sessionToken?: string;
}

export interface PlacesAutocompletePrediction {
  /** Place ID do Google — usado em placeDetails. */
  placeId: string;
  /** Texto principal (nome da rua/cidade). */
  mainText: string;
  /** Texto secundário (bairro, cidade, UF). */
  secondaryText: string;
  /** Tipos do place (Google Places Types). */
  types: string[];
}

/** Endereço estruturado no formato BR (padrão Aluguei). */
export interface StructuredAddress {
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  /** UF para BR (ex.: 'SP'). */
  state: string | null;
  zipCode: string | null;
  /** Código do país (ex.: 'BR'). */
  country: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Serviço de Places — implementado por GooglePlacesAdapter (live) ou
 * PlacesMockService (dev/test).
 */
export interface PlacesService {
  autocomplete(input: PlacesAutocompleteInput): Promise<PlacesAutocompletePrediction[]>;
  placeDetails(placeId: string): Promise<StructuredAddress | null>;
}
