import { describe, expect, it, vi } from 'vitest';
import { GooglePlacesAdapter } from './google.js';
import { PlacesMockService } from './mock.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GooglePlacesAdapter.autocomplete', () => {
  it('mapeia suggestions para predictions (structuredFormat)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJabc123',
              structuredFormat: {
                mainText: { text: 'Av. Paulista', matches: [{ startOffset: 0, endOffset: 3 }] },
                secondaryText: { text: 'Bela Vista, São Paulo - SP' },
              },
              types: ['route', 'geocode'],
            },
          },
        ],
      }),
    );
    const adapter = new GooglePlacesAdapter({ apiKey: 'test-key', fetchImpl });
    const predictions = await adapter.autocomplete({ input: 'Av. Paul', regionCode: 'BR' });

    expect(predictions).toEqual([
      {
        placeId: 'ChIJabc123',
        mainText: 'Av. Paulista',
        secondaryText: 'Bela Vista, São Paulo - SP',
        types: ['route', 'geocode'],
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key');
    const body = JSON.parse(init.body as string) as { input: string; regionCode: string };
    expect(body.input).toBe('Av. Paul');
    expect(body.regionCode).toBe('BR');
  });

  it('usa text.text como fallback quando não há structuredFormat', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        suggestions: [
          { placePrediction: { placeId: 'ChIJx', text: { text: 'São Paulo, SP' }, types: [] } },
        ],
      }),
    );
    const adapter = new GooglePlacesAdapter({ apiKey: 'k', fetchImpl });
    const predictions = await adapter.autocomplete({ input: 'São Paulo' });
    expect(predictions[0]?.mainText).toBe('São Paulo, SP');
    expect(predictions[0]?.secondaryText).toBe('');
  });

  it('input vazio → [] sem chamada de rede', async () => {
    const fetchImpl = vi.fn();
    const adapter = new GooglePlacesAdapter({ apiKey: 'k', fetchImpl });
    await expect(adapter.autocomplete({ input: '   ' })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lança erro tipado em resposta HTTP de erro', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"denied"}}', { status: 403 }));
    const adapter = new GooglePlacesAdapter({ apiKey: 'k', fetchImpl });
    await expect(adapter.autocomplete({ input: 'x' })).rejects.toThrow(/Google Places HTTP 403/);
  });
});

describe('GooglePlacesAdapter.placeDetails', () => {
  const detailsBody = {
    formattedAddress: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100, Brasil',
    addressComponents: [
      { longText: 'Av. Paulista', shortText: 'Av. Paulista', types: ['route'] },
      { longText: '1000', shortText: '1000', types: ['street_number'] },
      { longText: 'Bela Vista', shortText: 'Bela Vista', types: ['sublocality_level_1'] },
      { longText: 'São Paulo', shortText: 'São Paulo', types: ['administrative_area_level_2'] },
      { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1'] },
      { longText: '01310-100', shortText: '01310-100', types: ['postal_code'] },
      { longText: 'Brasil', shortText: 'BR', types: ['country'] },
    ],
    location: { latitude: -23.5614, longitude: -46.6559 },
  };

  it('mapeia addressComponents para o formato BR', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(detailsBody));
    const adapter = new GooglePlacesAdapter({ apiKey: 'test-key', fetchImpl });
    const address = await adapter.placeDetails('ChIJabc123');

    expect(address).toEqual({
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
      country: 'BR',
      lat: -23.5614,
      lng: -46.6559,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://places.googleapis.com/v1/places/ChIJabc123?languageCode=pt-BR&regionCode=BR',
    );
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toContain(
      'places.addressComponents',
    );
  });

  it('campos ausentes viram null (componente parcial)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        addressComponents: [
          { longText: 'SP', shortText: 'SP', types: ['administrative_area_level_1'] },
        ],
      }),
    );
    const adapter = new GooglePlacesAdapter({ apiKey: 'k', fetchImpl });
    const address = await adapter.placeDetails('ChIJparcial');
    expect(address).toMatchObject({ state: 'SP', lat: null, lng: null, country: null });
  });

  it('placeId vazio → null sem chamada de rede', async () => {
    const fetchImpl = vi.fn();
    const adapter = new GooglePlacesAdapter({ apiKey: 'k', fetchImpl });
    await expect(adapter.placeDetails('  ')).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lança timeout quando a requisição não responde', async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });
    const adapter = new GooglePlacesAdapter({ apiKey: 'k', fetchImpl, timeoutMs: 10 });
    await expect(adapter.autocomplete({ input: 'x' })).rejects.toThrow(/timeout/);
  });
});

describe('PlacesMockService', () => {
  const service = new PlacesMockService();

  it('autocomplete é determinístico', async () => {
    const a = await service.autocomplete({ input: 'Av. Paulista' });
    const b = await service.autocomplete({ input: 'Av. Paulista' });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]?.placeId).toMatch(/^mock-place-/);
  });

  it('input vazio ou inexistente → []', async () => {
    await expect(service.autocomplete({ input: '' })).resolves.toEqual([]);
    await expect(service.autocomplete({ input: 'nao-existe nada' })).resolves.toEqual([]);
  });

  it('placeDetails é determinístico e em formato BR', async () => {
    const a = await service.placeDetails('mock-place-abc123');
    const b = await service.placeDetails('mock-place-abc123');
    expect(a).toEqual(b);
    expect(a).toMatchObject({ state: 'SP', country: 'BR', city: 'São Paulo' });
    expect(a?.zipCode).toMatch(/^\d{5}-\d{3}$/);
    expect(a?.lat).toBeGreaterThan(-24);
    expect(a?.lat).toBeLessThan(-23);
  });

  it('placeId desconhecido → null', async () => {
    await expect(service.placeDetails('mock-place-notfound')).resolves.toBeNull();
    await expect(service.placeDetails('qualquer-coisa')).resolves.toBeNull();
    await expect(service.placeDetails('')).resolves.toBeNull();
  });
});
