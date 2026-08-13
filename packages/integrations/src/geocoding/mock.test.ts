import { describe, expect, it } from 'vitest';
import { GeocodingMockService } from './mock.js';

describe('GeocodingMockService', () => {
  it('é determinístico para o mesmo endereço', async () => {
    const service = new GeocodingMockService();
    const input = { city: 'São Paulo', street: 'Rua A', number: '10' };
    const a = await service.geocode(input);
    const b = await service.geocode(input);
    expect(a).toEqual(b);
    expect(a?.lat).toBeDefined();
    expect(a?.lng).toBeDefined();
  });

  it('retorna null sem cidade', async () => {
    const service = new GeocodingMockService();
    await expect(service.geocode({ city: '' })).resolves.toBeNull();
  });

  it('confiança fixa e faixas plausíveis', async () => {
    const service = new GeocodingMockService();
    const result = await service.geocode({ city: 'Curitiba' });
    expect(result?.confidence).toBe(0.6);
    expect(result?.lat).toBeGreaterThan(-35);
    expect(result?.lat).toBeLessThan(5);
    expect(result?.lng).toBeGreaterThan(-75);
    expect(result?.lng).toBeLessThan(-30);
  });
});
