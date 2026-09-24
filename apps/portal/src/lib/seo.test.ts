import { describe, expect, it } from 'vitest';
import type { PublicListingDetail } from '@aluguei/contracts';
import {
  descricaoDoRecorte,
  jsonLdAnuncio,
  jsonLdTrilha,
  metadataDaPagina,
  robotsMetadata,
  tituloComContagem,
  tituloDoRecorte,
} from './seo';
import type { RecorteDeBusca } from './rotas';

/**
 * SEO do portal (ADR-099). O que estes testes seguram: título estável (sem
 * contagem), robots vindo do servidor, canônica própria e dado estruturado sem
 * endereço exato.
 */

const RECORTE: RecorteDeBusca = {
  finalidade: 'alugar',
  cidade: 'goiania-go',
  bairro: 'setor-bueno',
  tipo: 'apartamento',
  quartos: null,
};

describe('título e descrição', () => {
  it('o título não muda quando a contagem muda', () => {
    const titulo = tituloDoRecorte(RECORTE);
    expect(titulo).toBe('Apartamentos para alugar no Setor Bueno, Goiania, GO');
    expect(titulo).not.toMatch(/\d/);
  });

  it('a contagem fica no H1', () => {
    expect(tituloComContagem(RECORTE, 48)).toBe(
      '48 apartamentos para alugar no Setor Bueno, Goiania, GO',
    );
    expect(tituloComContagem(RECORTE, 1)).toContain('1 apartamento ');
  });

  it('a descrição usa a faixa quando existe, e some com ela quando não existe', () => {
    const comFaixa = descricaoDoRecorte(RECORTE, { minCents: 250_000, maxCents: 480_000 });
    expect(comFaixa).toContain('R$');
    expect(comFaixa).toContain('por mês');

    const semFaixa = descricaoDoRecorte(RECORTE, null);
    expect(semFaixa).not.toContain('R$');
  });

  it('venda não fala em "por mês"', () => {
    const venda = descricaoDoRecorte(
      { ...RECORTE, finalidade: 'comprar' },
      { minCents: 40_000_000, maxCents: 90_000_000 },
    );
    expect(venda).toContain('à venda');
    expect(venda).not.toContain('por mês');
  });
});

describe('robots e canônica', () => {
  it('traduz o robots que veio do servidor', () => {
    expect(robotsMetadata('index, follow')).toEqual({ index: true, follow: true });
    expect(robotsMetadata('noindex, follow')).toEqual({ index: false, follow: true });
  });

  it('a canônica aponta para o próprio caminho', () => {
    const meta = metadataDaPagina({
      titulo: 'Título',
      descricao: 'Descrição',
      caminho: '/alugar/goiania-go/setor-bueno',
      robots: 'index, follow',
    });
    const canonica = meta.alternates?.canonical;
    expect(typeof canonica === 'string' ? canonica : '').toContain(
      '/alugar/goiania-go/setor-bueno',
    );
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});

const ANUNCIO: PublicListingDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'apartamento-setor-bueno',
  title: 'Apartamento no Setor Bueno',
  purpose: 'RENT',
  propertyType: 'APARTMENT',
  neighborhood: 'Setor Bueno',
  neighborhoodSlug: 'setor-bueno',
  city: 'Goiânia',
  citySlug: 'goiania-go',
  state: 'GO',
  monthlyRentCents: 240_000,
  condoFeeCents: 42_000,
  iptuCents: 9_000,
  totalMonthlyCents: 291_000,
  salePriceCents: null,
  pricePerSqmCents: null,
  bedrooms: 2,
  bathrooms: 2,
  parkingSpots: 1,
  areaSqm: 70,
  photoCount: 8,
  coverPath: '/public/media/abc',
  coverCaption: 'Sala',
  publishedAt: '2026-09-20T12:00:00.000Z',
  org: { slug: 'imobiliaria-exemplo', name: 'Imobiliária Exemplo', creci: 'GO-00000' },
  description: 'Apartamento reformado.',
  features: ['Piscina'],
  photos: [{ path: '/public/media/abc', caption: 'Sala', isCover: true }],
  updatedAt: '2026-09-21T12:00:00.000Z',
  neighborhoodMedianCents: 300_000,
};

describe('dados estruturados', () => {
  it('a trilha vira BreadcrumbList com posição', () => {
    const json = jsonLdTrilha([
      { nome: 'Início', caminho: '/' },
      { nome: 'Alugar', caminho: '/alugar' },
    ]);
    expect(json['@type']).toBe('BreadcrumbList');
    const itens = json.itemListElement as { position: number; name: string }[];
    expect(itens[0]?.position).toBe(1);
    expect(itens[1]?.name).toBe('Alugar');
  });

  it('o anúncio vira RealEstateListing sem endereço exato', () => {
    const json = jsonLdAnuncio(ANUNCIO);
    expect(json['@type']).toBe('RealEstateListing');
    const endereco = json.address as Record<string, unknown>;
    expect(endereco.addressLocality).toBe('Goiânia');
    expect(endereco.addressRegion).toBe('GO');
    expect(Object.keys(endereco)).not.toContain('streetAddress');
    expect(Object.keys(endereco)).not.toContain('postalCode');

    const oferta = json.offers as Record<string, unknown>;
    // Preço em reais no dado estruturado, a partir dos centavos guardados.
    expect(oferta.price).toBe('2910.00');
    expect(oferta.priceCurrency).toBe('BRL');
  });

  it('venda usa o preço, não o total do mês', () => {
    const json = jsonLdAnuncio({
      ...ANUNCIO,
      purpose: 'SALE',
      salePriceCents: 74_000_000,
      totalMonthlyCents: null,
    });
    const oferta = json.offers as Record<string, unknown>;
    expect(oferta.price).toBe('740000.00');
  });

  it('sem CRECI, não afirma que existe corretor responsável', () => {
    const json = jsonLdAnuncio({ ...ANUNCIO, org: { ...ANUNCIO.org, creci: null } });
    expect(json.provider).toBeUndefined();
  });
});
