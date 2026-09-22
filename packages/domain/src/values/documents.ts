import { DomainError } from '../errors.js';
import type { IdentityKind } from '../crm/dedupe.js';
import { normalizeDocument, normalizeEmail, normalizePhone } from './identifiers.js';

/**
 * Dígito verificador de CPF e CNPJ (auditoria 2026-09-10, P2-01: `12345678900` era aceito).
 * Validar o dígito é regra de domínio — a rota só aplica.
 */

function allSameDigits(digits: string): boolean {
  return digits.split('').every((digit) => digit === digits[0]);
}

/** Dígito verificador do CPF (módulo 11, pesos decrescentes). */
function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Number(digits[index]) * (length + 1 - index);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

/** CPF válido: 11 dígitos, não todos iguais, com os dois dígitos verificadores certos. */
export function isValidCpf(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== 11 || allSameDigits(digits)) {
    return false;
  }
  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
}

const CNPJ_WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_WEIGHTS_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

function cnpjCheckDigit(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < weights.length; index += 1) {
    sum += Number(digits[index]) * (weights[index] ?? 0);
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ válido: 14 dígitos, não todos iguais, com os dois dígitos verificadores certos. */
export function isValidCnpj(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== 14 || allSameDigits(digits)) {
    return false;
  }
  return (
    cnpjCheckDigit(digits, CNPJ_WEIGHTS_FIRST) === Number(digits[12]) &&
    cnpjCheckDigit(digits, CNPJ_WEIGHTS_SECOND) === Number(digits[13])
  );
}

/** CPF (11 dígitos) ou CNPJ (14) formatado; outro tamanho volta como veio. */
export function formatDocument(value: string): string {
  const digits = normalizeDocument(value);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return value;
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
/** Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular), com 13 aceito com +55. */
const PHONE_RE = /^\d{10,13}$/;
const PASSPORT_RE = /^[A-Za-z0-9]{5,20}$/;

/**
 * Valida o valor de uma identidade pelo tipo. CPF/CNPJ inválido, e-mail sem formato, telefone
 * curto e passaporte fora do padrão viram INVALID_INPUT (400 na rota).
 */
export function assertValidIdentityValue(kind: IdentityKind, value: string): void {
  switch (kind) {
    case 'CPF':
      if (!isValidCpf(value)) {
        throw new DomainError('INVALID_INPUT', 'CPF inválido (dígito verificador)', { kind });
      }
      return;
    case 'CNPJ':
      if (!isValidCnpj(value)) {
        throw new DomainError('INVALID_INPUT', 'CNPJ inválido (dígito verificador)', { kind });
      }
      return;
    case 'EMAIL':
      if (!EMAIL_RE.test(normalizeEmail(value))) {
        throw new DomainError('INVALID_INPUT', 'E-mail inválido', { kind });
      }
      return;
    case 'PHONE':
      if (!PHONE_RE.test(normalizePhone(value))) {
        throw new DomainError('INVALID_INPUT', 'Telefone inválido (DDD + número)', { kind });
      }
      return;
    case 'PASSPORT':
      if (!PASSPORT_RE.test(value.trim())) {
        throw new DomainError('INVALID_INPUT', 'Passaporte inválido', { kind });
      }
      return;
  }
}
