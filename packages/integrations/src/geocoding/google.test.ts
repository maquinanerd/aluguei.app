import { describe, expect, it, vi } from 'vitest';
import { GoogleMapsGeocodingAdapter } from './google.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GoogleMapsGeocodingAdapter', () => {
  it('retorna resultado em status OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        status: 'OK',
        results: [
          {
            formatted_address: 'Av. Paulista, 1000, São Paulo',
            geometry: { location: { lat: -23.5614, lng: -46.6559 } },
          },
        ],
      }),
    );
    const adapter = new GoogleMapsGeocodingAdapter({ apiKey: 'test-key', fetchImpl });
    const result = await adapter.geocode({
      city: 'São Paulo',
      street: 'Av. Paulista',
      number: '1000',
    });
    expect(result).toMatchObject({ lat: -23.5614, lng: -46.6559, confidence: 0.9 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retorna null em ZERO_RESULTS', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ status: 'ZERO_RESULTS', results: [] }));
    const adapter = new GoogleMapsGeocodingAdapter({ apiKey: 'k', fetchImpl });
    await expect(adapter.geocode({ city: 'X' })).resolves.toBeNull();
  });

  it('lança em REQUEST_DENIED', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ status: 'REQUEST_DENIED', results: [] }));
    const adapter = new GoogleMapsGeocodingAdapter({ apiKey: 'k', fetchImpl });
    await expect(adapter.geocode({ city: 'X' })).rejects.toThrow(/REQUEST_DENIED/);
  });
});
