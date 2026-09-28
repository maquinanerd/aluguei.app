import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { renderTemplate } from './template.js';
import {
  SALE_CONTRACT_TEMPLATE_VARIABLES,
  buildContractVariables,
  buildSaleContractVariables,
  formatCentsBRL,
} from './variables.js';

describe('formatCentsBRL (P2-08: valores em R$ no corpo do contrato)', () => {
  it('formata centavos inteiros sem ponto flutuante', () => {
    expect(formatCentsBRL(250_000)).toBe('R$ 2.500,00');
    expect(formatCentsBRL(5)).toBe('R$ 0,05');
    expect(formatCentsBRL(0)).toBe('R$ 0,00');
    expect(formatCentsBRL(123_456_789)).toBe('R$ 1.234.567,89');
    expect(formatCentsBRL(-1_050)).toBe('-R$ 10,50');
  });

  it('recusa valor que não é centavo inteiro seguro', () => {
    expect(() => formatCentsBRL(10.5)).toThrow(DomainError);
    expect(() => formatCentsBRL(Number.MAX_SAFE_INTEGER + 1)).toThrow(DomainError);
  });
});

describe('buildContractVariables', () => {
  const source = {
    tenantName: 'Ana',
    landlordName: 'Bia',
    propertyTitle: 'Apto 12',
    monthlyRentCents: 250_000,
  };

  it('oferece o aluguel em R$, também no nome legado monthlyRentCents', () => {
    expect(buildContractVariables(source)).toEqual({
      tenantName: 'Ana',
      landlordName: 'Bia',
      propertyTitle: 'Apto 12',
      monthlyRent: 'R$ 2.500,00',
      monthlyRentCents: 'R$ 2.500,00',
    });
  });

  it('dado ausente vira "—", nunca R$ 0,00', () => {
    expect(
      buildContractVariables({
        tenantName: null,
        landlordName: null,
        propertyTitle: null,
        monthlyRentCents: null,
      }),
    ).toEqual({
      tenantName: '—',
      landlordName: '—',
      propertyTitle: '—',
      monthlyRent: '—',
      monthlyRentCents: '—',
    });
  });

  it('template não precisa usar todas as variáveis oferecidas; placeholder desconhecido falha', () => {
    const variables = buildContractVariables(source);
    expect(renderTemplate('LOCATÁRIO {{tenantName}} · ALUGUEL {{monthlyRent}}', variables)).toBe(
      'LOCATÁRIO Ana · ALUGUEL R$ 2.500,00',
    );
    expect(() => renderTemplate('LOCATÁRIO {{tenantNome}}', variables)).toThrow(DomainError);
  });
});

/**
 * Contrato de compra e venda (Onda 5). A lista de variáveis é separada da de
 * locação de propósito: as duas espécies falam de partes diferentes, e um
 * template de locação oferecendo `salePrice` nunca teria valor para preencher.
 */
describe('variáveis do contrato de compra e venda', () => {
  it('formata o preço em R$ e usa travessão para dado ausente', () => {
    expect(
      buildSaleContractVariables({
        buyerName: 'Otavio Prado',
        sellerName: 'Imobiliária Exemplo',
        propertyTitle: 'Cobertura 210 m2',
        saleAmountCents: 139_000_000,
      }),
    ).toEqual({
      buyerName: 'Otavio Prado',
      sellerName: 'Imobiliária Exemplo',
      propertyTitle: 'Cobertura 210 m2',
      salePrice: 'R$ 1.390.000,00',
    });
  });

  it('preço ausente vira travessão, nunca R$ 0,00', () => {
    const variaveis = buildSaleContractVariables({
      buyerName: null,
      sellerName: null,
      propertyTitle: null,
      saleAmountCents: null,
    });
    expect(variaveis.salePrice).toBe('—');
    expect(Object.values(variaveis).every((valor) => valor === '—')).toBe(true);
  });

  it('não oferece variável de locação no contrato de venda', () => {
    expect(SALE_CONTRACT_TEMPLATE_VARIABLES).not.toContain('monthlyRent');
    expect(SALE_CONTRACT_TEMPLATE_VARIABLES).not.toContain('tenantName');
  });
});
