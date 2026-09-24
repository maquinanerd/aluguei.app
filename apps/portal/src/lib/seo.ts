import type { Metadata } from 'next';
import type { PublicListingCard, PublicListingDetail } from '@aluguei/contracts';
import { TIPO_IMOVEL } from './tipos';
import { cidadeLegivel, lugarLegivel, tipoDoDominio } from './rotas';
import type { RecorteDeBusca } from './rotas';
import { formatarValor } from './formato';

/**
 * SEO do portal (`docs/frontend/PORTAL_SEO.md`, ADR-099).
 *
 * Duas regras moram aqui porque são fáceis de errar na pressa:
 * 1. **Título estável, sem contagem.** A contagem fica no H1; título que muda a
 *    cada rastreamento estraga o histórico de CTR.
 * 2. **Robots vem do servidor**, calculado pela contagem real do recorte — a
 *    página nunca decide sozinha que merece ser indexada.
 */

export function baseUrl(): string {
  return process.env.PORTAL_BASE_URL ?? 'http://localhost:3100';
}

export function urlAbsoluta(caminho: string): string {
  return new URL(caminho, baseUrl()).toString();
}

export type Robots = 'index, follow' | 'noindex, follow';

/** Traduz o `robots` da API para o formato que o Next espera. */
export function robotsMetadata(robots: Robots): Metadata['robots'] {
  const indexavel = robots === 'index, follow';
  return { index: indexavel, follow: true };
}

/** "Apartamentos para alugar no Setor Bueno, Goiânia - GO". Sem contagem. */
export function tituloDoRecorte(recorte: RecorteDeBusca): string {
  const acao = recorte.finalidade === 'alugar' ? 'para alugar' : 'à venda';
  const oQue = recorte.tipo === null ? 'Imóveis' : TIPO_IMOVEL[recorte.tipo].plural;
  const comQuartos =
    recorte.quartos === null
      ? ''
      : ` de ${String(recorte.quartos)} quarto${recorte.quartos > 1 ? 's' : ''}`;
  const onde =
    recorte.bairro === null
      ? `em ${cidadeLegivel(recorte.cidade)}`
      : `no ${lugarLegivel(recorte.bairro)}, ${cidadeLegivel(recorte.cidade)}`;
  const inicial = oQue.charAt(0).toUpperCase() + oQue.slice(1);
  return `${inicial}${comQuartos} ${acao} ${onde}`;
}

/** H1 com a contagem real — é o número que a pessoa veio ver. */
export function tituloComContagem(recorte: RecorteDeBusca, total: number): string {
  const acao = recorte.finalidade === 'alugar' ? 'para alugar' : 'à venda';
  const singularPlural =
    recorte.tipo === null
      ? total === 1
        ? 'imóvel'
        : 'imóveis'
      : total === 1
        ? TIPO_IMOVEL[recorte.tipo].nome.toLowerCase()
        : TIPO_IMOVEL[recorte.tipo].plural;
  const comQuartos =
    recorte.quartos === null
      ? ''
      : ` de ${String(recorte.quartos)} quarto${recorte.quartos > 1 ? 's' : ''}`;
  const onde =
    recorte.bairro === null
      ? `em ${cidadeLegivel(recorte.cidade)}`
      : `no ${lugarLegivel(recorte.bairro)}, ${cidadeLegivel(recorte.cidade)}`;
  return `${String(total)} ${singularPlural}${comQuartos} ${acao} ${onde}`;
}

/**
 * Descrição com dado estável do recorte (faixa arredondada), não com contagem:
 * o snippet não deve mudar toda semana.
 */
export function descricaoDoRecorte(
  recorte: RecorteDeBusca,
  stats: { minCents: number | null; maxCents: number | null } | null,
): string {
  const onde =
    recorte.bairro === null
      ? cidadeLegivel(recorte.cidade)
      : `${lugarLegivel(recorte.bairro)}, ${cidadeLegivel(recorte.cidade)}`;
  const acao = recorte.finalidade === 'alugar' ? 'para alugar' : 'à venda';
  if (stats?.minCents == null || stats.maxCents == null) {
    return `Imóveis ${acao} em ${onde}, com o valor total do mês antes de você clicar e o CRECI de quem anuncia.`;
  }
  const de = formatarValor(stats.minCents);
  const ate = formatarValor(stats.maxCents);
  const unidade = recorte.finalidade === 'alugar' ? ' por mês' : '';
  return `Imóveis ${acao} em ${onde}, de ${de} a ${ate}${unidade}. Valor total antes de você clicar e CRECI de quem anuncia.`;
}

