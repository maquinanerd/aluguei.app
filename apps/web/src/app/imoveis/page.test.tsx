import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/public-api', () => ({
  fetchPublicListings: vi.fn().mockResolvedValue({
    listings: [
      {
        id: 'l1',
        slug: 'apto-paulista',
        title: 'Apartamento na Paulista',
        description: null,
        status: 'PUBLISHED',
        priceCents: 350000,
        propertyType: 'APARTMENT',
        totalAreaSqm: 60,
        builtAreaSqm: null,
        bedrooms: 2,
        bathrooms: 1,
        parkingSpots: 1,
        furnished: true,
        petsAllowed: true,
        features: ['AC'],
        publicAddress: {
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          country: 'Brasil',
        },
        media: [{ kind: 'PHOTO', isPublic: true }],
        publishedAt: '2026-08-01T00:00:00.000Z',
        orgSlug: 'imobiliaria-demo',
      },
    ],
    total: 1,
  }),
  formatBRL: (cents: number | null) => (cents === null ? '—' : `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`),
}));

import ImoveisPage from './page';

describe('ImoveisPage', () => {
  it('renderiza lista de imóveis públicos', async () => {
    const html = renderToStaticMarkup(await ImoveisPage());
    expect(html).toContain('Apartamento na Paulista');
    expect(html).toContain('3.500,00');
    expect(html).toContain('Bela Vista');
    expect(html).toContain('href="/imoveis/apto-paulista"');
  });
});
