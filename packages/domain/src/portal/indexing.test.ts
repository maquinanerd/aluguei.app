import { describe, expect, it } from 'vitest';
import {
  MIN_LISTINGS_TO_INDEX,
  MIN_LISTINGS_TO_INDEX_WITH_MODIFIER,
  MIN_SAMPLE_FOR_STATS,
  isIndexablePage,
  medianCents,
  robotsFor,
  showsPriceStats,
} from './indexing.js';
import { citySlug, parseCitySlug, slugifyPlace } from './place-slug.js';

/** ADR-099: a régua de indexação do portal vive no domínio, não na página. */
describe('indexação das páginas de busca', () => {
  it('os três limiares são os do documento de SEO', () => {
    expect(MIN_LISTINGS_TO_INDEX).toBe(3);
    expect(MIN_SAMPLE_FOR_STATS).toBe(5);
    expect(MIN_LISTINGS_TO_INDEX_WITH_MODIFIER).toBe(5);
  });

  it('indexa com 3 anúncios; com 2 a página vive, mas não indexa', () => {
    expect(isIndexablePage({ count: 3 })).toBe(true);
    expect(isIndexablePage({ count: 2 })).toBe(false);
    expect(isIndexablePage({ count: 0 })).toBe(false);
    expect(robotsFor({ count: 2 })).toBe('noindex, follow');
    expect(robotsFor({ count: 12 })).toBe('index, follow');
  });

  it('recorte com modificador exige 5', () => {
    expect(isIndexablePage({ count: 4, hasModifier: true })).toBe(false);
    expect(isIndexablePage({ count: 5, hasModifier: true })).toBe(true);
  });

  it('página 2 e filtro em query string nunca indexam', () => {
    expect(isIndexablePage({ count: 50, page: 2 })).toBe(false);
    expect(isIndexablePage({ count: 50, hasQueryFilters: true })).toBe(false);
  });

  it('estatística some com amostra pequena', () => {
    expect(showsPriceStats(5)).toBe(true);
    expect(showsPriceStats(4)).toBe(false);
  });

  it('mediana só com amostra suficiente, e sem casa decimal perdida', () => {
    expect(medianCents([100, 200, 300, 400])).toBeNull();
    expect(medianCents([100, 200, 300, 400, 500])).toBe(300);
    expect(medianCents([100, 200, 300, 400, 500, 601])).toBe(350);
  });
});

describe('slug de lugar', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(slugifyPlace('Goiânia')).toBe('goiania');
    expect(slugifyPlace('Setor Bueno')).toBe('setor-bueno');
    expect(slugifyPlace("Santa Bárbara d'Oeste")).toBe('santa-barbara-d-oeste');
    expect(slugifyPlace('  ')).toBe('');
  });

  it('cidade sempre com UF', () => {
    expect(citySlug('Goiânia', 'GO')).toBe('goiania-go');
    expect(citySlug('São Paulo', 'sp')).toBe('sao-paulo-sp');
    expect(citySlug('Goiânia', 'Goiás')).toBeNull();
    expect(citySlug('', 'GO')).toBeNull();
  });

  it('o slug da cidade volta a virar cidade e UF', () => {
    expect(parseCitySlug('goiania-go')).toEqual({ city: 'goiania', state: 'go' });
    expect(parseCitySlug('sao-paulo-sp')).toEqual({ city: 'sao-paulo', state: 'sp' });
    expect(parseCitySlug('goiania')).toBeNull();
    expect(parseCitySlug('-go')).toBeNull();
  });
});
