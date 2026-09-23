import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import {
  PROPERTY_PURPOSES,
  assertTermsMatchPurpose,
  isPropertyPurpose,
  pricePerSquareMeterCents,
  purposeNeedsRent,
  purposeNeedsSalePrice,
} from './purpose.js';

describe('finalidade do imóvel', () => {
  it('vocabulário fechado', () => {
    expect([...PROPERTY_PURPOSES]).toEqual(['RENT', 'SALE', 'BOTH']);
    expect(isPropertyPurpose('BOTH')).toBe(true);
    expect(isPropertyPurpose('VENDA')).toBe(false);
  });

  it('o que cada finalidade exige', () => {
    expect(purposeNeedsRent('RENT')).toBe(true);
    expect(purposeNeedsRent('BOTH')).toBe(true);
    expect(purposeNeedsRent('SALE')).toBe(false);
    expect(purposeNeedsSalePrice('SALE')).toBe(true);
    expect(purposeNeedsSalePrice('BOTH')).toBe(true);
    expect(purposeNeedsSalePrice('RENT')).toBe(false);
  });

  it('aluguel e venda juntos passam quando os dois valores existem', () => {
    expect(() => {
      assertTermsMatchPurpose('BOTH', { monthlyRentCents: 250_000, salePriceCents: 74_000_000 });
    }).not.toThrow();
  });

  it('imóvel à venda sem preço é recusado antes de virar anúncio', () => {
    try {
      assertTermsMatchPurpose('SALE', { monthlyRentCents: null, salePriceCents: null });
      expect.unreachable('devia recusar');
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_INPUT');
      expect((error as DomainError).details).toMatchObject({ field: 'salePriceCents' });
    }
  });

  it('imóvel para alugar sem aluguel é recusado', () => {
    expect(() => {
      assertTermsMatchPurpose('RENT', { monthlyRentCents: null, salePriceCents: null });
    }).toThrow(DomainError);
  });

  it('valor que não pertence à finalidade também é recusado', () => {
    expect(() => {
      assertTermsMatchPurpose('RENT', { monthlyRentCents: 250_000, salePriceCents: 74_000_000 });
    }).toThrow(/não tem preço de venda/);
    expect(() => {
      assertTermsMatchPurpose('SALE', { monthlyRentCents: 250_000, salePriceCents: 74_000_000 });
    }).toThrow(/não tem valor de aluguel/);
  });

  it('teto de centavos vale para o preço de venda', () => {
    expect(() => {
      assertTermsMatchPurpose('SALE', { monthlyRentCents: null, salePriceCents: 100_000_001 });
    }).toThrow(/teto/);
    expect(() => {
      assertTermsMatchPurpose('SALE', { monthlyRentCents: null, salePriceCents: 100_000_000 });
    }).not.toThrow();
  });

  it('preço por m² só existe com área', () => {
    expect(pricePerSquareMeterCents(74_000_000, 68)).toBe(1_088_235);
    expect(pricePerSquareMeterCents(74_000_000, null)).toBeNull();
    expect(pricePerSquareMeterCents(74_000_000, 0)).toBeNull();
    expect(pricePerSquareMeterCents(null, 68)).toBeNull();
  });
});
