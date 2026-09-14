import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddressSearch, predictionDescription, structuredAddressToFields } from './address-search';
import type { PlacesAddress, PlacesPrediction } from './address-search';

// apiClient é mockado: o componente nunca toca a rede nos testes.
vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}));

describe('address-search (autocomplete de endereço)', () => {
  it('monta o combobox com ARIA de listbox fechado e sem busca em voo', () => {
    const html = renderToStaticMarkup(<AddressSearch onPick={() => {}} />);
    expect(html).toContain('Buscar endereço (Google Places)');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    // Lista de sugestões só aparece após busca (input >= 3 chars).
    expect(html).not.toContain('role="listbox"');
    // Sem erro inicial: aviso de fallback oculto.
    expect(html).not.toContain('Busca indisponível');
  });
});

describe('helpers de endereço', () => {
  it('predictionDescription junta mainText e secondaryText', () => {
    const p: PlacesPrediction = {
      placeId: 'mock-place-1',
      mainText: 'Rua A',
      secondaryText: 'Bela Vista, São Paulo - SP',
      types: ['route'],
    };
    expect(predictionDescription(p)).toBe('Rua A · Bela Vista, São Paulo - SP');
  });

  it('predictionDescription ignora partes vazias', () => {
    const p: PlacesPrediction = {
      placeId: 'mock-place-2',
      mainText: 'São Paulo',
      secondaryText: '',
      types: ['locality'],
    };
    expect(predictionDescription(p)).toBe('São Paulo');
  });

  it('structuredAddressToFields normaliza null para string vazia', () => {
    const address: PlacesAddress = {
      street: 'Rua Mock 01',
      number: null,
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: null,
      country: 'BR',
      lat: -23.55,
      lng: -46.63,
    };
    expect(structuredAddressToFields(address)).toEqual({
      street: 'Rua Mock 01',
      number: '',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '',
      country: 'BR',
    });
  });
});
