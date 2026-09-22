import { describe, expect, it } from 'vitest';
import { DomainError } from '../errors.js';
import { assertValidIdentityValue, formatDocument, isValidCnpj, isValidCpf } from './documents.js';

/**
 * Auditoria 2026-09-10, P2-01: `POST /parties` aceitava `12345678900` como CPF — nenhum
 * dígito verificador era conferido. O dígito é regra de domínio, não de formato.
 */
describe('documento: dígito verificador', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    for (const cpf of ['52998224725', '529.982.247-25', '111.444.777-35', '39053344705']) {
      expect(isValidCpf(cpf), cpf).toBe(true);
    }
  });

  it('recusa CPF com dígito verificador errado', () => {
    // O `12345678900` da auditoria e os vizinhos de um CPF válido.
    for (const cpf of ['12345678900', '12345678901', '52998224724', '11144477736']) {
      expect(isValidCpf(cpf), cpf).toBe(false);
    }
  });

  it('recusa CPF de dígitos repetidos, mesmo os que passam no módulo 11', () => {
    for (const digit of '0123456789') {
      const cpf = digit.repeat(11);
      expect(isValidCpf(cpf), cpf).toBe(false);
    }
  });

  it('recusa CPF com quantidade de dígitos diferente de 11', () => {
    for (const cpf of ['', '5299822472', '529982247250', 'abc', '5299822472a']) {
      expect(isValidCpf(cpf), JSON.stringify(cpf)).toBe(false);
    }
  });

  it('aceita CNPJ válido com ou sem máscara', () => {
    for (const cnpj of ['11222333000181', '11.222.333/0001-81', '11444777000161']) {
      expect(isValidCnpj(cnpj), cnpj).toBe(true);
    }
  });

  it('recusa CNPJ com dígito verificador errado, repetido ou de tamanho errado', () => {
    for (const cnpj of [
      '11222333000180',
      '11222333000191',
      '00000000000000',
      '11111111111111',
      '1122233300018',
      '112223330001811',
    ]) {
      expect(isValidCnpj(cnpj), cnpj).toBe(false);
    }
  });

  it('formata CPF e CNPJ e devolve o resto como veio', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocument('123')).toBe('123');
  });
});

describe('identidade da pessoa: validação por tipo', () => {
  it('CPF e CNPJ inválidos viram INVALID_INPUT', () => {
    for (const [kind, value] of [
      ['CPF', '12345678900'],
      ['CPF', '11111111111'],
      ['CNPJ', '11222333000180'],
    ] as const) {
      let error: unknown;
      try {
        assertValidIdentityValue(kind, value);
      } catch (err) {
        error = err;
      }
      expect(error, `${kind} ${value}`).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_INPUT');
    }
  });

  it('CPF no lugar de CNPJ (e vice-versa) é recusado pelo tamanho', () => {
    expect(() => {
      assertValidIdentityValue('CNPJ', '52998224725');
    }).toThrow(DomainError);
    expect(() => {
      assertValidIdentityValue('CPF', '11222333000181');
    }).toThrow(DomainError);
  });

  it('e-mail, telefone e passaporte seguem as próprias regras', () => {
    expect(() => {
      assertValidIdentityValue('EMAIL', 'pessoa@exemplo.com');
    }).not.toThrow();
    expect(() => {
      assertValidIdentityValue('EMAIL', 'pessoa-sem-arroba');
    }).toThrow(DomainError);
    // Telefone brasileiro: 10 (fixo) ou 11 dígitos (celular), com DDD.
    expect(() => {
      assertValidIdentityValue('PHONE', '11988887777');
    }).not.toThrow();
    expect(() => {
      assertValidIdentityValue('PHONE', '999');
    }).toThrow(DomainError);
    expect(() => {
      assertValidIdentityValue('PASSPORT', 'AB123456');
    }).not.toThrow();
  });

  it('documento válido passa com máscara (a rota normaliza antes de gravar)', () => {
    expect(() => {
      assertValidIdentityValue('CPF', '529.982.247-25');
    }).not.toThrow();
    expect(() => {
      assertValidIdentityValue('CNPJ', '11.222.333/0001-81');
    }).not.toThrow();
  });
});
