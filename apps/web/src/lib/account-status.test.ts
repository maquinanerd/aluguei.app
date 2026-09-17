import { describe, expect, it } from 'vitest';
import { destinationFor, formatDocument, formatPhone } from './account-status';

describe('destino depois de entrar ou cadastrar', () => {
  it('imobiliária ativa vai ao painel', () => {
    expect(destinationFor({ activeOrg: { status: 'ACTIVE' }, platformAdmin: false })).toBe('/app');
    expect(destinationFor({ activeOrg: { status: 'ACTIVE' }, platformAdmin: true })).toBe('/app');
  });

  it('imobiliária em análise, suspensa ou recusada vai à situação da conta', () => {
    for (const status of ['PENDING_APPROVAL', 'SUSPENDED', 'REJECTED'] as const) {
      expect(destinationFor({ activeOrg: { status }, platformAdmin: false })).toBe(
        '/situacao-da-conta',
      );
    }
  });

  it('admin da plataforma sem imobiliária vai à plataforma; sem nada, ao cadastro', () => {
    expect(destinationFor({ activeOrg: null, platformAdmin: true })).toBe('/plataforma');
    expect(destinationFor({ activeOrg: null, platformAdmin: false })).toBe('/register');
  });
});

describe('formatação dos dados do cadastro', () => {
  it('CPF e CNPJ', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocument(null)).toBe('—');
    expect(formatDocument('123')).toBe('123');
  });

  it('telefone com DDD, com ou sem código do país', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
    expect(formatPhone('5511987654321')).toBe('(11) 98765-4321');
    expect(formatPhone(null)).toBe('—');
  });
});
