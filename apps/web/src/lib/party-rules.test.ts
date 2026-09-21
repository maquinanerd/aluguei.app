import { describe, expect, it } from 'vitest';
import {
  assertValidIdentityValue,
  isValidCnpj as domainIsValidCnpj,
  isValidCpf as domainIsValidCpf,
} from '@aluguei/domain';
import type { IdentityKind } from '@aluguei/domain';
import {
  formatIdentityValue,
  identityError,
  isValidCnpj,
  isValidCpf,
  PARTY_DOCUMENT_KIND_OPTIONS,
} from './party-rules';

/**
 * G3, trilha D (auditoria 2026-09-10, P2-01): a tela confere CPF e CNPJ antes de enviar. A regra
 * espelha o domínio sem importá-lo no bundle do cliente; aqui ela é comparada com a do domínio.
 */

/** Sequência determinística (LCG) para gerar documentos de teste. */
function numbers(seed: number, count: number, length: number): string[] {
  let state = seed;
  const out: string[] = [];
  for (let n = 0; n < count; n += 1) {
    let digits = '';
    for (let i = 0; i < length; i += 1) {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      digits += String(state % 10);
    }
    out.push(digits);
  }
  return out;
}

/** Cada dígito de um documento válido trocado por todos os outros (vizinhos inválidos e válidos). */
function mutations(valid: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < valid.length; i += 1) {
    for (const digit of '0123456789') {
      out.push(`${valid.slice(0, i)}${digit}${valid.slice(i + 1)}`);
    }
  }
  return out;
}

const VALID_CPFS = ['52998224725', '11144477735', '39053344705', '15350946056', '24681357928'];
const VALID_CNPJS = ['11222333000181', '11444777000161', '12345678000195'];

describe('dígito verificador na tela = domínio', () => {
  it('CPF: válidos, vizinhos, repetidos e 2.000 números gerados', () => {
    const samples = [
      ...VALID_CPFS,
      ...VALID_CPFS.flatMap(mutations),
      ...'0123456789'.split('').map((d) => d.repeat(11)),
      ...numbers(7, 2_000, 11),
      '',
      '529.982.247-25',
      '5299822472',
    ];
    for (const cpf of samples) {
      expect(isValidCpf(cpf), cpf).toBe(domainIsValidCpf(cpf));
    }
    expect(samples.filter((cpf) => isValidCpf(cpf)).length).toBeGreaterThan(VALID_CPFS.length);
  });

  it('CNPJ: válidos, vizinhos, repetidos e 2.000 números gerados', () => {
    const samples = [
      ...VALID_CNPJS,
      ...VALID_CNPJS.flatMap(mutations),
      ...'0123456789'.split('').map((d) => d.repeat(14)),
      ...numbers(11, 2_000, 14),
      '11.222.333/0001-81',
      '1122233300018',
    ];
    for (const cnpj of samples) {
      expect(isValidCnpj(cnpj), cnpj).toBe(domainIsValidCnpj(cnpj));
    }
  });

  it('erro da identidade na tela só quando o domínio recusa', () => {
    const cases: Array<[IdentityKind, string]> = [
      ['CPF', '12345678900'],
      ['CPF', '529.982.247-25'],
      ['CPF', '11111111111'],
      ['CNPJ', '11222333000180'],
      ['CNPJ', '11.222.333/0001-81'],
      ['CNPJ', '52998224725'],
      ['EMAIL', 'pessoa@exemplo.com'],
      ['EMAIL', 'Pessoa@Exemplo.COM'],
      ['EMAIL', 'sem-arroba'],
      ['EMAIL', 'a@b'],
      ['PHONE', '(11) 98888-7777'],
      ['PHONE', '999'],
      ['PHONE', '+55 11 98888-7777'],
      ['PASSPORT', 'AB123456'],
      ['PASSPORT', 'AB 1'],
    ];
    for (const [kind, value] of cases) {
      let domainAccepts = true;
      try {
        assertValidIdentityValue(kind, value);
      } catch {
        domainAccepts = false;
      }
      expect(identityError(kind, value) === null, `${kind} ${value}`).toBe(domainAccepts);
    }
    expect(identityError('CPF', '12345678900')).toBe('CPF inválido: confira os dígitos');
    expect(identityError('CPF', '   ')).toBe('Informe o valor');
  });
});

describe('apresentação', () => {
  it('formata CPF, CNPJ e telefone; o resto volta como veio', () => {
    expect(formatIdentityValue('CPF', '52998224725')).toBe('529.982.247-25');
    expect(formatIdentityValue('CNPJ', '11222333000181')).toBe('11.222.333/0001-81');
    expect(formatIdentityValue('PHONE', '11988887777')).toBe('(11) 98888-7777');
    expect(formatIdentityValue('PHONE', '1133334444')).toBe('(11) 3333-4444');
    expect(formatIdentityValue('EMAIL', 'a@b.com')).toBe('a@b.com');
  });

  it('tipos de documento são os mesmos do CHECK do banco', () => {
    expect(PARTY_DOCUMENT_KIND_OPTIONS.map((option) => option.value)).toEqual([
      'IDENTITY',
      'CPF',
      'PROOF_OF_INCOME',
      'PROOF_OF_ADDRESS',
      'MARITAL_STATUS',
      'COMPANY_BYLAWS',
      'OTHER',
    ]);
  });
});
