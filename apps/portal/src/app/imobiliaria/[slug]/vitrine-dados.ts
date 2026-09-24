import type { PublicListingCard } from '@aluguei/contracts';
import { buscarImoveis, buscarSitemap } from '@/lib/api';

/**
 * Vitrine: a API pública de busca é por cidade, então a vitrine varre as cidades
 * onde a imobiliária tem anúncio (pelo sitemap) e junta o que é dela. Vale
 * enquanto o volume é pequeno; com escala, vira um endpoint próprio.
 */

export interface Vitrine {
  nome: string;
  creci: string | null;
  cidade: string | null;
  uf: string | null;
  itens: PublicListingCard[];
}

export async function carregarVitrine(
  slug: string,
  purpose: 'RENT' | 'SALE',
): Promise<Vitrine | null> {
  const sitemap = await buscarSitemap().catch(() => ({ pages: [], listings: [], agencies: [] }));
  if (!sitemap.agencies.some((agencia) => agencia.path === `/imobiliaria/${slug}`)) {
    return null;
  }

  const cidades = new Set<string>();
  for (const pagina of sitemap.pages) {
    const partes = pagina.path.split('/').filter((parte) => parte !== '');
    const cidade = partes[1];
    if (partes.length === 2 && cidade !== undefined) {
      cidades.add(cidade);
    }
  }

  const itens: PublicListingCard[] = [];
  let nome: string | null = null;
  let creci: string | null = null;
  let cidadeNome: string | null = null;
  let uf: string | null = null;

  for (const cidade of cidades) {
    const resposta = await buscarImoveis({ purpose, city: cidade }).catch(() => null);
    if (resposta === null) {
      continue;
    }
    for (const item of resposta.items) {
      if (item.org.slug !== slug) {
        continue;
      }
      nome ??= item.org.name;
      creci ??= item.org.creci;
      cidadeNome ??= item.city;
      uf ??= item.state;
      itens.push(item);
    }
  }

  // Sem anúncio nesta finalidade, ainda precisamos do nome: procura na outra.
  if (nome === null) {
    const outra = purpose === 'RENT' ? 'SALE' : 'RENT';
    for (const cidade of cidades) {
      const resposta = await buscarImoveis({ purpose: outra, city: cidade }).catch(() => null);
      const achado = resposta?.items.find((item) => item.org.slug === slug);
      if (achado) {
        nome = achado.org.name;
        creci = achado.org.creci;
        cidadeNome = achado.city;
        uf = achado.state;
        break;
      }
    }
  }

  return nome === null ? null : { nome, creci, cidade: cidadeNome, uf, itens };
}
