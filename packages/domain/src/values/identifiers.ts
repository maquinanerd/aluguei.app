/** Normaliza e-mail para chave de busca/deduplicação (lowercase trim). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normaliza telefone: apenas dígitos. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Normaliza documento (CPF/CNPJ): apenas dígitos. */
export function normalizeDocument(document: string): string {
  return document.replace(/\D/g, '');
}

/** Gera slug simples a partir de um nome (organizações). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
