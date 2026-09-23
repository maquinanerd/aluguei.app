import { DomainError } from '../errors.js';
import { MAX_AMOUNT_CENTS } from '../finance/money.js';

/**
 * Finalidade do imóvel (entrega de design do AchouImóvel): o mesmo imóvel pode
 * estar para alugar, à venda, ou os dois. Até a Onda 2A o sistema só conhecia
 * aluguel — todo imóvel que já existe é `RENT`.
 */
export const PROPERTY_PURPOSES = ['RENT', 'SALE', 'BOTH'] as const;

export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];

export function isPropertyPurpose(value: string): value is PropertyPurpose {
  return (PROPERTY_PURPOSES as readonly string[]).includes(value);
}

/** Precisa de aluguel mensal? */
export function purposeNeedsRent(purpose: PropertyPurpose): boolean {
  return purpose === 'RENT' || purpose === 'BOTH';
}

/** Precisa de preço de venda? */
export function purposeNeedsSalePrice(purpose: PropertyPurpose): boolean {
  return purpose === 'SALE' || purpose === 'BOTH';
}

export interface PropertyTerms {
  monthlyRentCents: number | null;
  salePriceCents: number | null;
}

/**
 * Os valores precisam bater com a finalidade: imóvel à venda sem preço, ou para
 * alugar sem aluguel, não pode ser anunciado — o portal mostraria um card sem
 * valor. Valor que sobra (aluguel num imóvel só de venda) também é recusado, em
 * vez de ficar escondido no banco esperando aparecer numa tela.
 */
export function assertTermsMatchPurpose(purpose: PropertyPurpose, terms: PropertyTerms): void {
  if (purposeNeedsRent(purpose) && terms.monthlyRentCents === null) {
    throw new DomainError('INVALID_INPUT', 'Imóvel para alugar precisa do valor do aluguel', {
      field: 'monthlyRentCents',
      purpose,
    });
  }
  if (!purposeNeedsRent(purpose) && terms.monthlyRentCents !== null) {
    throw new DomainError('INVALID_INPUT', 'Imóvel só à venda não tem valor de aluguel', {
      field: 'monthlyRentCents',
      purpose,
    });
  }
  if (purposeNeedsSalePrice(purpose) && terms.salePriceCents === null) {
    throw new DomainError('INVALID_INPUT', 'Imóvel à venda precisa do preço', {
      field: 'salePriceCents',
      purpose,
    });
  }
  if (!purposeNeedsSalePrice(purpose) && terms.salePriceCents !== null) {
    throw new DomainError('INVALID_INPUT', 'Imóvel só para alugar não tem preço de venda', {
      field: 'salePriceCents',
      purpose,
    });
  }
  for (const [campo, valor] of [
    ['monthlyRentCents', terms.monthlyRentCents],
    ['salePriceCents', terms.salePriceCents],
  ] as const) {
    if (valor !== null && (valor < 0 || valor > MAX_AMOUNT_CENTS)) {
      throw new DomainError('INVALID_INPUT', 'Valor fora do teto aceito pelo sistema', {
        field: campo,
        max: MAX_AMOUNT_CENTS,
      });
    }
  }
}

/** Preço por m² em centavos, arredondado. Sem área, não existe — e não é inventado. */
export function pricePerSquareMeterCents(
  salePriceCents: number | null,
  areaSqm: number | null,
): number | null {
  if (salePriceCents === null || areaSqm === null || areaSqm <= 0) {
    return null;
  }
  return Math.round(salePriceCents / areaSqm);
}
