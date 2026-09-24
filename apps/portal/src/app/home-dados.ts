import type { PublicListingCard } from '@aluguei/contracts';
import { buscarImoveis, buscarSitemap } from '@/lib/api';
import { cidadeLegivel, tipoDoDominio } from '@/lib/rotas';
import type { TipoImovel } from '@/lib/tipos';

/**
 * Dados da Home, tirados do que existe de verdade: as cidades e os tipos vêm da
 * contagem real do sitemap e da busca. Nada aqui é número fixo na página.
 */

export interface CidadeComEstoque {
  slug: string;
  nome: string;
  total: number;
}

export interface TipoComEstoque {
  tipo: TipoImovel;
  total: number;
  href: string;
}

export interface DadosDaHome {
  cidades: CidadeComEstoque[];
  tipos: TipoComEstoque[];
  recentes: PublicListingCard[];
}

export async function carregarHome(): Promise<DadosDaHome> {
  const sitemap = await buscarSitemap().catch(() => ({
    pages: [],
    listings: [],
    agencies: [],
  }));

  // Cidades: os recortes de cidade do sitemap (`/alugar/[cidade]`), que já são
  // só os que têm anúncio suficiente para existir no índice.
  const porCidade = new Map<string, number>();
  for (const pagina of sitemap.pages) {
    const partes = pagina.path.split('/').filter((parte) => parte !== '');
    if (partes.length !== 2) {
      continue;
    }
    const cidade = partes[1];
    if (cidade === undefined) {
      continue;
    }
    porCidade.set(cidade, Math.max(porCidade.get(cidade) ?? 0, pagina.count));
  }
  const cidades: CidadeComEstoque[] = [...porCidade.entries()]
    .map(([slug, total]) => ({ slug, nome: cidadeLegivel(slug), total }))
    .sort((a, b) => b.total - a.total);

  const principal = cidades[0];
  if (!principal) {
    return { cidades, tipos: [], recentes: [] };
  }

  // Recentes e tipos saem da cidade com mais estoque — é o que a Home tem para
  // mostrar hoje, sem inventar destaque.
  const busca = await buscarImoveis({ purpose: 'RENT', city: principal.slug }).catch(() => null);
  if (busca === null) {
    return { cidades, tipos: [], recentes: [] };
  }

  const contagemPorTipo = new Map<TipoImovel, number>();
  for (const item of busca.items) {
    const tipo = tipoDoDominio(item.propertyType);
    if (tipo === null) {
      continue;
    }
    contagemPorTipo.set(tipo, (contagemPorTipo.get(tipo) ?? 0) + 1);
  }

  const tipos: TipoComEstoque[] = [...contagemPorTipo.entries()]
    .map(([tipo, total]) => ({
      tipo,
      total,
      href: `/alugar/${principal.slug}/${tipo}`,
    }))
    .sort((a, b) => b.total - a.total);

  return { cidades, tipos, recentes: busca.items.slice(0, 8) };
}
