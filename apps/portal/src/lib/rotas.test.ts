import { describe, expect, it } from 'vitest';
import {
  caminhoDoRecorte,
  cidadeLegivel,
  lerRecorte,
  lugarLegivel,
  tipoDoDominio,
  TIPO_NO_DOMINIO,
} from './rotas';
import { imovelDaApi } from './adaptar';
import type { PublicListingCard } from '@aluguei/contracts';

/**
 * URL das páginas de busca (ADR-099). A leitura precisa ser determinística: o
 * segmento que casa com um tipo é tipo, o que não casa é bairro. Caminho fora do
 * padrão devolve nulo, e a página responde 404 em vez de inventar um recorte.
 */
describe('leitura do caminho da busca', () => {
  it('cidade sozinha', () => {
    expect(lerRecorte('alugar', ['goiania-go'])).toEqual({
      finalidade: 'alugar',
      cidade: 'goiania-go',
      bairro: null,
      tipo: null,
      quartos: null,
    });
  });

  it('cidade e bairro', () => {
    expect(lerRecorte('alugar', ['goiania-go', 'setor-bueno'])?.bairro).toBe('setor-bueno');
  });

  it('cidade e tipo, pulando o bairro', () => {
    const recorte = lerRecorte('comprar', ['goiania-go', 'apartamento']);
    expect(recorte?.tipo).toBe('apartamento');
    expect(recorte?.bairro).toBeNull();
  });

  it('cidade, bairro, tipo e quartos', () => {
    expect(lerRecorte('alugar', ['goiania-go', 'setor-bueno', 'apartamento', '2-quartos'])).toEqual(
      {
        finalidade: 'alugar',
        cidade: 'goiania-go',
        bairro: 'setor-bueno',
        tipo: 'apartamento',
        quartos: 2,
      },
    );
  });

  it('recusa caminho fora da ordem ou inventado', () => {
    // Quartos sem tipo.
    expect(lerRecorte('alugar', ['goiania-go', 'setor-bueno', '2-quartos'])).toBeNull();
    // Tipo antes do bairro.
    expect(lerRecorte('alugar', ['goiania-go', 'apartamento', 'setor-bueno'])).toBeNull();
    // Dois bairros.
    expect(lerRecorte('alugar', ['goiania-go', 'setor-bueno', 'setor-oeste'])).toBeNull();
    // Segmento com caractere inválido.
    expect(lerRecorte('alugar', ['goiania-go', 'Setor Bueno'])).toBeNull();
    // Fundo de poço: muitos segmentos.
    expect(lerRecorte('alugar', ['a', 'b', 'c', 'd', 'e'])).toBeNull();
    // Sem cidade.
    expect(lerRecorte('alugar', [])).toBeNull();
  });

  it('o caminho canônico volta igual ao que foi lido', () => {
    const segmentos = ['goiania-go', 'setor-bueno', 'apartamento', '3-quartos'];
    const recorte = lerRecorte('alugar', segmentos);
    expect(recorte).not.toBeNull();
    if (recorte === null) {
      return;
    }
    expect(caminhoDoRecorte(recorte)).toBe(`/alugar/${segmentos.join('/')}`);
  });
});

describe('nomes legíveis', () => {
  it('cidade com UF', () => {
    expect(cidadeLegivel('goiania-go')).toBe('Goiania, GO');
    expect(cidadeLegivel('sao-paulo-sp')).toBe('Sao Paulo, SP');
  });

  it('bairro', () => {
    expect(lugarLegivel('setor-bueno')).toBe('Setor Bueno');
  });
});

describe('vocabulário de tipo entre portal e domínio', () => {
  it('ida e volta', () => {
    expect(TIPO_NO_DOMINIO.apartamento).toBe('APARTMENT');
    expect(tipoDoDominio('APARTMENT')).toBe('apartamento');
    expect(tipoDoDominio('PENTHOUSE')).toBe('cobertura');
    // LAND não tem página de tipo no portal.
    expect(tipoDoDominio('LAND')).toBeNull();
    expect(tipoDoDominio('INVENTADO')).toBeNull();
  });
});

const CARD: PublicListingCard = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'apartamento-setor-bueno',
  title: 'Apartamento no Setor Bueno',
  purpose: 'BOTH',
  propertyType: 'PENTHOUSE',
  neighborhood: 'Setor Bueno',
  neighborhoodSlug: 'setor-bueno',
  city: 'Goiânia',
  citySlug: 'goiania-go',
  state: 'GO',
  monthlyRentCents: 240_000,
  condoFeeCents: 42_000,
  iptuCents: 9_000,
  totalMonthlyCents: 291_000,
  salePriceCents: 98_000_000,
  pricePerSqmCents: 1_400_000,
  bedrooms: 2,
  bathrooms: 2,
  parkingSpots: 1,
  areaSqm: 70,
  photoCount: 8,
  coverPath: '/public/media/abc',
  coverCaption: 'Sala',
  publishedAt: '2026-09-20T12:00:00.000Z',
  org: { slug: 'imobiliaria-exemplo', name: 'Imobiliária Exemplo', creci: 'GO-00000' },
};

describe('card da API vira card do design', () => {
  it('traduz finalidade e tipo', () => {
    const imovel = imovelDaApi(CARD);
    expect(imovel.finalidade).toBe('ambos');
    expect(imovel.tipo).toBe('cobertura');
    expect(imovel.bairro).toBe('Setor Bueno');
    expect(imovel.totalMensalCents).toBe(291_000);
    expect(imovel.precoVendaCents).toBe(98_000_000);
    expect(imovel.fotoUrl).toBe('/public/media/abc');
  });

  it('tipo sem cor no design cai no neutro, sem quebrar a tela', () => {
    expect(imovelDaApi({ ...CARD, propertyType: 'LAND' }).tipo).toBe('sala-loja');
  });

  it('sem CRECI, não inventa anunciante', () => {
    const semCreci = imovelDaApi({ ...CARD, org: { ...CARD.org, creci: null } });
    expect(semCreci.anunciante).toBeNull();
  });
});
