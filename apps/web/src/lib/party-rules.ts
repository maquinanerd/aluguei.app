/**
 * Regras da pessoa na interface (auditoria 2026-09-10, P2-01). Espelha
 * packages/domain/src/values/documents.ts sem importar o pacote de domínio no bundle do cliente;
 * party-rules.test.ts compara com o domínio. O servidor continua sendo a regra.
 */

export type IdentityKind = 'EMAIL' | 'PHONE' | 'CPF' | 'CNPJ' | 'PASSPORT';

export const IDENTITY_KIND_OPTIONS: ReadonlyArray<{ value: IdentityKind; label: string }> = [
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'PASSPORT', label: 'Passaporte' },
];

export const IDENTITY_KIND_LABELS: Record<string, string> = Object.fromEntries(
  IDENTITY_KIND_OPTIONS.map((option) => [option.value, option.label]),
);

/** Mesmo domínio fechado do CHECK de `party_documents.kind`. */
export const PARTY_DOCUMENT_KIND_OPTIONS = [
  { value: 'IDENTITY', label: 'Documento de identidade' },
  { value: 'CPF', label: 'CPF' },
  { value: 'PROOF_OF_INCOME', label: 'Comprovante de renda' },
  { value: 'PROOF_OF_ADDRESS', label: 'Comprovante de endereço' },
  { value: 'MARITAL_STATUS', label: 'Certidão de estado civil' },
  { value: 'COMPANY_BYLAWS', label: 'Contrato social' },
  { value: 'OTHER', label: 'Outro' },
] as const;

export const PARTY_DOCUMENT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  PARTY_DOCUMENT_KIND_OPTIONS.map((option) => [option.value, option.label]),
);

/** Tipos de arquivo aceitos no upload (mesmos da API). */
export const PARTY_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** 20 MB, o limite da API para documento. */
export const PARTY_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

const digitsOf = (value: string): string => value.replace(/\D/g, '');

function allSameDigits(digits: string): boolean {
  return digits.split('').every((digit) => digit === digits[0]);
}

function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Number(digits[index]) * (length + 1 - index);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

/** CPF válido: 11 dígitos, não todos iguais, dígitos verificadores certos. */
export function isValidCpf(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 11 || allSameDigits(digits)) {
    return false;
  }
  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
}

const CNPJ_WEIGHTS_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheckDigit(digits: string, weights: readonly number[]): number {
  let sum = 0;
  weights.forEach((weight, index) => {
    sum += Number(digits[index]) * weight;
  });
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ válido: 14 dígitos, não todos iguais, dígitos verificadores certos. */
export function isValidCnpj(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 14 || allSameDigits(digits)) {
    return false;
  }
  return (
    cnpjCheckDigit(digits, CNPJ_WEIGHTS_FIRST) === Number(digits[12]) &&
    cnpjCheckDigit(digits, CNPJ_WEIGHTS_SECOND) === Number(digits[13])
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10,13}$/;
const PASSPORT_RE = /^[A-Za-z0-9]{5,20}$/;

/** Mensagem de erro do identificador, ou `null` quando o domínio aceita. */
export function identityError(kind: IdentityKind, value: string): string | null {
  if (value.trim() === '') {
    return 'Informe o valor';
  }
  switch (kind) {
    case 'CPF':
      return isValidCpf(value) ? null : 'CPF inválido: confira os dígitos';
    case 'CNPJ':
      return isValidCnpj(value) ? null : 'CNPJ inválido: confira os dígitos';
    case 'EMAIL':
      return EMAIL_RE.test(value.trim().toLowerCase()) ? null : 'E-mail inválido';
    case 'PHONE':
      return PHONE_RE.test(digitsOf(value)) ? null : 'Telefone com DDD, só números';
    case 'PASSPORT':
      return PASSPORT_RE.test(value.trim()) ? null : 'Passaporte: de 5 a 20 letras e números';
  }
}

/** Valor do identificador para exibição (o banco guarda só os dígitos de CPF, CNPJ e telefone). */
export function formatIdentityValue(kind: string, value: string): string {
  const digits = digitsOf(value);
  if (kind === 'CPF' && digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (kind === 'CNPJ' && digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (kind === 'PHONE' && (digits.length === 10 || digits.length === 11)) {
    const local = digits.slice(2);
    const split = local.length - 4;
    return `(${digits.slice(0, 2)}) ${local.slice(0, split)}-${local.slice(split)}`;
  }
  return value;
}

/** Tamanho do arquivo para exibição. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
