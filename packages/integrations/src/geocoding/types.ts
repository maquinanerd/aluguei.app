export interface GeocodeInput {
  street?: string;
  number?: string;
  neighborhood?: string;
  city: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress?: string;
  confidence: number;
}

/** Serviço de geocodificação — implementado por Google Maps (live) ou mock (dev/test). */
export interface GeocodingService {
  geocode(input: GeocodeInput): Promise<GeocodeResult | null>;
}
