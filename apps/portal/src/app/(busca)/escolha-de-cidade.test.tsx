import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Defeito 6 da Onda 0 (rodada de fidelidade): "Alugar" e "Comprar" do cabeçalho levavam a
 * `/alugar` e `/comprar` sem cidade, e a busca respondia 404. Sem cidade, a página agora pede a
 * cidade, com as que têm imóvel naquela finalidade.
 */

const api = vi.hoisted(() => ({
  buscarSitemap: vi.fn(() =>
    Promise.resolve({
      pages: [
        { path: '/alugar/goiania-go', count: 12, lastmod: '2026-09-29' },
        { path: '/alugar/goiania-go/setor-bueno', count: 5, lastmod: '2026-09-29' },
        { path: '/alugar/sao-paulo-sp', count: 30, lastmod: '2026-09-29' },
        { path: '/comprar/curitiba-pr', count: 4, lastmod: '2026-09-29' },
      ],
      listings: [],
      agencies: [],
    }),
  ),
  buscarImoveis: vi.fn(() => Promise.reject(new Error('sem cidade não há busca'))),
}));

vi.mock('@/lib/api', () => api);

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import { PaginaDeBusca, metadataDaBusca } from './busca-pagina';

describe('/alugar e /comprar sem cidade', () => {
  it('não responde 404: lista as cidades com imóvel para alugar, a de mais estoque primeiro', async () => {
    const html = renderToStaticMarkup(
      await PaginaDeBusca({ finalidade: 'alugar', segmentos: undefined, pagina: undefined }),
    );
    expect(html).toContain('href="/alugar/sao-paulo-sp"');
    expect(html).toContain('href="/alugar/goiania-go"');
    expect(html.indexOf('/alugar/sao-paulo-sp')).toBeLessThan(html.indexOf('/alugar/goiania-go'));
    // Só cidades da finalidade, e o bairro não entra como cidade.
    expect(html).not.toContain('/comprar/curitiba-pr');
    expect(html).not.toContain('href="/alugar/goiania-go/setor-bueno"');
    expect(api.buscarImoveis).not.toHaveBeenCalled();
  });

  it('a escolha de cidade não entra no índice', async () => {
    const metadata = await metadataDaBusca('comprar', undefined, undefined);
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