export function tituloDoAnuncio(listing: PublicListingDetail): string {
  const tipo = tipoDoDominio(listing.propertyType);
  const nome = tipo === null ? 'Imóvel' : TIPO_IMOVEL[tipo].nome;
  const acao = listing.purpose === 'SALE' ? 'à venda' : 'para alugar';
  const onde = [listing.neighborhood, listing.city].filter(Boolean).join(', ');
  return onde === '' ? `${nome} ${acao}` : `${nome} ${acao} no ${onde}`;
}

export function descricaoDoAnuncio(listing: PublicListingDetail): string {
  const partes: string[] = [];
  if (listing.bedrooms !== null) {
    partes.push(`${String(listing.bedrooms)} quarto${listing.bedrooms > 1 ? 's' : ''}`);
  }
  if (listing.areaSqm !== null) {
    partes.push(`${String(listing.areaSqm)} m²`);
  }
  const valor =
    listing.purpose === 'SALE'
      ? formatarValor(listing.salePriceCents)
      : `${formatarValor(listing.totalMonthlyCents)} por mês (total)`;
  const onde = [listing.neighborhood, listing.city].filter(Boolean).join(', ');
  return [partes.join(', '), valor, onde].filter((parte) => parte !== '').join(' · ');
}

interface Trilho {
  nome: string;
  caminho: string;
}

/** BreadcrumbList — o dado estruturado que ainda rende resultado rico. */
export function jsonLdTrilha(trilhos: Trilho[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trilhos.map((trilho, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: trilho.nome,
      item: urlAbsoluta(trilho.caminho),
    })),
  };
}

/** ItemList da busca: ajuda o buscador a entender que a página é uma lista real. */
export function jsonLdLista(itens: PublicListingCard[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: itens.length,
    itemListElement: itens.map((item, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      url: urlAbsoluta(`/imovel/${item.slug}`),
      name: item.title,
    })),
  };
}

/**
 * RealEstateListing do anúncio. O endereço entra só com bairro, cidade e UF —
 * rua, número, CEP e coordenada nunca saem do portal.
 */
export function jsonLdAnuncio(listing: PublicListingDetail): Record<string, unknown> {
  const precoCents =
    listing.purpose === 'SALE' ? listing.salePriceCents : listing.totalMonthlyCents;
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    url: urlAbsoluta(`/imovel/${listing.slug}`),
    datePosted: listing.publishedAt,
    ...(listing.description === null ? {} : { description: listing.description }),
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'BR',
      ...(listing.city === null ? {} : { addressLocality: listing.city }),
      ...(listing.state === null ? {} : { addressRegion: listing.state }),
      ...(listing.neighborhood === null ? {} : { addressNeighborhood: listing.neighborhood }),
    },
    ...(listing.areaSqm === null
      ? {}
      : { floorSize: { '@type': 'QuantitativeValue', value: listing.areaSqm, unitCode: 'MTK' } }),
    ...(listing.bedrooms === null ? {} : { numberOfBedrooms: listing.bedrooms }),
    ...(listing.bathrooms === null ? {} : { numberOfBathroomsTotal: listing.bathrooms }),
    ...(precoCents === null
      ? {}
      : {
          offers: {
            '@type': 'Offer',
            price: (precoCents / 100).toFixed(2),
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            ...(listing.purpose === 'SALE'
              ? {}
              : { priceSpecification: { '@type': 'UnitPriceSpecification', unitCode: 'MON' } }),
          },
        }),
    ...(listing.org.creci === null
      ? {}
      : {
          provider: {
            '@type': 'RealEstateAgent',
            name: listing.org.name,
            url: urlAbsoluta(`/imobiliaria/${listing.org.slug}`),
            identifier: `CRECI ${listing.org.creci}`,
          },
        }),
  };
}

/** Metadados comuns: canônica própria e robots vindos do servidor. */
export function metadataDaPagina(entrada: {
  titulo: string;
  descricao: string;
  caminho: string;
  robots: Robots;
}): Metadata {
  return {
    title: entrada.titulo,
    description: entrada.descricao,
    alternates: { canonical: urlAbsoluta(entrada.caminho) },
    robots: robotsMetadata(entrada.robots),
    openGraph: {
      title: entrada.titulo,
      description: entrada.descricao,
      url: urlAbsoluta(entrada.caminho),
      type: 'website',
      locale: 'pt_BR',
    },
  };
}
