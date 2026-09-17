import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { renderTemplate } from './template.js';
import { buildContractVariables, formatCentsBRL } from './variables.js';

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
